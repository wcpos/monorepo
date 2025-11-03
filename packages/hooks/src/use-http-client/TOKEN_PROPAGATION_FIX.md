# Token Propagation Fix

## Problem Identified

When multiple requests received 401 errors simultaneously, the coordinated token refresh was working (only 1 refresh request made), but **waiting requests were retrying with the old expired token**, causing a cascade of additional 401 errors.

## Root Cause

### Before Fix

```typescript
// Request 1: Does the refresh
await requestStateManager.startTokenRefresh(async () => {
  const { access_token } = await refreshToken();
  await wpUser.incrementalPatch({ access_token });
  // Token stored in closure variable
  newAccessToken = access_token;
});

// Request 1 updates its config with newAccessToken
updatedConfig.headers.Authorization = `Bearer ${newAccessToken}`;
return retryRequest(updatedConfig); // ✅ Success!

// Request 2-6: Await the same refresh
await requestStateManager.awaitTokenRefresh();
// ❌ But they don't have access to the new token!
return retryRequest(originalConfig); // ❌ Retry with OLD token → 401!
```

### The Gap

1. Token refresh completes and updates database ✅
2. New token stored in closure variable (only Request 1 has access) ✅
3. Waiting requests unblock ✅
4. **BUT** waiting requests use `originalConfig` with expired token ❌
5. Observable hasn't propagated yet (async) ❌
6. Cascade of 401s begins ❌

## Solution

### After Fix

Store the refreshed token in `RequestStateManager` so ALL requests can access it:

```typescript
class RequestStateManager {
  private refreshedToken: string | null = null;
  
  async startTokenRefresh(refreshFn: () => Promise<string>): Promise<void> {
    this.tokenRefreshPromise = refreshFn()
      .then((newToken) => {
        this.refreshedToken = newToken; // ✅ Store for all requests
        // ...
      });
  }
  
  getRefreshedToken(): string | null {
    return this.refreshedToken;
  }
}
```

### Token Refresh Handler (Updated)

```typescript
// Request 1: Does the refresh and returns the token
await requestStateManager.startTokenRefresh(async () => {
  const { access_token } = await refreshToken();
  await wpUser.incrementalPatch({ access_token });
  return access_token; // ✅ Return token to state manager
});

// Request 1: Gets token from state manager
const freshToken = requestStateManager.getRefreshedToken();
updatedConfig.headers.Authorization = `Bearer ${freshToken}`;
return retryRequest(updatedConfig); // ✅ Success!

// Request 2-6: Await the same refresh
await requestStateManager.awaitTokenRefresh();

// Request 2-6: Get token from state manager
const freshToken = requestStateManager.getRefreshedToken(); // ✅ Available!
updatedConfig.headers.Authorization = `Bearer ${freshToken}`;
return retryRequest(updatedConfig); // ✅ Success!
```

## Flow After Fix

### Scenario: 6 Concurrent Requests, All Get 401

```
2:48:55 - Request 1 (shipping_methods): Gets 401
  → Starts coordinated token refresh
  → Makes refresh request
  → Receives new token
  → Stores in RequestStateManager ✅
  → Updates own config with new token
  → Retries → Success ✅

2:48:55 - Requests 2-6: Get 401, detect refresh in progress
  → /data/order_statuses: Awaits refresh
  → taxes: Awaits refresh  
  → customers: Awaits refresh
  → /taxes/classes: Awaits refresh
  → All blocked on shared promise...

2:48:55 - New Requests: Arrive during refresh
  → products/variations: Pre-flight wait
  → products: Pre-flight wait
  → All blocked waiting for refresh...

2:48:55 - Token Refresh Completes
  → New token stored in RequestStateManager
  → Database updated
  → Shared promise resolves
  → All waiting requests unblock

2:48:55 - Requests 2-6: Unblock and retry
  → Get fresh token from RequestStateManager ✅
  → Update their configs with fresh token ✅
  → Retry → Success ✅
  → All succeed on first retry ✅

2:48:55 - New Requests: Unblock and proceed
  → Note: These still use config built with old token ⚠️
  → May get 401 if observable hasn't updated yet
  → Will trigger their own token refresh wait cycle
  → Should succeed on retry
```

## Remaining Edge Case

**Pre-flight waiting scenario**: New requests that arrive during token refresh and wait at the pre-flight check will proceed with their originally-built config, which may have the old token if the observable hasn't updated yet.

**Likelihood**: Low - Observable updates are fast, and the request has to:
1. Build config during the brief refresh window
2. Hit pre-flight check during refresh
3. Unblock before observable updates

**Impact**: If it happens, request gets 401, detects refresh in progress, waits again, retries with fresh token from state manager → succeeds on second try.

**Potential Future Enhancement**: Have useRestHttpClient re-fetch JWT from observable after pre-flight waits. This would eliminate the edge case entirely.

## Benefits of This Fix

✅ **Eliminates cascade of 401s** from waiting requests  
✅ **All concurrent 401s succeed** on first retry  
✅ **Single source of truth** for refreshed token  
✅ **No timing dependencies** on observable propagation  
✅ **Clean and predictable** behavior  

## Expected Log Output After Fix

```
2:48:55 PM | DEBUG : Access token expired, starting token refresh
2:48:55 PM | DEBUG : Starting coordinated token refresh
2:48:55 PM | DEBUG : Token refresh already in progress, awaiting completion (×5)
2:48:55 PM | DEBUG : Token refresh response received
2:48:55 PM | DEBUG : Token refresh successful
2:48:55 PM | DEBUG : Token refresh completed successfully
2:48:55 PM | DEBUG : Retrying request after successful token refresh (×6)
✅ All 6 requests succeed
✅ No cascade of additional 401s
✅ No multiple token refreshes
```

## Files Changed

1. **request-state-manager.ts**
   - Added `refreshedToken` property
   - Modified `startTokenRefresh()` to accept `() => Promise<string>`
   - Stores returned token
   - Added `getRefreshedToken()` method
   - Added `clearRefreshedToken()` method
   - Updated `reset()` to clear token

2. **create-token-refresh-handler.ts**
   - Refresh function now returns the new access token
   - Waiting requests get token from `requestStateManager.getRefreshedToken()`
   - All requests update their config with fresh token before retry
   - Consistent behavior for both first request and waiting requests

## Testing

To verify the fix works:

1. Let token expire (or wait 30 min)
2. Open app → triggers 5-10 concurrent requests
3. All should get 401
4. Check logs:
   - Should see "Starting coordinated token refresh" once
   - Should see "Awaiting" messages for other requests  
   - Should see "Token refresh completed successfully" once
   - Should see all requests retry successfully
   - Should NOT see cascade of 401s
   - Should NOT see multiple token refreshes

---

*Fix Applied: October 30, 2025*  
*Issue: Token propagation gap in concurrent 401 handling*  
*Status: Resolved*

