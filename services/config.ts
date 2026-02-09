/**
 * API Configuration
 * Centralized configuration for API endpoints and settings
 */

export interface ApiConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  logRequests: boolean;
}

// Environment-based configuration
const getEnv = () => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env;
  }
  return {} as any;
};

const env = getEnv();
const isDevelopment = env.MODE === 'development';
const isProduction = env.MODE === 'production';

// API Base URL with fallback
export const API_BASE_URL = env.VITE_API_URL || 'http://localhost:8000';

// SSE Base URL (can be different from API in some deployments)
export const SSE_BASE_URL = env.VITE_SSE_URL || API_BASE_URL;

// Default API Configuration
export const defaultApiConfig: ApiConfig = {
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second base delay
  cacheEnabled: true,
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  logRequests: isDevelopment,
};

// SSE Configuration
export const sseConfig = {
  baseURL: SSE_BASE_URL,
  maxReconnectAttempts: 10,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  heartbeatInterval: 30000, // 30 seconds
  heartbeatTimeout: 45000, // 45 seconds
};

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'aura_token',
  USER_DATA: 'aura_user',
  API_CACHE: 'aura_api_cache',
} as const;

// API Endpoints
export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGOUT: '/auth/logout',
  
  // Influencers
  INFLUENCERS: '/influencer',
  INFLUENCER_BY_ID: (id: string) => `/influencer/${id}`,
  INFLUENCER_TRAVEL: (id: string) => `/entities/influencers/${id}/travel`,
  
  // Posts
  POSTS_CREATE: '/postings/create',
  POSTS_BY_INFLUENCER: (id: string) => `/postings/influencer/${id}`,
  POST_BY_ID: (id: string) => `/postings/${id}`,
  
  // Creation
  CREATION_START: '/creation/start',
  CREATION_SESSION: (id: string) => `/creation/${id}`,
  CREATION_SELECT: (id: string) => `/creation/${id}/select`,
  CREATION_CONFIRM: (id: string) => `/creation/${id}/confirm`,
  CREATION_ACTIVE: '/creation',
  
  // Orchestrator
  ORCHESTRATOR_START: '/orchestrator/start',
  ORCHESTRATOR_SESSION: (id: string) => `/orchestrator/${id}`,
  ORCHESTRATOR_PLAN: (id: string) => `/orchestrator/${id}/plan`,
  ORCHESTRATOR_SELECTIONS: (id: string) => `/orchestrator/${id}/selections`,
  ORCHESTRATOR_RETRY_SUBTASK: (sessionId: string, subtaskId: string) => 
    `/orchestrator/${sessionId}/retry-subtask/${subtaskId}`,
  
  // Locations
  LOCATIONS_AUTOCOMPLETE: '/entities/locations/autocomplete',
  LOCATIONS_GEOCODE: '/entities/locations/geocode',
  
  // SSE Stream
  SSE_STREAM: '/stream',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'You are not authorized. Please log in.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Invalid request data.',
  UNKNOWN_ERROR: 'An unknown error occurred.',
} as const;

export { isDevelopment, isProduction };
