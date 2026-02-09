/**
 * API Error Classes
 * Type-safe error handling for API requests
 */

import { HTTP_STATUS, ERROR_MESSAGES } from './config';

export interface ApiErrorResponse {
  message: string;
  code?: string;
  detail?: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}

/**
 * Base API Error class
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly detail?: string;
  public readonly errors?: Record<string, string[]>;
  public readonly isApiError = true;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    detail?: string,
    errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
    
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  toJSON(): ApiErrorResponse {
    return {
      message: this.message,
      code: this.code,
      detail: this.detail,
      errors: this.errors,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Network Error - connection issues, no response from server
 */
export class NetworkError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.NETWORK_ERROR) {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Timeout Error - request took too long
 */
export class TimeoutError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.TIMEOUT) {
    super(message, 0, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

/**
 * Unauthorized Error - 401
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.UNAUTHORIZED) {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error - 403
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.FORBIDDEN) {
    super(message, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Not Found Error - 404
 */
export class NotFoundError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.NOT_FOUND) {
    super(message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Validation Error - 422
 */
export class ValidationError extends ApiError {
  constructor(
    message: string = ERROR_MESSAGES.VALIDATION_ERROR,
    errors?: Record<string, string[]>
  ) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', undefined, errors);
    this.name = 'ValidationError';
  }
}

/**
 * Rate Limit Error - 429
 */
export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests. Please try again later.', retryAfter?: number) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Server Error - 5xx
 */
export class ServerError extends ApiError {
  constructor(message: string = ERROR_MESSAGES.SERVER_ERROR, statusCode: number = 500) {
    super(message, statusCode, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

/**
 * Abort Error - request was cancelled
 */
export class AbortError extends ApiError {
  constructor(message: string = 'Request was cancelled') {
    super(message, 0, 'ABORT_ERROR');
    this.name = 'AbortError';
  }
}

/**
 * Parse response error from API
 */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const statusCode = response.status;
  let errorData: any;

  try {
    const text = await response.text();
    errorData = text ? JSON.parse(text) : {};
  } catch {
    errorData = {};
  }

  const message = errorData.message || errorData.detail || response.statusText || ERROR_MESSAGES.UNKNOWN_ERROR;
  const code = errorData.code;
  const detail = errorData.detail;
  const errors = errorData.errors;

  // Map status codes to specific error types
  switch (statusCode) {
    case HTTP_STATUS.UNAUTHORIZED:
      return new UnauthorizedError(message);
    case HTTP_STATUS.FORBIDDEN:
      return new ForbiddenError(message);
    case HTTP_STATUS.NOT_FOUND:
      return new NotFoundError(message);
    case HTTP_STATUS.UNPROCESSABLE_ENTITY:
      return new ValidationError(message, errors);
    case HTTP_STATUS.TOO_MANY_REQUESTS:
      const retryAfter = response.headers.get('Retry-After');
      return new RateLimitError(message, retryAfter ? parseInt(retryAfter, 10) : undefined);
    case HTTP_STATUS.BAD_GATEWAY:
    case HTTP_STATUS.SERVICE_UNAVAILABLE:
    case HTTP_STATUS.GATEWAY_TIMEOUT:
    case HTTP_STATUS.INTERNAL_SERVER_ERROR:
      return new ServerError(message, statusCode);
    default:
      return new ApiError(message, statusCode, code, detail, errors);
  }
}

/**
 * Check if error is an API error
 */
export function isApiError(error: any): error is ApiError {
  return error && error.isApiError === true;
}

/**
 * Check if error should trigger retry
 */
export function isRetryableError(error: any): boolean {
  if (!isApiError(error)) {
    return false;
  }

  // Retry network errors, timeouts, and 5xx errors
  return (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ServerError ||
    error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS ||
    error.statusCode === HTTP_STATUS.BAD_GATEWAY ||
    error.statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE ||
    error.statusCode === HTTP_STATUS.GATEWAY_TIMEOUT
  );
}

/**
 * Format error for display to user
 */
export function formatErrorMessage(error: any): string {
  if (isApiError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}
