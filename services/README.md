# API Services - Production Ready

This directory contains production-ready API services for the Aura AI Influencer Studio.

## Architecture Overview

The API layer has been completely refactored with the following improvements:

### Core Components

1. **HTTP Client** (`http-client.ts`)
   - Centralized HTTP client with interceptors
   - Automatic retry with exponential backoff
   - Request/response caching
   - Timeout handling with AbortController
   - Authentication token management
   - Comprehensive error handling

2. **Error Handling** (`errors.ts`)
   - Type-safe error classes for different HTTP statuses
   - Structured error responses
   - User-friendly error messages
   - Retryable error detection

3. **Configuration** (`config.ts`)
   - Environment-based configuration
   - Centralized API endpoints
   - Configurable timeouts, retry attempts, and cache TTL
   - Storage keys constants

4. **Type Definitions** (`api-types.ts`)
   - Comprehensive TypeScript types for all API requests/responses
   - Type safety across the entire API layer

5. **SSE Manager** (`sse.ts`)
   - Real-time event streaming
   - Connection state management
   - Heartbeat monitoring
   - Automatic reconnection with exponential backoff
   - Resource multiplexing

## Features

### 🔄 Automatic Retry Logic
- Exponential backoff for failed requests
- Configurable retry attempts (default: 3)
- Smart retry only for retryable errors (5xx, network errors, timeouts)

### ⚡ Response Caching
- GET requests are cached by default
- Configurable TTL per request (default: 5 minutes)
- Cache invalidation on mutations (POST, PUT, DELETE)
- Memory-efficient cache management

### ⏱️ Timeout Handling
- Configurable request timeout (default: 30 seconds)
- AbortController for cancellable requests
- Timeout errors trigger automatic retry

### 🔐 Authentication
- Automatic token injection via interceptors
- Token stored in localStorage
- Automatic logout on 401 responses
- Custom event dispatch for auth state changes

### 📊 Request/Response Logging
- Development mode logging
- Request/response tracking
- Error logging with stack traces

### 🔌 SSE Connection Management
- Connection state tracking (DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR)
- Heartbeat monitoring to detect stale connections
- Automatic reconnection with exponential backoff
- Resource multiplexing (single connection for multiple resources)
- React hooks for easy integration

## Usage

### Basic HTTP Requests

```typescript
import { httpClient } from './services/http-client';

// GET request with caching
const data = await httpClient.get('/influencer');

// POST request
const result = await httpClient.post('/postings/create', {
  influencer_id: '123',
  prompt: 'Create a post about...',
});

// With custom options
const data = await httpClient.get('/data', {
  timeout: 10000,        // 10 second timeout
  retryAttempts: 5,      // 5 retry attempts
  skipCache: true,       // Don't use cache
  cacheTTL: 60000,       // Cache for 1 minute
});
```

### Type-Safe API Methods

```typescript
import { influencerApi, postingApi } from './services';

// Type-safe influencer operations
const influencers = await influencerApi.list();
const influencer = await influencerApi.get('123');
const newInfluencer = await influencerApi.create({
  name: 'Jane Doe',
  handle: '@janedoe',
  // ... other fields with full type checking
});

// Type-safe posting operations
const posts = await postingApi.listByInfluencer('123');
const post = await postingApi.create({
  influencer_id: '123',
  prompt: 'A beautiful sunset',
  platform: 'Instagram',
});
```

### SSE Subscriptions

```typescript
import { useSSESubscription, ConnectionState } from './services/sse';

function MyComponent() {
  const { connectionState } = useSSESubscription(
    `session:${sessionId}`,
    (event, eventType) => {
      if (eventType === 'status_update') {
        console.log('Status:', event.data.status);
      }
    }
  );

  return (
    <div>
      Connection: {connectionState}
      {connectionState === ConnectionState.CONNECTED && (
        <span>✓ Connected</span>
      )}
    </div>
  );
}
```

### Error Handling

```typescript
import { 
  ApiError, 
  UnauthorizedError, 
  NotFoundError,
  formatErrorMessage 
} from './services/errors';

try {
  await influencerApi.get('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Influencer not found');
  } else if (error instanceof UnauthorizedError) {
    console.log('Please log in');
  } else {
    console.log(formatErrorMessage(error));
  }
}
```

### Custom Interceptors

```typescript
import { httpClient } from './services/http-client';

// Add custom request interceptor
httpClient.addRequestInterceptor(async (url, options) => {
  // Modify request before sending
  options.headers = {
    ...options.headers,
    'X-Custom-Header': 'value',
  };
  return { url, options };
});

// Add custom response interceptor
httpClient.addResponseInterceptor(async (response) => {
  // Process response
  console.log('Response received:', response.status);
  return response;
});

// Add custom error interceptor
httpClient.addErrorInterceptor(async (error) => {
  // Handle specific errors
  if (error.statusCode === 429) {
    console.log('Rate limited, please slow down');
  }
  throw error;
});
```

## Configuration

Environment variables (`.env`):

```env
# API Base URL
VITE_API_URL=http://localhost:8000

# SSE Base URL (optional, defaults to API URL)
VITE_SSE_URL=http://localhost:8000

# Mode
MODE=development
```

Programmatic configuration:

```typescript
import { HttpClient } from './services/http-client';

const customClient = new HttpClient({
  baseURL: 'https://api.example.com',
  timeout: 60000,
  retryAttempts: 5,
  retryDelay: 2000,
  cacheEnabled: true,
  cacheTTL: 600000,
  logRequests: true,
});
```

## Service Files

- `api.ts` - Core API methods for influencers and posts
- `orchestrator.ts` - Content orchestrator service
- `creation.ts` - Influencer creation flow service
- `location.ts` - Location and geocoding service
- `post_creation.ts` - Post creation with type transformations
- `sse.ts` - Server-Sent Events manager

## Migration Guide

### From Old API

**Before:**
```typescript
const response = await fetch(`${API_URL}/influencer`, {
  headers: getHeaders(),
});
const data = await response.json();
```

**After:**
```typescript
const data = await influencerApi.list();
```

### Error Handling

**Before:**
```typescript
if (!response.ok) {
  throw new Error('Request failed');
}
```

**After:**
```typescript
// Automatic error handling with typed errors
try {
  await influencerApi.get(id);
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle 404
  }
}
```

## Best Practices

1. **Use Type-Safe APIs**: Prefer `influencerApi`, `postingApi`, etc. over raw `httpClient`
2. **Handle Errors**: Always catch and handle API errors appropriately
3. **Cache Wisely**: Use `skipCache: true` for real-time data
4. **Invalidate Cache**: Clear cache after mutations
5. **Monitor SSE**: Track connection state in UI for better UX
6. **Configure Per-Request**: Override defaults when needed (timeouts, retries, etc.)

## Testing

```typescript
import { httpClient } from './services/http-client';

// Clear cache between tests
beforeEach(() => {
  httpClient.clearCache();
});

// Mock HTTP client in tests
jest.mock('./services/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    // ...
  },
}));
```

## Performance Considerations

- **Caching**: Reduces redundant API calls, default 5-minute TTL
- **Retry Logic**: Automatically retries failed requests (exponential backoff)
- **Request Deduplication**: Same requests in flight are deduplicated
- **Connection Pooling**: Browser handles HTTP/2 connection pooling
- **SSE Multiplexing**: Single SSE connection for multiple resources

## Security

- **Token Storage**: Tokens stored in localStorage (consider httpOnly cookies for production)
- **HTTPS**: Always use HTTPS in production
- **CORS**: Backend must configure CORS appropriately
- **XSS Protection**: Sanitize user input before rendering
- **Rate Limiting**: Backend should implement rate limiting

## Support

For issues or questions, please refer to the main project documentation or create an issue.
