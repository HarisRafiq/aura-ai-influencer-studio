/**
 * Services Index
 * Central export point for all API services
 */

// Configuration
export * from './config';

// Error handling
export * from './errors';

// HTTP Client
export { httpClient, HttpClient } from './http-client';

// Types
export * from './api-types';

// API Services
export { api, influencerApi, postingApi } from './api';
export {
  startOrchestrator,
  getOrchestratorSession,
  editPlan,
  submitSelections,
  retrySubTask,
  resetSession,
} from './orchestrator';
export type {
  OrchestratorSession,
  StartOrchestratorRequest,
  EditPlanRequest,
  SelectionsRequest,
  RetrySubTaskRequest,
  SubTask,
  WebItem,
  ImageItem,
  SubTaskResults,
  UserSelections,
  GeneratedPost,
  OrchestratorPhase,
  OrchestratorEventType,
} from './orchestrator';
export { creationService } from './creation';
export { locationService } from './location';
export { createPost, getPost, deletePost } from './post_creation';

// SSE
export {
  SSEManager,
  ConnectionState,
  getSSEManager,
  useSSESubscription,
} from './sse';
export type { SSECallback } from './sse';

// Contexts (if needed elsewhere)
export { AuthProvider, useAuth } from './AuthContext';
export { InfluencerProvider, useInfluencers } from './InfluencerContext';
export { ToastProvider, useToast } from './ToastContext';
