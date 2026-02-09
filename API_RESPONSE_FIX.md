# API Response Parsing Fix

## Issue
The backend returns responses wrapped in `ResponseModel`:
```json
{
  "data": [...],
  "code": 200,
  "message": "Success message"
}
```

But the refactored API client was expecting unwrapped data directly.

## Solution
Updated all API methods to properly unwrap the `ResponseModel` structure:

### Before
```typescript
async list(): Promise<Influencer[]> {
  return httpClient.get<Influencer[]>(ENDPOINTS.INFLUENCERS);
}
```

### After
```typescript
async list(): Promise<Influencer[]> {
  const response = await httpClient.get<{ data: Influencer[] }>(ENDPOINTS.INFLUENCERS);
  return response.data; // Unwrap the data field
}
```

## Files Updated

### services/api.ts
- ✅ `api.fetchInfluencers()` - Unwraps `response.data`
- ✅ `api.createInfluencer()` - Unwraps `response.data`
- ✅ `api.updateInfluencer()` - Unwraps `response.data`
- ✅ `api.fetchPostings()` - Unwraps `response.data`
- ✅ `influencerApi.list()` - Unwraps `response.data`
- ✅ `influencerApi.get()` - Unwraps `response.data`
- ✅ `influencerApi.create()` - Unwraps `response.data`
- ✅ `influencerApi.update()` - Unwraps `response.data`
- ✅ `postingApi.listByInfluencer()` - Unwraps `response.data`
- ✅ `postingApi.get()` - Unwraps `response.data`

## How It Works

The backend returns:
```json
{
  "data": [
    {
      "id": "6983d59e4a49f2c9a1b7c0ae",
      "kind": "influencer",
      "data": { "name": "Isabella", ... },
      ...
    }
  ],
  "code": 200,
  "message": "Influencers retrieved successfully."
}
```

The API client now:
1. Makes the request with type `{ data: Influencer[] }`
2. Receives the full `ResponseModel` object
3. Returns only `response.data` which contains the actual array

The InfluencerContext then transforms each entity:
```typescript
const fetchedInfluencers = res.map((e: any) => ({
  ...e.data,  // Spread the inner data object
  id: e.id,   // Add the entity ID
}));
```

## Testing

Build verified: ✅
```
✓ 1756 modules transformed
✓ built in 2.09s
```

All influencers should now render correctly in the UI.
