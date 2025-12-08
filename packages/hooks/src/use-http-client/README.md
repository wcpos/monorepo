# HTTP Client Hooks Documentation

## Overview

The WCPOS HTTP Client system consists of two layers:

1.  **`useHttpClient`** (`@wcpos/hooks/use-http-client`): A low-level, cross-platform HTTP client abstraction with error handling, token refresh coordination, and request throttling.
2.  **`useRestHttpClient`** (`packages/core/src/screens/main/hooks/use-rest-http-client`): A specialized high-level wrapper for WordPress/WooCommerce REST API communication that handles JWT authentication, store context, and OAuth flows.

This documentation covers both hooks as they are tightly integrated.

---

## Architecture

### File Structure

```
packages/
├── hooks/src/use-http-client/           # Low-level Client
│   ├── index.ts                         # Public exports
│   ├── use-http-client.tsx              # Main hook implementation
│   ├── create-token-refresh-handler.ts  # Token refresh error handler
│   ├── request-state-manager.ts         # Global state singleton
│   ├── request-queue.ts                 # Global Bottleneck queue
│   ├── parse-wp-error.ts                # WordPress/WooCommerce error parsing
│   ├── types.ts                         # TypeScript interfaces
│   ├── http.ts                          # Platform-agnostic export
│   ├── http.web.ts                      # Web/Native: direct axios
│   └── http.electron.ts                 # Electron: IPC bridge to main process
│
└── core/src/screens/main/hooks/use-rest-http-client/  # High-level REST Client
    ├── index.ts                         # REST hook implementation
    ├── auth-error-handler.ts            # OAuth fallback handler
    └── types.ts                         # Type definitions
```

### Dependency Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                        @wcpos/query                                  │
│  CollectionReplicationState / QueryReplicationState                  │
│  - Manages polling, syncing collections with server                  │
│  - Catches HTTP errors and displays user-facing messages             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────────────┐
│                   useRestHttpClient                                  │
│  - Adds JWT token (header or query param)                            │
│  - Adds store_id for multi-store support                             │
│  - Provides error handlers: tokenRefreshHandler + fallbackAuthHandler│
│  - Extracts valid JSON from malformed server responses               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────────────┐
│                      useHttpClient                                   │
│  - Pre-flight checks via RequestStateManager                         │
│  - Error handler chain processing                                    │
│  - CanceledError suppression                                         │
│  - WordPress error enrichment                                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────────────┐
│              RequestStateManager (Singleton)                         │
│  - offline: boolean       - Blocks requests when device offline      │
│  - authFailed: boolean    - Blocks requests until re-authentication  │
│  - isRefreshing: boolean  - Coordinates concurrent token refreshes   │
│  - refreshedToken: string - Stores new token for waiting requests    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────────────┐
│           Platform HTTP Adapter (http.ts)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  http.web.ts    │  │  http.ts        │  │  http.electron.ts   │  │
│  │  Direct axios   │  │  (native)       │  │  IPC → Main Process │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

### Error Handler Chain

Error handlers are processed in **priority order** (highest first). Each handler can:
- **Handle** the error: Return a response to stop the chain
- **Pass**: Return nothing to let the next handler try
- **Intercept**: Throw an error to stop the chain (even if handling failed)

```
Request fails with error
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Error Handler Chain (sorted by priority)                     │
│                                                               │
│  1. token-refresh (priority: 100)                             │
│     - canHandle: error.response?.status === 401               │
│     - action: Refresh JWT, retry request                      │
│     - intercepts: true                                        │
│                                                               │
│  2. fallback-auth-handler (priority: 50)                      │
│     - canHandle: 401 OR isRefreshTokenInvalid OR AUTH_REQUIRED│
│     - action: Trigger OAuth flow, throw CanceledError         │
│     - intercepts: true                                        │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  useHttpClient post-processing                                │
│  - If CanceledError: return pending promise (suppress error)  │
│  - Otherwise: Enrich with WP error details, re-throw          │
└──────────────────────────────────────────────────────────────┘
```

### 401 Error Flow (Token Refresh)

```
1. Request fails with 401
       │
       ▼
2. token-refresh handler checks: Is refresh already in progress?
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
3a. Wait for    3b. Start token refresh
    shared          │
    promise         ├─ Set isRefreshing = true
   │               ├─ Call /auth/refresh endpoint
   │               ├─ Store new token in DB
   │               └─ Set isRefreshing = false
   │       │
   └───┬───┘
       │
       ▼
4. Get refreshed token from RequestStateManager
       │
       ▼
5. Retry original request with new token
       │
   ┌───┴───┐
   │       │
SUCCESS  STILL 401
   │       │
   ▼       ▼
6a. Return  6b. Mark error: isRefreshTokenInvalid = true
    response    Set authFailed = true
               Throw error → fallback-auth-handler
```

### OAuth Fallback Flow

```
1. fallback-auth-handler receives error with isRefreshTokenInvalid
       │
       ▼
2. Trigger OAuth flow (promptAsync)
       │
   ┌───┴───────────────┬────────────────┐
   │                   │                │
SUCCESS            CANCEL/DISMISS    ERROR
   │                   │                │
   ▼                   ▼                ▼
3a. Save tokens    3b. authFailed     3c. Show error toast
    Clear authFailed   stays TRUE         authFailed stays TRUE
    Requests resume    Requests blocked   Requests blocked
                       │
                       ▼
                   User sees toast with [Login] button
                   to manually retry OAuth
```

### Pre-flight vs Post-flight Errors

| Type | When | Error | Handler |
|------|------|-------|---------|
| **Pre-flight** | Before request | `AUTH_REQUIRED` | Blocked by `checkCanProceed()` |
| **Post-flight** | After 401 response | `AxiosError` | `token-refresh` → `fallback-auth` |

Pre-flight errors (e.g., `authFailed = true`) are caught by `fallback-auth-handler` and show a toast with a [Login] button, rather than auto-launching OAuth repeatedly.

---

## Electron IPC Architecture

In Electron, HTTP requests are made in the **main process** (Node.js) and results are passed to the **renderer process** (React Native) via IPC.

### IPC Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS (React Native / Chromium)                     │
│                                                                 │
│  http.electron.ts                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  request(config)                                           │ │
│  │    │                                                       │ │
│  │    ├─ Generate requestId (for cancellation)                │ │
│  │    ├─ Setup AbortSignal/CancelToken listeners              │ │
│  │    ├─ Send: { type: 'request', requestId, config }         │ │
│  │    │                                                       │ │
│  │    │  ┌─────── IPC invoke('axios', ...) ───────┐           │ │
│  │    │  │                                        │           │ │
│  │    │  ▼                                        │           │ │
│  │    │  (waits for response)                     │           │ │
│  │    │                                        ▲  │           │ │
│  │    │  └────────────────────────────────────┘   │           │ │
│  │    │                                           │           │ │
│  │    ├─ Receive: { success, data, status, ... }  │           │ │
│  │    │       OR: { success: false, message, ... }│           │ │
│  │    │                                           │           │ │
│  │    ├─ If error: Reconstruct AxiosError         │           │ │
│  │    └─ Return response or reject promise        │           │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (JSON serialization boundary)
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                         │
│                                                                 │
│  apps/electron/src/main/axios.ts                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ipcMain.handle('axios', async (event, data) => {          │ │
│  │    if (data.type === 'request') {                          │ │
│  │      try {                                                 │ │
│  │        const response = await axios.request(data.config);  │ │
│  │        return { success: true, ...response };              │ │
│  │      } catch (error) {                                     │ │
│  │        return serializeAxiosError(error);                  │ │
│  │      }                                                     │ │
│  │    }                                                       │ │
│  │    if (data.type === 'cancel') {                           │ │
│  │      abortControllers.get(data.requestId)?.abort();        │ │
│  │    }                                                       │ │
│  │  });                                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### IPC Serialization Contract

**What CAN cross IPC (JSON-serializable):**
```typescript
// Success response
{
  success: true,
  data: any,              // Response body
  status: number,         // HTTP status code
  statusText: string,
  headers: Record<string, string>
}

// Error response
{
  success: false,
  name: string,           // 'AxiosError', 'CanceledError'
  message: string,
  code?: string,          // 'ERR_CANCELED', 'ECONNREFUSED', etc.
  response?: {
    status: number,
    statusText: string,
    data: any,
    headers: Record<string, string>
  }
}
```

**What CANNOT cross IPC:**
- Prototype chain (`instanceof` checks fail on raw IPC data)
- Circular references
- Functions
- Non-enumerable properties
- Node.js objects (http.ClientRequest, etc.)

### Error Reconstruction

The renderer reconstructs proper `AxiosError` instances so downstream code doesn't need to know it's running in Electron:

```typescript
// http.electron.ts
const toAxiosError = (result: any): AxiosError => {
  return new AxiosError(
    result.message,
    result.code,
    result.config,
    result.request,
    result.response
  );
};
```

After reconstruction:
- ✅ `error instanceof AxiosError` → true
- ✅ `error.response?.status` → works
- ✅ `error.code` → 'ERR_CANCELED', etc.

### Promise Rejection Timing (`queueMicrotask`)

**Problem**: In Electron, promise rejections that happen during IPC can trigger React Native's global error handler (Redbox) before our `catch` handlers run.

**Solution**: Defer rejections to the next microtask:

```typescript
const deferReject = (reject: (error: any) => void, error: any) => {
  queueMicrotask(() => reject(error));
};
```

This ensures the promise chain is fully established before the rejection propagates.

### Request Cancellation in Electron

```typescript
// Renderer: Setup cancellation
const requestId = crypto.randomUUID();
signal.addEventListener('abort', () => {
  window.ipcRenderer.invoke('axios', { type: 'cancel', requestId });
});

// Main: Handle cancellation
const abortControllers = new Map<string, AbortController>();
// On request: store controller
// On cancel: controller.abort()
```

---

## Core Features

### 1. Global Request State Manager

A singleton `RequestStateManager` coordinates all HTTP requests across the application.

| State | Purpose | Effect |
|-------|---------|--------|
| `offline` | Device has no network | Requests fail immediately with `DEVICE_OFFLINE` |
| `authFailed` | Authentication invalid | Requests fail immediately with `AUTH_REQUIRED` |
| `isRefreshing` | Token refresh in progress | Requests wait for refresh to complete |
| `refreshedToken` | New token after refresh | Used by waiting requests to retry |

### 2. Global Request Queue

All requests share a **single global queue** using `bottleneck`:
- **Max Concurrent**: 10
- **High Water**: 50
- **Strategy**: Block when full

### 3. Token Refresh Coordination

The system uses a **shared promise pattern** to prevent race conditions:

```typescript
// First 401 triggers refresh
requestStateManager.startTokenRefresh(async () => {
  const newToken = await refreshTokenFromServer();
  return newToken;  // Stored in RequestStateManager
});

// Subsequent 401s wait for the same promise
await requestStateManager.awaitTokenRefresh();
const token = requestStateManager.getRefreshedToken();
```

### 4. WordPress/WooCommerce Error Parsing

WordPress and WooCommerce return errors in a specific format:

```json
{
  "code": "woocommerce_rest_cannot_view",
  "message": "Sorry, you cannot view this resource.",
  "data": { "status": 401 }
}
```

The `parseWpError` utility extracts these details:

```typescript
import { parseWpError, extractErrorMessage } from '@wcpos/hooks/use-http-client';

try {
  await httpClient.get('/api/resource');
} catch (error) {
  const { message, code, status, isWpError } = parseWpError(error.response?.data);
  // message: "Sorry, you cannot view this resource."
  // code: "woocommerce_rest_cannot_view"
  // status: 401
}
```

After `useHttpClient` catches an error, it enriches it with:
- `error.wpCode` - WordPress error code
- `error.wpMessage` - User-friendly message
- `error.wpStatus` - HTTP status from WP response

### 5. REST API Specific Features (`useRestHttpClient`)

- **Automatic JWT Injection**: Adds `Authorization: Bearer <token>` to headers (or query params if `use_jwt_as_param` is configured)
- **Multi-Store Context**: Automatically injects `store_id` parameter
- **Method Workarounds**: Converts PUT/PATCH to POST with `X-HTTP-Method-Override` headers for server compatibility
- **Invalid JSON Recovery**: Heuristic parser to extract JSON from corrupted responses (e.g., PHP warnings mixed in response)

---

## API Reference

### `useHttpClient(errorHandlers?)`

Low-level hook for general HTTP requests.

```typescript
import useHttpClient from '@wcpos/hooks/use-http-client';

const httpClient = useHttpClient(errorHandlers);

// Methods
await httpClient.get(url, config);
await httpClient.post(url, data, config);
await httpClient.put(url, data, config);
await httpClient.patch(url, data, config);
await httpClient.delete(url, config);
await httpClient.head(url, config);
await httpClient.request(config);
```

**Parameters:**
- `errorHandlers` (optional): Array of `HttpErrorHandler`. **Must be a stable reference** (use `useMemo` or define outside component).

### `useRestHttpClient(endpoint?)`

High-level hook for WC REST API.

```typescript
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';

const client = useRestHttpClient('products');
const response = await client.get('/');  // GET /wp-json/wcpos/v1/products
```

**Returns:**
- All `useHttpClient` methods
- `endpoint`: The configured endpoint
- `onlineStatus`: Current network status
- `error$`: Observable of errors (for subscriptions)

### `createTokenRefreshHandler(config)`

Factory for the token refresh error handler.

```typescript
import { createTokenRefreshHandler } from '@wcpos/hooks/use-http-client';

const handler = createTokenRefreshHandler({
  site: { wcpos_api_url, use_jwt_as_param },
  wpUser: { id, refresh_token, incrementalPatch },
  getHttpClient: () => ({ post: fetchWrapper })  // Raw HTTP client for refresh
});
```

### `requestStateManager`

Singleton for global request coordination.

```typescript
import { requestStateManager } from '@wcpos/hooks/use-http-client';

// Check if request can proceed
const { ok, reason, errorCode } = requestStateManager.checkCanProceed();

// State management
requestStateManager.setOffline(true);
requestStateManager.setAuthFailed(true);

// Token refresh coordination
await requestStateManager.startTokenRefresh(refreshFn);
await requestStateManager.awaitTokenRefresh();
const token = requestStateManager.getRefreshedToken();

// Reset (for logout/testing)
requestStateManager.reset();
```

### Error Handler Interface

```typescript
interface HttpErrorHandler {
  name: string;                                    // Unique identifier
  priority?: number;                               // Higher = runs first
  intercepts?: boolean;                            // Stops chain if handling fails
  canHandle: (error: AxiosError) => boolean;       // Check if can process
  handle: (context: HttpErrorHandlerContext) => Promise<AxiosResponse | void>;
}

interface HttpErrorHandlerContext {
  error: AxiosError;
  originalConfig: AxiosRequestConfig;
  retryRequest: (config?: AxiosRequestConfig) => Promise<AxiosResponse>;
  retryCount: number;
}
```

---

## Usage Examples

### Basic GET Request

```typescript
const httpClient = useHttpClient();
const response = await httpClient.get('/api/users');
```

### With Custom Error Handler

```typescript
const retryHandler: HttpErrorHandler = {
  name: 'retry-5xx',
  priority: 75,
  canHandle: (error) => error.response?.status >= 500,
  handle: async ({ retryRequest, retryCount }) => {
    if (retryCount < 3) {
      await new Promise(r => setTimeout(r, 1000 * retryCount));
      return retryRequest();
    }
  }
};

const errorHandlers = useMemo(() => [retryHandler], []);
const httpClient = useHttpClient(errorHandlers);
```

### REST API with Store Context

```typescript
const productClient = useRestHttpClient('products');

// Automatically includes JWT and store_id
const products = await productClient.get('/', {
  params: { per_page: 10, status: 'publish' }
});
```

---

## Known Limitations

| Issue | Description | Workaround |
|-------|-------------|------------|
| No request cancellation on unmount | In-flight requests continue after component unmounts | Use AbortController manually |
| No request deduplication | Identical concurrent GETs make separate requests | Implement caching layer |
| No retry for network errors | Only auth errors trigger retry | Add custom error handler |
| Auth state can get stuck | If OAuth silently fails, `authFailed` stays true | User must restart app or manually trigger login |

---

## Dependencies

- `axios`: Core HTTP client
- `bottleneck`: Queue management  
- `rxjs`: Observable state for tokens and errors
- `expo-auth-session`: OAuth handling
- `@wcpos/utils/logger`: Structured logging with toast support
