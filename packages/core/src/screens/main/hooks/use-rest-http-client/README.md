# useRestHttpClient Hook

## Overview

The `useRestHttpClient` hook is a specialized HTTP client for WordPress/WooCommerce REST API communication. It extends the lower-level `useHttpClient` hook with REST API-specific features including automatic JWT authentication, token refresh, OAuth fallback, store context injection, and server compatibility workarounds.

**Relationship to useHttpClient**: This hook is a high-level wrapper around `useHttpClient` (from `@wcpos/hooks/use-http-client`) that configures it specifically for REST API endpoints with authentication and site-specific settings.

## Recent Improvements (v2.0)

### Integration with Global Request State Manager

**New Features**:
- ✅ **Online Status Sync**: Automatically syncs online status to global state manager
- ✅ **Coordinated Offline Handling**: Pre-flight checks prevent offline requests
- ✅ **Simplified Request Logic**: Removed manual offline checks (now handled globally)
- ✅ **Auth State Coordination**: OAuth success clears global auth-failed state

**Changes**:
```typescript
// OLD: Manual offline checks in every request
if (onlineStatus === 'offline') {
  throw new Error('Device is offline');
}

// NEW: Automatic via useEffect + state manager
useEffect(() => {
  const isOffline = onlineStatus === 'offline' || 
                   onlineStatus === 'online-website-unavailable';
  requestStateManager.setOffline(isOffline);
}, [onlineStatus]);

// Requests are now automatically blocked by pre-flight checks!
```

## Architecture

### File Structure

```
use-rest-http-client/
├── index.ts                  # Main hook implementation
├── auth-error-handler.ts     # Fallback OAuth error handler
├── types.ts                  # TypeScript type definitions
└── README.md                 # This file
```

### Dependency Hierarchy

```
useRestHttpClient
  └── useHttpClient (from @wcpos/hooks)
      ├── Token Refresh Handler (priority: 100)
      └── Fallback Auth Handler (priority: 50)
```

## Core Features

### 1. Two-Tier Authentication Error Handling

Implements a robust authentication flow with automatic token refresh and OAuth fallback:

**Tier 1: Token Refresh Handler** (Priority: 100, Intercepts: true)
- Created via `createTokenRefreshHandler()` from `@wcpos/hooks/use-http-client`
- Automatically handles 401 errors by refreshing the access token
- Uses fetch-based HTTP client to avoid circular error handling
- Marks errors as `isRefreshTokenInvalid` when refresh token is expired

**Tier 2: Fallback Auth Handler** (Priority: 50, Intercepts: true)
- Handles cases where token refresh fails or refresh token is invalid
- Detects `isRefreshTokenInvalid` flag from token refresh handler
- Triggers OAuth flow using `expo-auth-session`
- Emits error to RxJS BehaviorSubject for external subscribers
- Throws `CanceledError` to stop request chain while OAuth flow proceeds

### 2. Automatic JWT Authentication

Supports two modes of JWT injection based on server configuration:

**Header Mode** (default):
```typescript
headers: {
  Authorization: `Bearer ${jwt}`
}
```

**Query Parameter Mode** (when `site.use_jwt_as_param` is true):
```typescript
params: {
  authorization: `Bearer ${jwt}`
}
```

The mode is determined by:
1. `window.initialProps.site.use_jwt_as_param` (for web)
2. `site.use_jwt_as_param` (from site configuration)

### 3. Multi-Store Context Injection

Automatically adds store context to all requests when store ID is not 0:

```typescript
params: {
  store_id: store.id
}
```

This enables multi-store setups where a single WordPress/WooCommerce installation serves multiple stores.

### 4. Online Status Checking

Pre-flight checks prevent unnecessary requests when offline:

- `offline`: Device has no internet connection → Throws "Device is offline"
- `online-website-unavailable`: Internet available but site unreachable → Throws "Website is unreachable"
- `online`: Normal operation

Uses `useOnlineStatus` hook from `@wcpos/hooks`.

### 5. Invalid JSON Recovery

**Problem**: Some WordPress plugins output HTML/text before the JSON response, breaking parsing.

**Solution**: `extractValidJSON()` function attempts to recover valid JSON:

```typescript
function extractValidJSON(responseString) {
  // Find the first { or [
  const indexOfJsonStart = responseString.search(/[{[]/);
  
  // Extract substring and iteratively try to parse
  // from full length down until valid JSON is found
  for (let i = possibleJson.length; i > 0; i--) {
    try {
      return JSON.parse(possibleJson.substring(0, i));
    } catch {
      // Continue trimming
    }
  }
}
```

This is applied automatically when response data is a string instead of an object.

### 6. HTTP Method Workarounds

Some servers/proxies block PUT and PATCH requests. This hook provides workarounds:

**PUT Workaround**:
```typescript
// Converts PUT to POST with override headers
{
  method: 'POST',
  headers: { 'X-HTTP-Method-Override': 'PUT' },
  params: { _method: 'PUT' }
}
```

**PATCH Workaround**:
```typescript
// Converts PATCH to POST with override headers
{
  method: 'POST',
  headers: { 'X-HTTP-Method-Override': 'PATCH' },
  params: { _method: 'PATCH' }
}
```

### 7. OAuth Flow Integration

Integrates with `expo-auth-session` for seamless OAuth authentication:

- **Redirect URI**: `wcpos://[baseUrl]` (deep link to app)
- **Response Type**: Token (implicit flow)
- **Discovery Endpoint**: `site.wcpos_login_url`
- **Auth Flow**: Triggered asynchronously via React state
- **Success Handling**: Calls `handleLoginSuccess()` with auth response
- **Error Handling**: Logs error and shows toast notification

### 8. Error State Observable

Exposes an RxJS BehaviorSubject for components to subscribe to authentication errors:

```typescript
const httpClient = useRestHttpClient('products');

// Subscribe to auth errors
httpClient.error$.subscribe((error) => {
  if (error) {
    // Handle auth error in UI (e.g., show login modal)
  }
});
```

**Purpose**: Allows components to react to authentication failures without tight coupling.

### 9. API URL Auto-Configuration

Automatically configures the WCPos API URL if not set:

```typescript
if (!apiURL) {
  apiURL = site.wp_api_url + 'wcpos/v1';
  site.incrementalPatch({ wcpos_api_url: apiURL });
}
```

**Fallback**: Uses WordPress REST API base URL + `wcpos/v1` namespace.

## API Reference

### useRestHttpClient(endpoint?)

**Parameters**:
- `endpoint` (string, optional): The API endpoint path (e.g., 'products', 'orders')
  - Appended to `baseURL` for all requests
  - Default: empty string

**Returns**: REST HTTP client object with properties:
- `endpoint: string` - The configured endpoint
- `onlineStatus: string` - Current online status ('online', 'offline', 'online-website-unavailable')
- `error$: Observable<Error | null>` - Authentication error observable
- `request(config): Promise<AxiosResponse>` - Raw request method
- `get(url, config?): Promise<AxiosResponse>`
- `post(url, data, config?): Promise<AxiosResponse>`
- `put(url, data, config?)` - POST with PUT override
- `patch(url, data, config?)` - POST with PATCH override
- `delete(url, config?): Promise<AxiosResponse>`
- `head(url, config?): Promise<AxiosResponse>`

### useAuthErrorHandler(site, wpCredentials)

**Internal hook** - Creates the fallback authentication error handler.

**Parameters**:
- `site: Site` - Site configuration object
- `wpCredentials: WPCredentials` - User credentials object

**Returns**: `HttpErrorHandler` configured for OAuth fallback

## Type Definitions

### Site

```typescript
interface Site {
  name: string;                        // Site display name
  wcpos_api_url: string;              // WCPos REST API base URL
  wcpos_login_url: string;            // OAuth authorization endpoint
  wp_api_url: string;                 // WordPress REST API base URL
  use_jwt_as_param?: boolean;         // Send JWT as query param vs header
  incrementalPatch: (data: any) => void; // Update site document
}
```

### WPCredentials

```typescript
interface WPCredentials {
  access_token$: Observable<string>;  // Observable of current access token
  id?: number;                        // User ID
  refresh_token?: string;             // Refresh token for obtaining new access tokens
  expires_in?: number;                // Token expiration time in seconds
  incrementalPatch: (data) => Promise<any>; // Update credentials document
}
```

### TokenRefreshResponse

```typescript
interface TokenRefreshResponse {
  access_token: string;               // New access token
  refresh_token?: string;             // New refresh token (optional)
  expires_in?: number;                // Token expiration in seconds
}
```

### LoginResponse

```typescript
interface LoginResponse {
  type: 'success' | 'error' | 'cancel';
  params?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  error?: string;
}
```

## Usage Examples

### Basic REST API Request

```typescript
function ProductsList() {
  const httpClient = useRestHttpClient('products');
  
  const fetchProducts = async () => {
    try {
      // GET request to {baseURL}/products/
      const response = await httpClient.get('/');
      return response.data;
    } catch (error) {
      // 401 errors are automatically handled
      console.error('Failed to fetch products:', error);
    }
  };
}
```

### With Specific Product ID

```typescript
function ProductDetail({ productId }) {
  const httpClient = useRestHttpClient('products');
  
  const fetchProduct = async () => {
    // GET request to {baseURL}/products/123
    const response = await httpClient.get(`/${productId}`);
    return response.data;
  };
}
```

### Creating a Resource

```typescript
function CreateProduct() {
  const httpClient = useRestHttpClient('products');
  
  const createProduct = async (productData) => {
    // POST request to {baseURL}/products/
    const response = await httpClient.post('/', productData);
    return response.data;
  };
}
```

### Updating a Resource (PUT Workaround)

```typescript
function UpdateProduct({ productId }) {
  const httpClient = useRestHttpClient('products');
  
  const updateProduct = async (productData) => {
    // POST with PUT override to {baseURL}/products/123
    // Automatically adds X-HTTP-Method-Override: PUT header
    const response = await httpClient.put(`/${productId}`, productData);
    return response.data;
  };
}
```

### Subscribing to Auth Errors

```typescript
function AuthErrorDisplay() {
  const httpClient = useRestHttpClient();
  const [authError, setAuthError] = React.useState(null);
  
  React.useEffect(() => {
    const subscription = httpClient.error$.subscribe(setAuthError);
    return () => subscription.unsubscribe();
  }, [httpClient]);
  
  if (authError) {
    return <AuthErrorModal error={authError} />;
  }
  
  return null;
}
```

### Checking Online Status

```typescript
function MyComponent() {
  const httpClient = useRestHttpClient('products');
  
  if (httpClient.onlineStatus === 'offline') {
    return <OfflineMessage />;
  }
  
  if (httpClient.onlineStatus === 'online-website-unavailable') {
    return <WebsiteUnavailableMessage />;
  }
  
  // Normal rendering
}
```

## Authentication Flow Details

### Normal Request Flow (UPDATED)

```
Component
  → httpClient.get(url)
    → request(config)
      → Build config:
        - baseURL: {site.wcpos_api_url}/{endpoint}
        - JWT: header or query param
        - store_id: if not 0
      → useHttpClient.request(config)
        → [PRE-FLIGHT CHECKS - NEW]
          → requestStateManager.checkCanProceed()
            → Offline? ❌ Fail immediately
            → Auth failed? ❌ Fail immediately
            → Requests paused? ⏸️ Wait
          → requestStateManager.isTokenRefreshing()?
            → Yes: ⏸️ Wait for refresh to complete
            → No: ✅ Proceed
        → [All useHttpClient features apply]
      → Response string? extractValidJSON()
    ← Return response
```

### Token Refresh Flow (401 Error) - COORDINATED (UPDATED)

```
401 Error (from Request 1)
  → Token Refresh Handler (priority: 100)
    → Check: requestStateManager.isTokenRefreshing()?
      → Yes: ⏸️ Await refresh, then retry ✅
      → No: 🚀 Start coordinated refresh:
        → requestStateManager.startTokenRefresh(async () => {
            → Check: has refresh_token?
              → No: throw error
              → Yes: Fetch-based POST {wcpos_api_url}auth/refresh
                → Success: access_token received
                  → Update wpCredentials.incrementalPatch()
                  → Store new token in closure
                  → Resolve shared promise ✅
                → Fail (401): Refresh token invalid
                  → requestStateManager.setAuthFailed(true)
                  → Mark error.isRefreshTokenInvalid = true
                  → Throw error (continues to fallback handler)
          })
        → Update request config with new token
        → Retry original request with new token ✅

401 Error (from Request 2-10, concurrent with Request 1)
  → Token Refresh Handler (priority: 100)
    → Check: requestStateManager.isTokenRefreshing()?
      → Yes: ⏸️ Await shared refresh promise
        → Request 1 completes refresh
        → Token updated in database
        → Shared promise resolves
      → Retry with original config ✅
        → Token auto-updated via observable in useRestHttpClient

New Request (during token refresh):
  → Pre-flight check: isTokenRefreshing() = true
    → Waits for refresh to complete
    → Token updated
  → Proceeds with fresh token ✅
```

**Important**: The request queue is NOT paused during token refresh. Coordination happens via:
- Shared promise that all concurrent 401s await
- Pre-flight checks that wait for token refresh
- Observable token updates that propagate automatically

### OAuth Fallback Flow (Refresh Token Invalid) - UPDATED

```
Error with isRefreshTokenInvalid flag
  → Fallback Auth Handler (priority: 50)
    → Check: error.isRefreshTokenInvalid?
      → Yes: Continue
    → Emit error to errorSubject
    → Set shouldTriggerAuth = true
    → Throw CanceledError (stops request chain)
  
  → React.useEffect (shouldTriggerAuth)
    → promptAsync() [expo-auth-session]
      → Opens OAuth flow in browser/webview
      → User authenticates
      → Redirect to wcpos://[baseUrl]
      → Response captured
  
  → React.useEffect (response)
    → Type: success
      → requestStateManager.setAuthFailed(false) 🆕 Clear global auth state
      → handleLoginSuccess(response)
        → Update wpCredentials with new tokens
        → User can retry request
        → All blocked requests can now proceed ✅
    → Type: error
      → Show toast notification
      → User must resolve manually
```

**New Behavior**: When OAuth succeeds, the global auth-failed state is cleared, allowing all blocked requests to proceed automatically.

## Request Configuration

All requests are automatically configured with:

### Base Configuration

```typescript
{
  baseURL: '{site.wcpos_api_url}/{endpoint}',
  headers: {
    // JWT in header mode
    Authorization: 'Bearer {jwt}',
    
    // From useHttpClient
    'X-WCPOS': '1',
    
    // Development mode
    'XDEBUG_SESSION': 'start' // if NODE_ENV === 'development'
  },
  params: {
    // JWT in query param mode
    authorization: 'Bearer {jwt}', // if use_jwt_as_param
    
    // Multi-store context
    store_id: '{store.id}', // if store.id !== 0
    
    // Development mode
    'XDEBUG_SESSION': 'start' // if NODE_ENV === 'development'
  }
}
```

### PUT Request Configuration

```typescript
{
  method: 'POST', // Changed from PUT
  headers: {
    'X-HTTP-Method-Override': 'PUT', // Server override
    ...baseHeaders
  },
  params: {
    _method: 'PUT', // WordPress override
    ...baseParams
  }
}
```

### PATCH Request Configuration

```typescript
{
  method: 'POST', // Changed from PATCH
  headers: {
    'X-HTTP-Method-Override': 'PATCH', // Server override
    ...baseHeaders
  },
  params: {
    _method: 'PATCH', // WordPress override
    ...baseParams
  }
}
```

## Implementation Details

### Token Refresh with Fetch-Based Client

To avoid circular error handling during token refresh, a fresh HTTP client is created using the Fetch API:

```typescript
const getHttpClient = () => ({
  post: async (url, data, config = {}) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return {
      data: await response.json(),
      status: response.status,
      statusText: response.statusText,
    };
  }
});
```

**Why Fetch?**: Ensures token refresh requests don't go through the error handler chain, preventing infinite loops.

### OAuth Flow State Management

OAuth flow is triggered via React state to handle it asynchronously:

```typescript
const [shouldTriggerAuth, setShouldTriggerAuth] = useState(false);

// In error handler
setShouldTriggerAuth(true);
throw new CanceledError('401 - attempting re-authentication');

// In useEffect
useEffect(() => {
  if (shouldTriggerAuth) {
    setShouldTriggerAuth(false); // Reset flag
    promptAsync().catch(handleError);
  }
}, [shouldTriggerAuth, promptAsync]);
```

**Why State?**: Allows the error handler to complete synchronously while OAuth flow runs asynchronously in a separate effect.

### Observable Error State

Uses RxJS BehaviorSubject for error state management:

```typescript
const errorSubject = new BehaviorSubject(null);

// In error handler
errorSubject.next(context.error);

// Return as observable
return {
  error$: errorSubject.asObservable()
};
```

**Benefits**:
- Components can subscribe to auth errors
- Multiple subscribers supported
- Reactive updates when errors occur
- Decouples error handling from UI

### Invalid JSON Recovery Algorithm

Iterative approach to extract valid JSON from corrupted responses:

```typescript
function extractValidJSON(responseString) {
  // 1. Find first JSON character ({ or [)
  const indexOfJsonStart = responseString.search(/[{[]/);
  
  // 2. Extract substring from JSON start
  const possibleJson = responseString.substring(indexOfJsonStart);
  
  // 3. Try parsing from full length down
  for (let i = possibleJson.length; i > 0; i--) {
    try {
      return JSON.parse(possibleJson.substring(0, i));
    } catch {
      // Continue trimming from end
    }
  }
  
  // 4. No valid JSON found
  return null;
}
```

**Time Complexity**: O(n²) worst case, but typically O(n) for minor corruption.

## Context Dependencies

The hook depends on several React contexts via `useAppState()`:

### Required Contexts

```typescript
const { site, wpCredentials, store } = useAppState();
```

- **site**: Site configuration (URLs, settings)
- **wpCredentials**: User authentication state (JWT, refresh token)
- **store**: Store context (for multi-store setups)

### Observable State

```typescript
const jwt = useObservableEagerState(wpCredentials.access_token$);
```

Uses `observable-hooks` to subscribe to JWT changes reactively.

## Platform Compatibility

### Supported Platforms

- **Web**: Full support with axios
- **React Native**: Full support with axios
- **Electron**: Full support with IPC-based axios (from useHttpClient)

### OAuth Flow Platforms

- **Web**: Opens in new window/tab
- **React Native**: Opens in system browser with deep link
- **Electron**: Opens in external browser with deep link

## Security Considerations

### Token Storage
- Access tokens observed via RxJS Observable
- Refresh tokens stored in encrypted database
- Tokens never logged in production

### Token Refresh
- Uses separate fetch client to avoid circular handling
- Automatic refresh before expiration (handled by token refresh handler)
- Invalid refresh tokens trigger full re-authentication

### OAuth Flow
- Uses PKCE-disabled implicit flow (controlled environment)
- Redirect URIs validated by server
- Error responses sanitized before display

### API Communication
- JWT in Authorization header (preferred) or query param (fallback)
- HTTPS enforced for production
- XDEBUG only enabled in development

## Error Handling Summary

### Automatic Handling

1. **401 Unauthorized**: Token refresh attempted → OAuth flow on failure
2. **Offline Status**: Early error before request → "Device is offline"
3. **Website Unavailable**: Early error before request → "Website is unreachable"
4. **Invalid JSON**: Automatic recovery via extractValidJSON()
5. **All other errors**: Propagated through useHttpClient error handlers

### Manual Handling Required

- Network errors (other than offline/unavailable)
- Business logic errors (400, 404, 500, etc.)
- Validation errors from API

## Performance Characteristics

### Request Overhead
- JWT injection: O(1)
- Store context injection: O(1)
- Online status check: O(1)
- Config merging: O(n) where n = number of config keys

### Token Refresh
- Frequency: Only on 401 errors
- Retry overhead: 1 additional request (refresh) + 1 retry
- Total: Original request + refresh request + retry = 3 requests

### OAuth Flow
- Frequency: Only when refresh token invalid
- User interaction: Required (blocks until complete)
- Redirect overhead: Platform-dependent

### Memory Usage
- One BehaviorSubject per hook instance
- One OAuth prompt state per hook instance
- Minimal - no caching, no request deduplication

## Known Issues & TODOs

### Current Issues
1. **Error State Management**: `error$` observable marked as experimental
2. **Unused Legacy Handler**: `use-http-error-handler` from parent hook not used
3. **No Request Deduplication**: Multiple identical requests are all executed
4. **No Retry Logic**: Non-auth errors are not retried

### TODOs
- Decide on error state management approach (observable vs context)
- Consider request deduplication for identical concurrent requests
- Add configurable retry logic for network errors
- Optimize config merging (avoid repeated merges)
- Consider caching for GET requests

## Testing Considerations

When testing components using `useRestHttpClient`:

1. **Mock Dependencies**:
   - `useAppState()` → site, wpCredentials, store
   - `useOnlineStatus()` → online status
   - `useHttpClient()` → mock HTTP responses
   - `expo-auth-session` → mock OAuth flow

2. **Test Authentication Flows**:
   - Successful request with valid token
   - 401 → token refresh → retry success
   - 401 → token refresh fails → OAuth flow
   - OAuth success → new tokens
   - OAuth failure → error handling

3. **Test Online Status**:
   - Request with 'offline' status
   - Request with 'online-website-unavailable' status
   - Request with 'online' status

4. **Test Special Features**:
   - Invalid JSON recovery
   - PUT/PATCH method override
   - Store context injection
   - JWT mode (header vs query param)

5. **Test Error Observable**:
   - Subscribe to error$
   - Verify error emission on auth failure
   - Verify null emission on success

## Migration Notes for Refactoring

When refactoring this hook:

1. **Preserve Authentication Flow**: The two-tier (token refresh + OAuth fallback) pattern is critical
2. **Maintain Fetch-Based Refresh Client**: Prevents circular error handling
3. **Keep Method Overrides**: PUT/PATCH workarounds needed for compatibility
4. **Preserve JSON Recovery**: Many production sites need this hack
5. **Maintain Observable API**: Components may subscribe to error$
6. **Keep Online Status Checks**: Prevents unnecessary requests
7. **Preserve Store Context**: Multi-store functionality depends on this

## Dependencies

### Direct Dependencies
- `@wcpos/hooks/use-http-client` - Base HTTP client
- `@wcpos/hooks/use-http-client/create-token-refresh-handler` - Token refresh handler factory
- `@wcpos/hooks/use-online-status` - Network status detection
- `@wcpos/utils/logger` - Logging utility
- `expo-auth-session` - OAuth flow management
- `observable-hooks` - RxJS React integration
- `rxjs` - Reactive state management
- `lodash/get` - Safe property access
- `lodash/merge` - Deep object merging
- `axios` - HTTP client (via useHttpClient)

### Context Dependencies
- `useAppState()` - Site, credentials, and store context
- `useLoginHandler()` - OAuth success handler

## Related Documentation

- [useHttpClient README](../../../hooks/src/use-http-client/README.md) - Base HTTP client
- [Token Refresh Handler](../../../hooks/src/use-http-client/create-token-refresh-handler.ts) - Token refresh implementation

---

*Last Updated: October 27, 2025*
*Version: Pre-refactor documentation*
