/**
 * HTTP Client
 * Production-ready HTTP client with retry logic, caching, timeouts, and interceptors
 */

import {
  ApiConfig,
  defaultApiConfig,
  STORAGE_KEYS,
  HTTP_STATUS,
} from './config';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  AbortError,
  parseErrorResponse,
  isRetryableError,
} from './errors';

interface RequestOptions extends RequestInit {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  skipAuth?: boolean;
  skipCache?: boolean;
  cacheTTL?: number;
  onUploadProgress?: (progress: number) => void;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

type RequestInterceptor = (
  url: string,
  options: RequestOptions
) => Promise<{ url: string; options: RequestOptions }> | { url: string; options: RequestOptions };

type ResponseInterceptor = (response: Response) => Promise<Response> | Response;

type ErrorInterceptor = (error: ApiError) => Promise<never> | never;

/**
 * Production-ready HTTP Client
 */
export class HttpClient {
  private config: ApiConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = { ...defaultApiConfig, ...config };
    this.setupDefaultInterceptors();
  }

  /**
   * Setup default interceptors
   */
  private setupDefaultInterceptors() {
    // Auth interceptor
    this.addRequestInterceptor(async (url, options) => {
      if (!options.skipAuth) {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }
      return { url, options };
    });

    // Logging interceptor (development only)
    if (this.config.logRequests) {
      this.addRequestInterceptor(async (url, options) => {
        console.log(`[HTTP] ${options.method || 'GET'} ${url}`, options);
        return { url, options };
      });

      this.addResponseInterceptor(async (response) => {
        console.log(`[HTTP] Response ${response.status} ${response.url}`);
        return response;
      });
    }

    // Unauthorized handler
    this.addErrorInterceptor(async (error) => {
      if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
        // Clear auth token
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        
        // Dispatch event for app to handle
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      throw error;
    });
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(
    url: string,
    options: RequestOptions,
    attempt: number = 1
  ): Promise<Response> {
    const timeout = options.timeout || this.config.timeout;
    const retryAttempts = options.retryAttempts ?? this.config.retryAttempts;
    const retryDelay = options.retryDelay || this.config.retryDelay;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Run response interceptors
      let processedResponse = response;
      for (const interceptor of this.responseInterceptors) {
        processedResponse = await interceptor(processedResponse);
      }

      // Handle error responses
      if (!processedResponse.ok) {
        const error = await parseErrorResponse(processedResponse);
        
        // Retry if retryable and attempts remaining
        if (isRetryableError(error) && attempt < retryAttempts) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, options, attempt + 1);
        }

        // Run error interceptors
        for (const interceptor of this.errorInterceptors) {
          await interceptor(error);
        }

        throw error;
      }

      return processedResponse;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error.name === 'AbortError') {
        const timeoutError = new TimeoutError();
        
        // Retry timeouts
        if (attempt < retryAttempts) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, options, attempt + 1);
        }

        throw timeoutError;
      }

      // Handle network errors
      if (error instanceof TypeError) {
        const networkError = new NetworkError();
        
        // Retry network errors
        if (attempt < retryAttempts) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, options, attempt + 1);
        }

        throw networkError;
      }

      throw error;
    }
  }

  /**
   * Execute request with interceptors
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    let url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;
    let requestOptions: RequestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    // Run request interceptors
    for (const interceptor of this.requestInterceptors) {
      const result = await interceptor(url, requestOptions);
      url = result.url;
      requestOptions = result.options;
    }

    // Check cache for GET requests
    const cacheKey = `${requestOptions.method || 'GET'}:${url}`;
    if (
      this.config.cacheEnabled &&
      !requestOptions.skipCache &&
      (requestOptions.method === 'GET' || !requestOptions.method)
    ) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Make request
    const response = await this.makeRequest(url, requestOptions);

    // Parse response
    const data = await this.parseResponse<T>(response);

    // Cache GET responses
    if (
      this.config.cacheEnabled &&
      !requestOptions.skipCache &&
      (requestOptions.method === 'GET' || !requestOptions.method)
    ) {
      this.cacheResponse(
        cacheKey,
        data,
        requestOptions.cacheTTL || this.config.cacheTTL
      );
    }

    return data;
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    if (contentType?.includes('text/')) {
      return response.text() as any;
    }

    if (contentType?.includes('application/octet-stream')) {
      return response.blob() as any;
    }

    // Try to parse as JSON by default
    try {
      return await response.json();
    } catch {
      return response.text() as any;
    }
  }

  /**
   * Get cached response
   */
  private getCachedResponse(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache response
   */
  private cacheResponse(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear specific cache entry
   */
  clearCacheEntry(endpoint: string, method: string = 'GET'): void {
    const key = `${method}:${this.config.baseURL}${endpoint}`;
    this.cache.delete(key);
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Create and export default instance
export const httpClient = new HttpClient();
