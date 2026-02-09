import React from 'react';
import { SSE_BASE_URL, sseConfig } from './config';
import type { SSEEventType, SSEEvent } from './api-types';

// Re-export types
export type { SSEEventType, SSEEvent } from './api-types';

export type SSECallback = (event: SSEEvent, eventType: SSEEventType) => void;

interface Subscription {
  resourceId: string;
  callback: SSECallback;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}

/**
 * SSE Manager - Handles Server-Sent Events connections with multiplexing
 * Supports subscribing to multiple resources through a single stream
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Heartbeat monitoring
 * - Resource multiplexing
 * - Error recovery
 */
export class SSEManager {
  private eventSource: EventSource | null = null;
  private subscriptions: Map<string, Set<SSECallback>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private isManualClose = false;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private stateChangeListeners: Set<(state: ConnectionState) => void> = new Set();
  private lastHeartbeat: number = Date.now();

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Add connection state listener
   */
  addStateListener(listener: (state: ConnectionState) => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.stateChangeListeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          console.error('[SSE] Error in state listener:', error);
        }
      });
    }
  }

  /**
   * Subscribe to updates for a resource
   * @param resourceId Resource identifier (e.g., "session:123", "post:456", "influencer:789")
   * @param callback Function to call when events arrive for this resource
   */
  subscribe(resourceId: string, callback: SSECallback): () => void {
    const isNewResource = !this.subscriptions.has(resourceId);

    if (!this.subscriptions.has(resourceId)) {
      this.subscriptions.set(resourceId, new Set());
    }
    this.subscriptions.get(resourceId)!.add(callback);

    console.log(
      `[SSE] Subscribed to ${resourceId}. Total resources: ${this.subscriptions.size}`
    );

    // If this is a new resource and we're already connected, reconnect with updated list
    if (
      isNewResource &&
      this.eventSource &&
      this.eventSource.readyState !== EventSource.CLOSED
    ) {
      console.log(`[SSE] New resource added, reconnecting with updated list`);
      this.reconnect();
    } else {
      // Connect or update connection with new resources
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(resourceId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(resourceId);
          console.log(`[SSE] Unsubscribed from ${resourceId}`);
        }
      }

      // If no more subscriptions, close connection
      if (this.subscriptions.size === 0) {
        this.disconnect();
      } else {
        // Reconnect with updated resource list
        this.reconnect();
      }
    };
  }
  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatTimeout = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > sseConfig.heartbeatTimeout) {
        console.warn('[SSE] Heartbeat timeout, reconnecting...');
        this.reconnect();
      }
    }, sseConfig.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearInterval(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Update heartbeat timestamp
   */
  private updateHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Connect to SSE stream with all subscribed resources
   */
  private connect() {
    // If already connected with same resources, don't reconnect
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return;
    }

    if (this.subscriptions.size === 0) {
      return;
    }

    this.setConnectionState(ConnectionState.CONNECTING);

    const resourceIds = Array.from(this.subscriptions.keys());
    const resourceParam = resourceIds.join(',');
    const url = `${SSE_BASE_URL}/stream?resources=${encodeURIComponent(resourceParam)}`;

    console.log(`[SSE] Connecting to ${resourceIds.length} resources:`, resourceIds);

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        console.log('[SSE] Connection opened');
        this.setConnectionState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.eventSource.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        console.log('[SSE] Connected to resources:', data.resources);
        this.updateHeartbeat();
      });

      // Register all event handlers
      this.registerEventHandlers();

      this.eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        this.setConnectionState(ConnectionState.ERROR);
        this.stopHeartbeat();

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          console.log('[SSE] Connection closed, attempting reconnect...');
          if (!this.isManualClose) {
            this.scheduleReconnect();
          }
        }
      };
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      this.setConnectionState(ConnectionState.ERROR);
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Register all SSE event handlers
   */
  private registerEventHandlers(): void {
    if (!this.eventSource) return;

    // Handle status_update events
    this.eventSource.addEventListener('status_update', (e) => {
      try {
        this.updateHeartbeat();
        const payload = JSON.parse(e.data) as SSEEvent;
        this.notifySubscribers(payload.resource_id, payload, 'status_update');
      } catch (error) {
        console.error('[SSE] Error parsing status_update:', error);
      }
    });

    // Handle post_update events
    this.eventSource.addEventListener('post_update', (e) => {
      try {
        this.updateHeartbeat();
        const payload = JSON.parse(e.data) as SSEEvent;
        this.notifySubscribers(payload.resource_id, payload, 'post_update');
      } catch (error) {
        console.error('[SSE] Error parsing post_update:', error);
      }
    });

    // Handle video_status events
    this.eventSource.addEventListener('video_status', (e) => {
      try {
        this.updateHeartbeat();
        const payload = JSON.parse(e.data) as SSEEvent;
        this.notifySubscribers(payload.resource_id, payload, 'video_status');
      } catch (error) {
        console.error('[SSE] Error parsing video_status:', error);
      }
    });

    // Handle agent events
    const agentEvents: SSEEventType[] = [
      'agent_thinking',
      'agent_action',
      'agent_question',
      'agent_complete',
      'agent_error',
    ];
    for (const eventName of agentEvents) {
      this.eventSource.addEventListener(eventName, (e) => {
        try {
          this.updateHeartbeat();
          const payload = JSON.parse((e as MessageEvent).data) as SSEEvent;
          this.notifySubscribers(payload.resource_id, payload, eventName);
        } catch (error) {
          console.error(`[SSE] Error parsing ${eventName}:`, error);
        }
      });
    }

    // Handle orchestrator events
    const orchEvents: SSEEventType[] = [
      'orch_planning',
      'orch_plan_ready',
      'orch_researching',
      'orch_research_ready',
      'orch_generating',
      'orch_post_ready',
      'orch_question',
      'orch_error',
    ];
    for (const eventName of orchEvents) {
      this.eventSource.addEventListener(eventName, (e) => {
        try {
          this.updateHeartbeat();
          const payload = JSON.parse((e as MessageEvent).data) as SSEEvent;
          this.notifySubscribers(payload.resource_id, payload, eventName);
        } catch (error) {
          console.error(`[SSE] Error parsing ${eventName}:`, error);
        }
      });
    }

    // Handle generic message events
    this.eventSource.onmessage = (e) => {
      try {
        this.updateHeartbeat();
        const payload = JSON.parse(e.data) as SSEEvent;
        this.notifySubscribers(payload.resource_id, payload, 'message');
      } catch (error) {
        console.error('[SSE] Error parsing message:', error);
      }
    };
  }
  /**
   * Notify all subscribers for a specific resource
   */
  private notifySubscribers(
    resourceId: string,
    event: SSEEvent,
    eventType: SSEEventType
  ) {
    const callbacks = this.subscriptions.get(resourceId);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(event, eventType);
        } catch (error) {
          console.error(`[SSE] Error in callback for ${resourceId}:`, error);
        }
      });
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= sseConfig.maxReconnectAttempts) {
      console.error('[SSE] Max reconnection attempts reached');
      this.setConnectionState(ConnectionState.ERROR);
      return;
    }

    const delay = Math.min(
      sseConfig.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      sseConfig.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(
      `[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${sseConfig.maxReconnectAttempts})`
    );

    this.setConnectionState(ConnectionState.RECONNECTING);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Reconnect to SSE stream
   */
  private reconnect() {
    this.disconnect();
    this.connect();
  }

  /**
   * Disconnect from SSE stream
   */
  disconnect() {
    this.isManualClose = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('[SSE] Disconnected');
    }

    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.isManualClose = false;
  }

  /**
   * Disconnect and clear all subscriptions
   */
  destroy() {
    this.disconnect();
    this.subscriptions.clear();
    this.stateChangeListeners.clear();
    console.log('[SSE] Manager destroyed');
  }
}

// Global SSE manager instance
let globalSSEManager: SSEManager | null = null;

/**
 * Get the global SSE manager instance (singleton)
 */
export function getSSEManager(): SSEManager {
  if (!globalSSEManager) {
    globalSSEManager = new SSEManager();
  }
  return globalSSEManager;
}

/**
 * React hook for subscribing to SSE events
 * @param resourceId Resource to subscribe to (e.g., "session:123", "post:456")
 * @param callback Callback function for events
 * @param enabled Whether subscription is enabled (default: true)
 */
export function useSSESubscription(
  resourceId: string | null | undefined,
  callback: SSECallback,
  enabled = true
) {
  const [connectionState, setConnectionState] = React.useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );

  React.useEffect(() => {
    if (!resourceId || !enabled) {
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    const manager = getSSEManager();

    // Listen to connection state changes
    const removeStateListener = manager.addStateListener(setConnectionState);

    // Set initial state
    setConnectionState(manager.getConnectionState());

    // Subscribe to events
    const unsubscribe = manager.subscribe(resourceId, callback);

    return () => {
      unsubscribe();
      removeStateListener();
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [resourceId, callback, enabled]);

  return {
    isConnected: connectionState === ConnectionState.CONNECTED,
    connectionState,
  };
}