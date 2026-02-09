# API Quick Start Guide

Quick reference for using the refactored production-ready API services.

## Installation & Setup

No additional dependencies needed. Configuration is automatic via environment variables.

### Environment Variables (.env)
```env
VITE_API_URL=http://localhost:8000
VITE_SSE_URL=http://localhost:8000
MODE=development
```

## Basic Usage

### 1. Influencer Operations

```typescript
import { influencerApi } from './services';

// List all influencers
const influencers = await influencerApi.list();

// Get specific influencer
const influencer = await influencerApi.get('influencer-id');

// Create influencer
const newInfluencer = await influencerApi.create({
  name: 'Jane Doe',
  handle: '@janedoe',
  bio: 'Travel blogger',
  niches: ['travel', 'food'],
  // ... other fields
});

// Update influencer
await influencerApi.update('influencer-id', {
  data: { bio: 'Updated bio' }
});

// Delete influencer
await influencerApi.delete('influencer-id');
```

### 2. Post Operations

```typescript
import { postingApi } from './services';

// Get posts for influencer
const posts = await postingApi.listByInfluencer('influencer-id');

// Create post
const post = await postingApi.create({
  influencer_id: 'influencer-id',
  prompt: 'Beautiful sunset at the beach',
  platform: 'Instagram',
});

// Get specific post
const post = await postingApi.get('post-id');

// Delete post
await postingApi.delete('post-id');
```

### 3. Creation Flow

```typescript
import { creationService } from './services';

// Start creation session
const session = await creationService.startCreation(
  'Tokyo, Japan',
  'Tech-savvy travel blogger'
);

// Poll until avatars are ready
const readySession = await creationService.pollUntilReady(
  session.id,
  ['images_ready'],
  2000, // poll every 2 seconds
  120000 // timeout after 2 minutes
);

// Select avatar
await creationService.selectAvatar(session.id, avatarUrl);

// Confirm and create
const result = await creationService.confirmCreation(session.id, {
  name: 'Custom Name',
  bio: 'Custom bio'
});
```

### 4. Orchestrator

```typescript
import { 
  startOrchestrator,
  getOrchestratorSession,
  submitSelections 
} from './services';

// Start orchestrator
const response = await startOrchestrator({
  influencer_id: 'influencer-id',
  query: 'Create a post about cherry blossoms in Tokyo',
  post_type_hint: 'carousel'
});

// Get session (for polling)
const session = await getOrchestratorSession(response.session_id);

// Submit user selections
await submitSelections(session.session_id, {
  web_item_ids: ['item1', 'item2'],
  image_ids: ['img1', 'img2']
});
```

### 5. Location Services

```typescript
import { locationService } from './services';

// Autocomplete
const suggestions = await locationService.autocomplete('tokyo', 5);

// Geocode
const location = await locationService.geocode('Tokyo, Japan');

// Update location (travel)
await locationService.updateInfluencerLocation(
  'influencer-id',
  'Paris, France',
  'Plane',
  true // create story
);
```

## Real-Time Updates (SSE)

### React Component

```typescript
import { useSSESubscription, ConnectionState } from './services/sse';

function PostCreation({ sessionId }) {
  const [status, setStatus] = useState('');
  
  const { connectionState } = useSSESubscription(
    `session:${sessionId}`,
    (event, eventType) => {
      if (eventType === 'status_update') {
        setStatus(event.data.status);
      } else if (eventType === 'orch_post_ready') {
        console.log('Post ready!', event.data);
      }
    },
    !!sessionId // enabled when sessionId exists
  );

  return (
    <div>
      <ConnectionIndicator state={connectionState} />
      <p>Status: {status}</p>
    </div>
  );
}

function ConnectionIndicator({ state }) {
  if (state === ConnectionState.CONNECTED) {
    return <Badge color="green">Live</Badge>;
  }
  if (state === ConnectionState.RECONNECTING) {
    return <Badge color="yellow">Reconnecting...</Badge>;
  }
  if (state === ConnectionState.ERROR) {
    return <Badge color="red">Connection Error</Badge>;
  }
  return <Badge color="gray">Disconnected</Badge>;
}
```

## Error Handling

### Type-Safe Error Handling

```typescript
import { 
  ApiError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  formatErrorMessage 
} from './services/errors';

try {
  const influencer = await influencerApi.get('invalid-id');
} catch (error) {
  // Specific error types
  if (error instanceof NotFoundError) {
    console.log('Influencer not found');
  } else if (error instanceof UnauthorizedError) {
    // Redirect to login
    router.push('/login');
  } else if (error instanceof ValidationError) {
    // Show validation errors
    console.log('Errors:', error.errors);
  } else if (error instanceof ApiError) {
    // Generic API error
    console.log('API Error:', error.message, error.statusCode);
  } else {
    // Unknown error
    console.log('Error:', formatErrorMessage(error));
  }
}
```

### User-Friendly Error Display

```typescript
import { formatErrorMessage } from './services/errors';

function MyComponent() {
  const [error, setError] = useState(null);
  
  const handleSubmit = async () => {
    try {
      await influencerApi.create(data);
    } catch (err) {
      setError(formatErrorMessage(err));
    }
  };
  
  return (
    <>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <button onClick={handleSubmit}>Submit</button>
    </>
  );
}
```

## Advanced Features

### Custom Request Options

```typescript
import { httpClient } from './services/http-client';

// Custom timeout
const data = await httpClient.get('/endpoint', {
  timeout: 60000 // 60 seconds
});

// Skip cache
const freshData = await httpClient.get('/endpoint', {
  skipCache: true
});

// Custom retry
const data = await httpClient.post('/endpoint', body, {
  retryAttempts: 5,
  retryDelay: 2000
});

// Custom cache TTL
const data = await httpClient.get('/endpoint', {
  cacheTTL: 60000 // 1 minute
});

// Skip authentication
const publicData = await httpClient.get('/public', {
  skipAuth: true
});
```

### Custom Interceptors

```typescript
import { httpClient } from './services/http-client';

// Add custom header to all requests
httpClient.addRequestInterceptor(async (url, options) => {
  options.headers = {
    ...options.headers,
    'X-Client-Version': '1.0.0',
  };
  return { url, options };
});

// Log all responses
httpClient.addResponseInterceptor(async (response) => {
  console.log('Response:', response.status, response.url);
  return response;
});

// Custom error handling
httpClient.addErrorInterceptor(async (error) => {
  if (error.statusCode === 503) {
    // Show maintenance message
    showMaintenanceModal();
  }
  throw error;
});
```

### Manual Cache Management

```typescript
import { httpClient } from './services/http-client';

// Clear all cache
httpClient.clearCache();

// Clear specific endpoint
httpClient.clearCacheEntry('/influencer');
httpClient.clearCacheEntry('/influencer/123', 'GET');
```

### Manual SSE Management

```typescript
import { getSSEManager, SSEManager } from './services/sse';

const manager = getSSEManager();

// Subscribe manually
const unsubscribe = manager.subscribe('post:123', (event, type) => {
  console.log('Event:', type, event);
});

// Unsubscribe
unsubscribe();

// Listen to connection state
const removeListener = manager.addStateListener((state) => {
  console.log('Connection state:', state);
});

// Cleanup
removeListener();

// Full cleanup
manager.destroy();
```

## Common Patterns

### Loading States

```typescript
function MyComponent() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await influencerApi.list();
        setData(result);
      } catch (err) {
        setError(formatErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  return <DataDisplay data={data} />;
}
```

### Polling with Cancellation

```typescript
function usePolling(sessionId, interval = 2000) {
  const [session, setSession] = useState(null);
  
  useEffect(() => {
    if (!sessionId) return;
    
    let cancelled = false;
    
    const poll = async () => {
      while (!cancelled) {
        try {
          const data = await getOrchestratorSession(sessionId);
          if (!cancelled) {
            setSession(data);
            if (data.phase === 'complete') break;
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    };
    
    poll();
    
    return () => {
      cancelled = true;
    };
  }, [sessionId, interval]);
  
  return session;
}
```

### Optimistic Updates

```typescript
async function updateInfluencer(id, updates) {
  // Optimistic update
  setInfluencers(prev =>
    prev.map(inf => inf.id === id ? { ...inf, ...updates } : inf)
  );
  
  try {
    await influencerApi.update(id, { data: updates });
  } catch (error) {
    // Revert on error
    await fetchInfluencers(); // Refresh from server
    showToast('Update failed', 'error');
  }
}
```

## Testing

### Mock API Calls

```typescript
import { httpClient } from './services/http-client';

jest.mock('./services/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

test('fetches influencers', async () => {
  httpClient.get.mockResolvedValue([
    { id: '1', data: { name: 'Test' } }
  ]);
  
  const result = await influencerApi.list();
  expect(result).toHaveLength(1);
});
```

## Troubleshooting

### Caching Issues
```typescript
// Force fresh data
const data = await httpClient.get('/endpoint', { skipCache: true });

// Clear specific cache
httpClient.clearCacheEntry('/endpoint');
```

### Connection Issues
```typescript
// Check SSE connection
const manager = getSSEManager();
const state = manager.getConnectionState();
console.log('Connection:', state);
```

### Authentication Issues
```typescript
// Check token
const token = localStorage.getItem('aura_token');
if (!token) {
  // Redirect to login
}
```

## Best Practices

1. ✅ Use type-safe APIs (`influencerApi`, `postingApi`)
2. ✅ Handle errors with specific error types
3. ✅ Show connection state for SSE subscriptions
4. ✅ Use `skipCache: true` for real-time data
5. ✅ Clear cache after mutations
6. ✅ Use loading and error states in UI
7. ✅ Implement proper cleanup in useEffect
8. ✅ Add timeout for long-running requests
9. ✅ Log errors for debugging
10. ✅ Test with error scenarios

## Support

- Full documentation: `services/README.md`
- Implementation details: `API_REFACTORING.md`
- Type definitions: `services/api-types.ts`
