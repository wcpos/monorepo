# useHttpClient Hook

## Overview

The `useHttpClient` hook provides a cross-platform HTTP client abstraction layer for making API requests with advanced features including error handling, token refresh, request throttling, and platform-specific implementations for web and Electron environments.

## Recent Improvements (v2.0)

### Problem Solved: Race Conditions & Request Coordination

**Previous Issues**:
- 🐛 Multiple concurrent 401s all triggered independent token refreshes
- 🐛 Requests continued with stale tokens during refresh
- 🐛 No coordination between hook instances
- 🐛 Offline requests attempted full flow before failing
- 🐛 Per-instance queues couldn't coordinate globally

**New Solutions**:
- ✅ **Global State Manager**: Single source of truth for all requests
- ✅ **Coordinated Token Refresh**: Only one refresh at a time, others wait
- ✅ **Pre-Flight Checks**: Fast-fail for offline/auth-failed scenarios
- ✅ **Global Queue**: Single queue with pause/resume capabilities
- ✅ **Request Synchronization**: Subsequent requests wait for token refresh

**Result**: Eliminated race conditions, reduced redundant requests, and improved app reliability during auth/network issues.

## Architecture

### File Structure

```
use-http-client/
├── index.ts                          # Public exports
├── types.ts                          # TypeScript type definitions
├── use-http-client.tsx               # Main hook implementation
├── use-http-error-handler.tsx        # Default error handler (currently unused)
├── create-token-refresh-handler.ts   # Token refresh error handler factory
├── request-state-manager.ts          # Global request state coordination (NEW)
├── request-queue.ts                  # Global request queue with pause/resume (NEW)
├── http.ts                           # Platform-agnostic axios export (base)
├── http.web.ts                       # Web platform axios implementation
└── http.electron.ts                  # Electron platform IPC-based implementation
```

### Platform-Specific Implementations

The hook uses platform-specific file extensions (`.web.ts`, `.electron.ts`) to load the appropriate HTTP implementation:

- **Web/React Native**: Uses standard `axios` directly
- **Electron**: Uses IPC communication to run axios on the main thread via `window.ipcRenderer.invoke('axios', ...)`

## Core Features

### 1. Global Request State Manager (NEW)

A **singleton** `RequestStateManager` coordinates all HTTP requests across the entire application, providing centralized state management for:

- **Token Refresh Coordination**: Ensures only one token refresh happens at a time
- **Offline Detection**: Blocks requests when device is offline
- **Auth Failure State**: Prevents requests when authentication has failed
- **Request Pausing**: Allows pausing/resuming requests during recovery operations

**Key Benefits**:
- ✅ Prevents race conditions during token refresh
- ✅ Eliminates duplicate refresh requests
- ✅ Fast-fail for offline/auth-failed scenarios
- ✅ Coordinated request queue management

**Usage**:
```typescript
import { requestStateManager } from '@wcpos/hooks/use-http-client';

// Check if requests can proceed
const canProceed = requestStateManager.checkCanProceed();

// Set offline state
requestStateManager.setOffline(true);

// Coordinate token refresh
await requestStateManager.startTokenRefresh(async () => {
  // Refresh logic
});
```

### 2. Global Request Queue with Bottleneck

All requests share a **single global queue** using the [Bottleneck](https://www.npmjs.com/package/bottleneck) library:

```typescript
const globalQueue = new Bottleneck({
  maxConcurrent: 10,     // Maximum 10 concurrent requests
  highWater: 50,         // Maximum 50 queued requests
  strategy: BLOCK,       // Block when queue is full
});
```

**Purpose**: 
- Prevents overwhelming the server
- Manages connection pooling globally
- Coordinates request execution across all hook instances

**Important Design Note**: 
The queue itself is **NOT paused** during token refresh. Instead, request coordination happens via:
1. **Pre-flight checks**: New requests wait if token refresh is in progress
2. **Shared promises**: Concurrent 401s await the same token refresh

**Why not pause the queue?**
- Bottleneck's `stop()` method cannot be reversed with `start()` (doesn't exist)
- Pre-flight waiting is more predictable and testable
- Allows other non-auth requests to continue processing
- Simpler mental model: coordination via state, not queue manipulation

**Available Functions**:
```typescript
import { pauseQueue, resumeQueue, getQueueMetrics } from '@wcpos/hooks/use-http-client';

// Note: These are no-ops for API compatibility
pauseQueue();   // Does nothing - coordination via state manager
resumeQueue();  // Does nothing - coordination via state manager

// Get queue status
const metrics = getQueueMetrics(); // { running: 3, queued: 5 }
```

### 3. Priority-Based Error Handler Chain

Implements a flexible, priority-based error handling system where multiple handlers can process errors in sequence:

```typescript
interface HttpErrorHandler {
  name: string;
  priority?: number;           // Higher priority runs first (default: 0)
  intercepts?: boolean;        // If true, stops chain when handler succeeds/fails
  canHandle: (error) => boolean;
  handle: (context) => Promise<AxiosResponse | void>;
}
```

**Key Behaviors**:
- Handlers are sorted by priority (highest first)
- Each handler's `canHandle()` determines if it should process the error
- If a handler returns a response, the error is considered resolved
- If a handler has `intercepts: true`, it stops the chain regardless of success/failure
- Handlers can retry requests via `context.retryRequest()`
- Maximum of 3 retry attempts per request

**Special Case**: Token refresh handler with invalid refresh token:
- When token refresh fails with invalid refresh token, it marks the error with `isRefreshTokenInvalid: true`
- The error continues down the chain (despite `intercepts: true`) to allow fallback handlers to process re-authentication

### 4. Coordinated Token Refresh Handler (UPDATED)

Factory function that creates a specialized error handler for automatic JWT token refresh with **race condition prevention**:

```typescript
createTokenRefreshHandler({ site, wpUser, getHttpClient })
```

**Features**:
- ✅ **Race Condition Prevention**: Only first 401 triggers refresh, others wait
- ✅ **Queue Coordination**: Pauses request queue during refresh
- ✅ **Automatic Token Update**: Updates user document with new token
- ✅ **Request Retry**: Retries original request with new token
- ✅ **Dual JWT Support**: JWT-in-header and JWT-as-query-param modes
- ✅ **Fallback Handling**: Marks invalid refresh tokens for OAuth fallback

**New Coordinated Flow**:

#### Scenario: 10 concurrent requests all get 401

```
Request 1-10: All fired simultaneously
  ↓
All return 401 error
  ↓
Request 1: First to reach token refresh handler
  → Checks: requestStateManager.isTokenRefreshing() = false
  → Starts refresh via requestStateManager.startTokenRefresh()
    → Makes refresh request (using fetch, bypasses queue)
    → Updates wpUser document with new token
    → Resolves shared promise
  → Retries original request with new token ✅
  
Request 2-10: Reach token refresh handler while refresh in progress
  → Checks: requestStateManager.isTokenRefreshing() = true
  → Awaits requestStateManager.awaitTokenRefresh()
  → (Blocked on shared promise until Request 1 completes)
  ↓
Request 1: Refresh completes successfully
  → Token updated in database
  → Shared promise resolves
  ↓
Request 2-10: Unblocked simultaneously
  → Token already updated in database
  → Retry with original config (token auto-updated via observable) ✅
```

**Pre-Flight Check**: New requests fired during token refresh:
```
New Request: Fired while token refresh in progress
  ↓
Pre-flight check: requestStateManager.isTokenRefreshing() = true
  ↓
Waits for shared token refresh promise
  ↓
Refresh completes, token updated
  ↓
Proceeds with fresh token from database ✅
```

**Key Insight**: The Bottleneck queue continues processing normally. Coordination happens via:
- **Shared Promise**: All 401s wait for the same refresh operation
- **Pre-Flight Waiting**: New requests wait before entering queue
- **Observable Token**: Updated token propagates automatically via RxJS

**Traditional Flow (OLD)**: 
1. Detects 401 error on any request
2. ~~Each request independently tries to refresh~~ (RACE CONDITION)
3. ~~Multiple refresh requests made~~ (INEFFICIENT)

**New Flow (IMPROVED)**:
1. Detects 401 error on any request
2. Checks if refresh already in progress
3. If yes: Wait for it to complete
4. If no: Start coordinated refresh and pause queue
5. Update token and resume queue
6. All waiting requests retry with new token

### 5. Pre-Flight Request Checks (NEW)

Before every request enters the queue, it goes through pre-flight checks to fast-fail on known issues:

```typescript
const makeRequest = async (config) => {
  // 1. Check global state
  const canProceed = requestStateManager.checkCanProceed();
  if (!canProceed.ok) {
    throw new Error(canProceed.reason); // Immediate failure
  }
  
  // 2. Wait for token refresh if in progress
  if (requestStateManager.isTokenRefreshing()) {
    await requestStateManager.awaitTokenRefresh();
  }
  
  // 3. Proceed to queue
  return scheduleRequest(() => http.request(config));
};
```

**Benefits**:
- ❌ **Offline**: Fails immediately with "Device is offline"
- ❌ **Auth Failed**: Fails immediately with "Authentication required"
- ⏸️ **Token Refreshing**: Waits for refresh, then proceeds with new token
- ⏸️ **Requests Paused**: Waits until recovery complete

### 6. Default Error Handler (Unused)

`use-http-error-handler.tsx` provides a comprehensive error handler that logs and displays toasts for various HTTP errors (0, 400, 401, 403, 404, 500, 502, 503, 504).

**Status**: Currently not used in the error handler chain but available for reference.

### 7. Request Configuration Enhancement

All requests are automatically enhanced with:
- `X-WCPOS: 1` header (for all non-HEAD requests)
- Development mode: `XDEBUG_SESSION=start` query parameter
- HEAD requests: Special handling with `decompress: false` and `_method: HEAD` param

## API Reference

### useHttpClient(errorHandlers?)

**Parameters**:
- `errorHandlers` (optional): Array of `HttpErrorHandler` objects
  - **CRITICAL**: Must be a stable reference (use `useMemo`, `useState`, or constant)
  - Passing unstable references (inline arrays) will cause infinite re-renders

**Returns**: HTTP client object with methods:
- `request(config: AxiosRequestConfig): Promise<AxiosResponse>`
- `get(url, config?): Promise<AxiosResponse>`
- `post(url, data, config?): Promise<AxiosResponse>`
- `put(url, data, config?): Promise<AxiosResponse>`
- `patch(url, data, config?): Promise<AxiosResponse>`
- `delete(url, config?): Promise<AxiosResponse>`
- `head(url, config?): Promise<AxiosResponse>`

### createTokenRefreshHandler(config)

**Parameters**:
```typescript
{
  site: {
    wcpos_api_url?: string;      // Base API URL for auth endpoints
    use_jwt_as_param?: boolean;  // If true, sends JWT as query param instead of header
    url?: string;                // Site URL for logging
  },
  wpUser: {
    id?: number;                 // User ID for logging
    refresh_token?: string;      // Refresh token for obtaining new access tokens
    incrementalPatch: (data) => Promise<any>; // Function to update user document
  },
  getHttpClient: () => HttpClient; // Function to get a fresh HTTP client (no error handlers)
}
```

**Returns**: `HttpErrorHandler` configured for token refresh

## Usage Examples

### Basic Usage

```typescript
// ✅ Good - no arguments (uses stable empty array)
const httpClient = useHttpClient();

const response = await httpClient.get('/api/products');
```

### With Stable Error Handlers

```typescript
// ✅ Good - constant outside component
const ERROR_HANDLERS = [
  { name: 'retry', priority: 10, canHandle: () => true, handle: async () => {} }
];

function MyComponent() {
  const httpClient = useHttpClient(ERROR_HANDLERS);
  // ...
}
```

### With Memoized Handlers

```typescript
// ✅ Good - memoized
function MyComponent() {
  const errorHandlers = useMemo(() => [
    createRetryHandler(),
    createLogHandler()
  ], []);
  
  const httpClient = useHttpClient(errorHandlers);
  // ...
}
```

### With Token Refresh

```typescript
function MyComponent() {
  const site = useSite();
  const wpUser = useWPUser();
  
  const errorHandlers = useMemo(() => [
    createTokenRefreshHandler({
      site,
      wpUser,
      getHttpClient: () => axios, // Fresh client without error handlers
    }),
    // ... other handlers
  ], [site, wpUser]);
  
  const httpClient = useHttpClient(errorHandlers);
  // ...
}
```

### ❌ Anti-Pattern: Inline Array

```typescript
// ❌ BAD - will cause infinite re-renders!
const httpClient = useHttpClient([
  { name: 'retry', canHandle: () => true, handle: async () => {} }
]);
```

## Request/Response Flow

### Normal Request Flow

```
User Code
  → httpClient.get(url)
    → request(config)
      → makeRequest(config)
        → Add X-WCPOS header
        → Add XDEBUG_SESSION (dev mode)
        → Special HEAD request handling
        → limiter.schedule()
          → http.request() [platform-specific]
            → [Web] axios.request()
            → [Electron] ipcRenderer.invoke('axios')
      ← Response
    ← Return to user
```

### Error Handling Flow

```
Error Occurs
  → processErrorHandlers(error, config, handlers, makeRequest)
    → Sort handlers by priority (high to low)
    → For each handler:
      → canHandle(error)?
        → Yes: handle(context)
          → Handler returns response?
            → Yes: ✅ Error resolved, return response
            → No: Handler intercepts?
              → Yes: ❌ Stop chain, return error
              → No: Continue to next handler
        → No: Skip to next handler
    → No handler resolved?
      → ❌ Return original error
  ← Result (response or error)
```

### Token Refresh Flow

```
401 Error
  → Token Refresh Handler (priority: 100, intercepts: true)
    → Check: has refresh_token?
      → No: throw original error
      → Yes: POST /auth/refresh { refresh_token }
        → Success: access_token received
          → Update wpUser document
          → Update request config with new token
          → retryRequest(updatedConfig)
            → Success: ✅ Return response
            → Fail: ❌ throw error
        → Fail (401): Refresh token invalid
          → Mark error.isRefreshTokenInvalid = true
          → Throw error (continues to next handler despite intercepts: true)
        → Fail (other): throw original error
```

## Implementation Details

### Error Handler Context

Each handler receives a `HttpErrorHandlerContext` object:

```typescript
{
  error: AxiosError,              // The original error
  originalConfig: AxiosRequestConfig, // The request that failed
  retryRequest: (config?) => Promise<AxiosResponse>, // Retry function
  retryCount: number              // Number of retries so far (max: 3)
}
```

### Handler Processing Logic

1. **Safety Check**: Ensures `errorHandlers` is an array
2. **Sorting**: Handlers sorted by priority (highest first)
3. **Max Retries**: Prevents infinite loops (max 3 retries)
4. **Handler Execution**:
   - Skip if `canHandle()` returns false
   - Execute `handle(context)`
   - If returns response → success, return it
   - If returns void + intercepts → failed, stop chain
   - If returns void + no intercepts → continue chain
5. **Error Cases**:
   - Handler throws + intercepts → stop chain
   - Handler throws + no intercepts → continue chain
   - Special case: token-refresh handler with invalid refresh token continues chain

### Platform-Specific HTTP Implementation

**Web/React Native** (`http.web.ts`):
```typescript
import axios from 'axios';
export default axios;
```

**Electron** (`http.electron.ts`):
```typescript
const axiosOnElectronMain = {
  request: (config) => {
    return window.ipcRenderer.invoke('axios', { type: 'request', config })
      .then(result => {
        if (result.success === false) {
          throw createAxiosError(result);
        }
        return response;
      });
  }
};
```

### HEAD Request Special Handling

HEAD requests receive special treatment:
- `decompress: false` prevents automatic decompression
- `_method: HEAD` query parameter for servers that don't support HEAD
- No `X-WCPOS` header added

### Development Mode Enhancements

When `process.env.NODE_ENV === 'development'`:
- All requests include `XDEBUG_SESSION=start` query parameter for PHP debugging

## Type Definitions

### HttpErrorHandler

```typescript
interface HttpErrorHandler {
  name: string;                  // Unique identifier
  priority?: number;             // Higher runs first (default: 0)
  intercepts?: boolean;          // Stops chain if true (default: false)
  canHandle: (error: AxiosError) => boolean;
  handle: (context: HttpErrorHandlerContext) => Promise<AxiosResponse | void>;
}
```

### HttpErrorHandlerContext

```typescript
interface HttpErrorHandlerContext {
  error: AxiosError;
  originalConfig: AxiosRequestConfig;
  retryRequest: (config?: AxiosRequestConfig) => Promise<AxiosResponse>;
  retryCount: number;
}
```

## Known Issues & TODOs

### Issues
1. **Unused Error Handler**: `use-http-error-handler.tsx` is not integrated into the error handler chain
2. **Request Cancellation**: No current implementation for cancelling in-flight requests
3. **Online Status**: Comment warns to be careful with `useOnlineStatus` due to frequent events

### TODOs
- Implement request cancellation mechanism
- Consider integrating or removing `use-http-error-handler.tsx`
- Handle online/offline status properly
- Consider adding request deduplication

## Testing Considerations

When testing components that use `useHttpClient`:

1. **Mock the HTTP Client**: Mock at the axios level or IPC level
2. **Test Error Handlers**: Test each handler in isolation with known error responses
3. **Test Handler Chain**: Verify priority ordering and intercepts behavior
4. **Test Token Refresh**: Mock refresh endpoint and verify retry logic
5. **Test Throttling**: Verify Bottleneck limits are respected
6. **Test Platform Variations**: Test both web and Electron implementations

## Migration Notes

For any refactoring:

1. **Preserve Stability Requirement**: Error handlers MUST remain stable references
2. **Maintain Platform Abstraction**: Keep web/electron platform-specific implementations separate
3. **Preserve Error Handler Chain**: The priority-based chain with intercepts is core functionality
4. **Token Refresh Special Case**: The `isRefreshTokenInvalid` flag flow must be preserved
5. **Bottleneck Integration**: Request throttling is critical for production use
6. **Type Safety**: All types are imported from axios, maintain this pattern

## Dependencies

- `axios` - HTTP client library
- `bottleneck` - Rate limiting and queuing
- `lodash/set` - Deep object property setting
- `lodash/get` - Deep object property getting
- `@wcpos/utils/logger` - Logging utility
- `@wcpos/utils/logger/error-codes` - Standardized error codes

## Performance Characteristics

- **Request Queuing**: Max 10 concurrent, 50 queued
- **Max Retries**: 3 attempts per request
- **Handler Processing**: O(n) where n = number of handlers
- **Memory**: Minimal - no caching, no request deduplication
- **Error Overhead**: Priority sort on each error (O(n log n))

## Security Considerations

- **Token Handling**: Refresh tokens never logged, only access tokens updated
- **IPC Security**: Electron implementation uses controlled IPC channel
- **Error Exposure**: Detailed errors logged but sanitized for user display
- **XDEBUG**: Only enabled in development mode

---

*Last Updated: October 27, 2025*
*Version: Pre-refactor documentation*

