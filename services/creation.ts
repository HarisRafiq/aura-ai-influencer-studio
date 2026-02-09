/**
 * Creation Service - API client for multi-step influencer creation flow
 * Uses production-ready HTTP client with retry, caching, and error handling
 */

import { httpClient } from './http-client';
import { ENDPOINTS } from './config';
import type {
  CreationSession,
  StartCreationRequest,
  SelectAvatarRequest,
  ConfirmCreationRequest,
  ConfirmCreationResponse,
  CreationStatus,
} from './api-types';

// Re-export types for backward compatibility
export type { CreationSession, CreationStatus } from './api-types';
export type { GeneratedPersona, Influencer as CreatedInfluencer } from './api-types';

export const creationService = {
  /**
   * Start a new creation session. Returns immediately while images generate in background.
   */
  async startCreation(location: string, prompt: string): Promise<CreationSession> {
    return httpClient.post<CreationSession>(
      ENDPOINTS.CREATION_START,
      { location, prompt } as StartCreationRequest
    );
  },

  /**
   * Get current session state. Use for polling during background processing.
   */
  async getSession(sessionId: string): Promise<CreationSession> {
    return httpClient.get<CreationSession>(
      ENDPOINTS.CREATION_SESSION(sessionId),
      { skipCache: true } // Don't cache session state
    );
  },

  /**
   * Select an avatar from the generated options. Triggers persona generation.
   */
  async selectAvatar(sessionId: string, avatarUrl: string): Promise<CreationSession> {
    return httpClient.post<CreationSession>(
      ENDPOINTS.CREATION_SELECT(sessionId),
      { avatar_url: avatarUrl } as SelectAvatarRequest
    );
  },

  /**
   * Confirm and create the influencer. Optionally pass updates to name/bio/niches.
   */
  async confirmCreation(
    sessionId: string,
    updates?: ConfirmCreationRequest
  ): Promise<ConfirmCreationResponse> {
    return httpClient.post<ConfirmCreationResponse>(
      ENDPOINTS.CREATION_CONFIRM(sessionId),
      updates || {}
    );
  },

  /**
   * Poll session until status matches one of the target statuses.
   * Returns the session when ready, or throws if failed/timeout.
   */
  async pollUntilReady(
    sessionId: string,
    targetStatuses: CreationStatus[],
    intervalMs: number = 2000,
    timeoutMs: number = 120000
  ): Promise<CreationSession> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const session = await this.getSession(sessionId);

      if (session.status === 'failed') {
        throw new Error(session.error || 'Creation failed');
      }

      if (targetStatuses.includes(session.status)) {
        return session;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Creation timed out');
  },

  /**
   * Get user's active (incomplete) creation session, if any.
   */
  async getActiveSession(): Promise<CreationSession | null> {
    const data = await httpClient.get<{ session: CreationSession | null }>(
      ENDPOINTS.CREATION_ACTIVE
    );
    return data.session;
  },

  /**
   * Discard a creation session (start over).
   */
  async discardSession(sessionId: string): Promise<void> {
    return httpClient.delete<void>(ENDPOINTS.CREATION_SESSION(sessionId));
  },
};