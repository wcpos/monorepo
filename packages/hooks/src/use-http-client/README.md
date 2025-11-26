# HTTP Client Hooks Documentation

## Overview

The WCPOS HTTP Client system consists of two layers:

1.  **`useHttpClient`** (`@wcpos/hooks/use-http-client`): A low-level, cross-platform HTTP client abstraction with error handling, token refresh coordination, and request throttling.
2.  **`useRestHttpClient`** (`packages/core/src/screens/main/hooks/use-rest-http-client`): A specialized high-level wrapper for WordPress/WooCommerce REST API communication that handles JWT authentication, store context, and OAuth flows.

This documentation covers both hooks as they are tightly integrated.

## Recent Improvements (v2.0)

### Problem Solved: Race Conditions & Request Coordination

**Previous Issues**:
*   🐛 Multiple concurrent 401s triggered independent token refreshes.
*   🐛 Requests continued with stale tokens during refresh.
*   🐛 No coordination between hook instances.
*   🐛 Offline requests attempted full flow before failing.

**New Solutions**:
*   ✅ **Global State Manager**: Single source of truth for all requests.
*   ✅ **Coordinated Token Refresh**: Only one refresh at a time, others wait.
*   ✅ **Pre-Flight Checks**: Fast-fail for offline/auth-failed scenarios.
*   ✅ **Global Queue**: Single queue with pause/resume capabilities.
*   ✅ **Request Synchronization**: Subsequent requests wait for token refresh.

## Architecture

### File Structure

```
packages/
├── hooks/src/use-http-client/        # Low-level Client
│   ├── index.ts                      # Public exports
│   ├── use-http-client.tsx           # Main hook implementation
│   ├── create-token-refresh-handler.ts # Token refresh logic
│   ├── request-state-manager.ts      # Global state singleton
│   ├── request-queue.ts              # Global Bottleneck queue
│   ├── http.ts                       # Platform-agnostic export
│   ├── http.web.ts                   # Web axios implementation
│   └── http.electron.ts              # Electron IPC implementation
│
└── core/src/screens/main/hooks/use-rest-http-client/ # High-level REST Client
    ├── index.ts                      # REST hook implementation
    ├── auth-error-handler.ts         # OAuth fallback handler
    └── types.ts                      # Type definitions
```

### Dependency Hierarchy

```
useRestHttpClient
  └── useHttpClient
      ├── Global Request Queue (Bottleneck)
      ├── Global State Manager (Singleton)
      ├── Token Refresh Handler (Priority: 100)
      └── Platform HTTP Adapter (Web/Electron)
```

## Core Features

### 1. Global Request State Manager
A singleton `RequestStateManager` coordinates all HTTP requests across the application.

*   **Token Refresh Coordination**: Ensures only one token refresh happens at a time.
*   **Offline Detection**: Blocks requests when device is offline.
*   **Auth Failure State**: Prevents requests when authentication has failed.
*   **Request Pausing**: Allows pausing/resuming requests during recovery.

### 2. Global Request Queue
All requests share a **single global queue** using `bottleneck`.
*   **Max Concurrent**: 10
*   **High Water**: 50
*   **Strategy**: Block when full

### 3. Coordinated Token Refresh & OAuth Fallback
The system uses a two-tier authentication recovery system:

**Tier 1: Token Refresh Handler** (Priority: 100)
*   Intercepts 401 errors.
*   Checks `RequestStateManager` to see if refresh is in progress.
*   If yes: Awaits the shared promise.
*   If no: Initiates refresh via `fetch` (to avoid circular dependencies).
*   Updates the user document with the new token.
*   Retries the original request.

**Tier 2: Fallback Auth Handler** (Priority: 50)
*   Handles cases where token refresh fails (e.g., refresh token expired/invalid).
*   Triggers OAuth flow using `expo-auth-session`.
*   Blocks subsequent requests until re-authentication is complete.

### 4. REST API Specific Features (`useRestHttpClient`)
*   **Automatic JWT Injection**: Adds `Authorization: Bearer <token>` to headers (or query params if configured).
*   **Multi-Store Context**: Automatically injects `store_id` parameter.
*   **Method Workarounds**: Converts PUT/PATCH to POST with `X-HTTP-Method-Override` headers for server compatibility.
*   **Invalid JSON Recovery**: heuristic parser to extract JSON from corrupted responses (e.g., PHP warnings/HTML mixed in response).

### 5. Pre-Flight Checks
Before entering the queue, every request checks:
1.  **Online Status**: Fails immediately if offline.
2.  **Auth Status**: Fails immediately if `authFailed` flag is true.
3.  **Refresh Status**: Waits if a token refresh is in progress.

## API Reference

### `useHttpClient(errorHandlers?)`
Low-level hook for general HTTP requests.

```typescript
const httpClient = useHttpClient(errorHandlers);
await httpClient.get('/api/resource');
```

**Parameters**:
*   `errorHandlers` (optional): Array of `HttpErrorHandler`. **Must be a stable reference** (use `useMemo` or static constant).

### `useRestHttpClient(endpoint?)`
High-level hook for WC REST API.

```typescript
const client = useRestHttpClient('products');
const data = await client.get('/'); // GET /wp-json/wcpos/v1/products
```

**Features**:
*   Automatically configured `baseURL`.
*   Authentication headers injected.
*   Store context injected.
*   Online status checks.

### `createTokenRefreshHandler(config)`
Factory for the token refresh error handler.

```typescript
createTokenRefreshHandler({
  site,
  wpUser,
  getHttpClient // Factory for a fresh, raw HTTP client
})
```

## Request Flow

### 1. Normal Request
```
Component -> useRestHttpClient.request
  -> Merge Config (JWT, Store ID)
  -> useHttpClient.request
    -> Pre-Flight Check (Online? Auth OK?)
    -> Wait for Token Refresh (if active)
    -> Add Global Headers (X-WCPOS)
    -> Schedule in Global Queue
      -> Execute Platform Request (Axios/IPC)
```

### 2. Token Refresh (401 Error)
```
Request Failed (401)
  -> Token Refresh Handler
    -> Is Refreshing?
      -> Yes: Await Shared Promise -> Retry
      -> No: Start Refresh
         -> Pause Queue (optional, relies on State Manager)
         -> Fetch New Token
         -> Update DB
         -> Resume
         -> Retry
```

### 3. Auth Failure (Refresh Failed)
```
Refresh Failed
  -> Token Refresh Handler throws marked error
    -> Fallback Auth Handler
      -> Trigger OAuth Flow
      -> Set State: Auth Failed
      -> Block Queue
      -> Wait for User Login
```

## Known Issues & TODOs

*   **Request Cancellation**: No implementation for cancelling in-flight requests on unmount.
*   **Deduplication**: Identical concurrent GET requests are not deduplicated.
*   **Retry Logic**: No automatic retry for network errors (timeouts, 5xx), only for auth errors.

## Dependencies

*   `axios`: Core HTTP client.
*   `bottleneck`: Queue management.
*   `rxjs`: Observable state for tokens and errors.
*   `expo-auth-session`: OAuth handling.
*   `@wcpos/utils/logger`: Structured logging.
