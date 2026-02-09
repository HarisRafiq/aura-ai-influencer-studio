/**
 * Orchestrator Service - API client for content orchestrator
 * Uses production-ready HTTP client with retry, caching, and error handling
 */

import { httpClient } from './http-client';
import { ENDPOINTS } from './config';
import type {
  OrchestratorSession,
  StartOrchestratorRequest,
  StartOrchestratorResponse,
  EditPlanRequest,
  SelectionsRequest,
  RetrySubTaskRequest,
  RetrySubTaskResponse,
} from './api-types';

// Re-export types for backward compatibility
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
} from './api-types';

/**
 * Start a new orchestrator session
 */
export async function startOrchestrator(
  request: StartOrchestratorRequest
): Promise<StartOrchestratorResponse> {
  return httpClient.post<StartOrchestratorResponse>(
    ENDPOINTS.ORCHESTRATOR_START,
    request
  );
}

/**
 * Get orchestrator session details
 */
export async function getOrchestratorSession(
  sessionId: string
): Promise<OrchestratorSession> {
  return httpClient.get<OrchestratorSession>(
    ENDPOINTS.ORCHESTRATOR_SESSION(sessionId),
    { skipCache: true } // Don't cache session state
  );
}

/**
 * Edit research plan
 */
export async function editPlan(
  sessionId: string,
  request: EditPlanRequest
): Promise<{ message: string }> {
  return httpClient.patch<{ message: string }>(
    ENDPOINTS.ORCHESTRATOR_PLAN(sessionId),
    request
  );
}

/**
 * Submit user selections
 */
export async function submitSelections(
  sessionId: string,
  request: SelectionsRequest
): Promise<{ message: string }> {
  return httpClient.post<{ message: string }>(
    ENDPOINTS.ORCHESTRATOR_SELECTIONS(sessionId),
    request
  );
}

/**
 * Retry a sub-task
 */
export async function retrySubTask(
  sessionId: string,
  subtaskId: string,
  request: RetrySubTaskRequest = {}
): Promise<RetrySubTaskResponse> {
  return httpClient.post<RetrySubTaskResponse>(
    ENDPOINTS.ORCHESTRATOR_RETRY_SUBTASK(sessionId, subtaskId),
    request
  );
}

/**
 * Reset/delete orchestrator session
 */
export async function resetSession(
  sessionId: string
): Promise<{ message: string }> {
  return httpClient.delete<{ message: string }>(
    ENDPOINTS.ORCHESTRATOR_SESSION(sessionId)
  );
}

// SSE Event Types (re-exported for backward compatibility)
export type OrchestratorEventType =
  | 'orch_planning'
  | 'orch_plan_ready'
  | 'orch_researching'
  | 'orch_research_ready'
  | 'orch_analyzing_images'
  | 'orch_generating'
  | 'orch_post_ready'
  | 'orch_question'
  | 'orch_error';

export interface OrchestratorEvent {
  message: string;
  [key: string]: any;
}