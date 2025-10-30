# Logging Guidelines for HTTP Client Hooks

This document defines the logging strategy for `useHttpClient` and `useRestHttpClient` hooks.

## Logging Principles

### Three Levels of Visibility

1. **Toast Notifications** (`showToast: true`) - User-facing messages
2. **Database Logs** (`saveToDb: true`) - Trackable events for support/audit
3. **Console/Debug** - Developer debugging information

### When to Use Each Level

#### Toast Notifications (User-Facing)
**Purpose**: Inform users of issues requiring their attention or action

**Use for**:
- ✅ Authentication failures requiring re-login
- ✅ Network connectivity issues preventing app use
- ✅ Critical errors that stop functionality
- ✅ Success messages for important actions (login success)
- ✅ Queue overflow (too many pending requests)

**Don't use for**:
- ❌ Internal state changes
- ❌ Successful operations (except critical ones)
- ❌ Debug information
- ❌ Automatic recoveries that succeed

**Example**:
```typescript
log.error('Your session has expired - please log in again', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.REFRESH_TOKEN_INVALID,
    userId: wpUser.id,
  },
});
```

#### Database Logs (Trackable Events)
**Purpose**: Create audit trail for support and debugging

**Use for**:
- ✅ Authentication failures
- ✅ Token refresh failures
- ✅ Malformed JSON recovery attempts
- ✅ Request queue overflow
- ✅ Any error shown to user
- ✅ Security-relevant events

**Don't use for**:
- ❌ Successful normal operations
- ❌ Debug state changes
- ❌ High-frequency events (every request)
- ❌ Expected errors that are handled gracefully

**Example**:
```typescript
log.warn('Server returned text instead of JSON - attempting recovery', {
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.JSON_RECOVERY_ATTEMPTED,
    endpoint,
    url: config.url,
  },
});
```

#### Console/Debug (Developer Information)
**Purpose**: Help developers understand flow and troubleshoot issues

**Use for**:
- ✅ State transitions (token refreshing started/completed)
- ✅ Request coordination (awaiting refresh, retry after refresh)
- ✅ Pre-flight checks (request blocked, request proceeding)
- ✅ Handler chain processing
- ✅ Timing and performance data
- ✅ Successful recoveries

**Don't use for**:
- ❌ Production performance-critical paths (minimize logging in hot paths)
- ❌ Sensitive data (tokens, passwords)
- ❌ Excessive detail that obscures important information

**Example**:
```typescript
log.debug('Token refresh in progress, waiting before making request', {
  context: {
    url: config.url,
    method: config.method,
  },
});
```

## Error Code Usage

### Always Include Error Codes For

1. **All user-facing errors** (showToast: true)
2. **All database-logged events** (saveToDb: true)
3. **Any error that might need documentation**

### Error Code Reference

See `packages/utils/src/logger/error-codes.ts` for complete list. Common codes:

#### Authentication
- `ERROR_CODES.TOKEN_EXPIRED` - Session expired (auto-handled)
- `ERROR_CODES.TOKEN_REFRESH_FAILED` - Could not refresh session
- `ERROR_CODES.REFRESH_TOKEN_INVALID` - Must log in again
- `ERROR_CODES.AUTH_REQUIRED` - Authentication needed
- `ERROR_CODES.INVALID_CREDENTIALS` - Login failed

#### Connection
- `ERROR_CODES.DEVICE_OFFLINE` - No internet connection
- `ERROR_CODES.WEBSITE_UNAVAILABLE` - Site unreachable
- `ERROR_CODES.CONNECTION_REFUSED` - Server rejected connection
- `ERROR_CODES.CONNECTION_TIMEOUT` - Server too slow

#### Request/Response
- `ERROR_CODES.REQUEST_QUEUE_FULL` - Too many pending requests
- `ERROR_CODES.MALFORMED_JSON_RESPONSE` - Invalid server response
- `ERROR_CODES.JSON_RECOVERY_ATTEMPTED` - Recovered from bad JSON

## Specific Scenarios

### Token Refresh Flow

#### Starting Token Refresh
```typescript
// DEBUG - developer information
log.debug('Access token expired, starting token refresh', {
  context: {
    userId: wpUser.id,
    siteUrl: site.url,
    originalUrl: originalConfig.url,
  },
});
```

#### Token Refresh Success
```typescript
// DEBUG - developer information
log.debug('Token refresh completed successfully');
```

#### Token Refresh Failed (Invalid Refresh Token)
```typescript
// ERROR - user toast + database
log.error('Your session has expired - please log in again', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.REFRESH_TOKEN_INVALID,
    userId: wpUser.id,
    siteUrl: site.url,
  },
});
```

#### Token Refresh Failed (Other Reason)
```typescript
// ERROR - database only (internal error)
log.error('Unable to refresh session', {
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
    error: errorMsg,
    userId: wpUser.id,
  },
});
```

### Request Coordination

#### Request Blocked (Offline)
```typescript
// DEBUG only - error will be thrown and caught by calling code
log.debug('Request blocked by pre-flight check', {
  context: {
    errorCode: ERROR_CODES.DEVICE_OFFLINE,
    reason: 'No internet connection',
    url: config.url,
  },
});
```

#### Request Blocked (Auth Failed)
```typescript
// DEBUG only - error will be thrown and caught by calling code
log.debug('Request blocked by pre-flight check', {
  context: {
    errorCode: ERROR_CODES.AUTH_REQUIRED,
    reason: 'Please log in to continue',
    url: config.url,
  },
});
```

#### Request Waiting for Token Refresh
```typescript
// DEBUG - developer information
log.debug('Token refresh in progress, waiting before making request', {
  context: {
    url: config.url,
    method: config.method,
  },
});
```

### OAuth Flow

#### OAuth Triggered
```typescript
// DEBUG - developer information
log.debug('Triggering OAuth authentication flow');
```

#### OAuth Success
```typescript
// SUCCESS - user toast + debug details
log.success('Successfully logged in', {
  showToast: true,
});

log.debug('Authentication successful', {
  context: {
    siteName: site.name,
    userId: wpCredentials.id,
  },
});
```

#### OAuth Failed
```typescript
// ERROR - user toast + database
log.error('Authentication failed - please try again', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.AUTH_REQUIRED,
    siteName: site.name,
    error: authError.message,
  },
});
```

### JSON Recovery

#### Invalid JSON Detected
```typescript
// WARN - database (not toast, might succeed in recovery)
log.warn('Server returned text instead of JSON - attempting recovery', {
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.JSON_RECOVERY_ATTEMPTED,
    endpoint,
    url: config.url,
    responsePreview: response.data.substring(0, 200),
  },
});
```

#### JSON Recovery Successful
```typescript
// DEBUG - developer information
log.debug('Successfully recovered valid JSON from response');
```

#### JSON Recovery Failed
```typescript
// ERROR - database only (internal)
log.error('Unable to parse server response', {
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.MALFORMED_JSON_RESPONSE,
    responsePreview: responseString.substring(0, 200),
  },
});
```

### Request Queue

#### Queue Full
```typescript
// ERROR - user toast + database
log.error('Too many requests queued - please wait', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.REQUEST_QUEUE_FULL,
    error: error.message,
  },
});
```

#### Request Failed in Queue
```typescript
// DEBUG only - actual error handled by error handler chain
log.debug('Request failed in queue', {
  context: {
    error: error.message,
    retryCount: jobInfo.retryCount,
  },
});
```

## Message Writing Guidelines

### User-Facing Messages (Toast)

**Do**:
- ✅ Use clear, non-technical language
- ✅ Explain what happened
- ✅ Suggest what to do next
- ✅ Keep it concise (under 50 characters if possible)

**Don't**:
- ❌ Use technical jargon (HTTP 401, axios, token refresh)
- ❌ Show stack traces or implementation details
- ❌ Blame the user
- ❌ Be vague ("Something went wrong")

**Examples**:

Good:
- "Your session has expired - please log in again"
- "No internet connection"
- "Please log in to continue"
- "Too many requests queued - please wait"

Bad:
- "Token refresh failed with 401"
- "Error in token refresh handler"
- "Request blocked"
- "Something went wrong"

### Debug Messages (Console)

**Do**:
- ✅ Be specific and detailed
- ✅ Include state values
- ✅ Describe what's happening in the flow
- ✅ Include relevant IDs and URLs
- ✅ Use consistent terminology

**Don't**:
- ❌ Log on every single request (too noisy)
- ❌ Log sensitive data (tokens, passwords, full user objects)
- ❌ Duplicate information already in context
- ❌ Use unclear abbreviations

**Examples**:

Good:
- "Token refresh in progress, waiting before making request"
- "Device is now offline - requests will be blocked"
- "Request blocked by pre-flight check"
- "Authentication restored - requests can proceed"

Bad:
- "TR in prog"
- "Req blkd"
- "State changed"
- Logging full token values

### Database Logs (Audit Trail)

**Do**:
- ✅ Include error code
- ✅ Include user/site identifiers
- ✅ Include timestamp (automatic)
- ✅ Keep context focused (relevant data only)
- ✅ Log actual errors, not normal flow

**Don't**:
- ❌ Log successful normal operations
- ❌ Log every state change
- ❌ Include sensitive data
- ❌ Create excessive logs (will fill database)

## Log Levels

### error
- Authentication failures
- Network failures that block functionality
- Data corruption or loss
- Queue overflow
- Unrecoverable errors

### warn
- Recovered errors (JSON recovery)
- Deprecated feature usage
- Configuration issues that have fallbacks
- Performance concerns

### info
- Not currently used in HTTP hooks (reserved for business logic)

### success
- Successful authentication
- Critical operations completed
- Recovery from failed state

### debug
- State transitions
- Request coordination
- Handler chain processing
- Pre-flight checks
- Timing information
- Flow control

## Context Data Guidelines

### Always Include
- `errorCode` (for errors and warnings)
- `userId` (when available)
- `siteName` or `siteUrl` (when relevant)
- `url` or `endpoint` (for request errors)

### Sometimes Include
- `retryCount` (for retry scenarios)
- `method` (for request debugging)
- `responseStatus` (for HTTP errors)
- `responsePreview` (for response parsing issues - limit to 200 chars)

### Never Include
- ❌ Full access tokens
- ❌ Refresh tokens
- ❌ Passwords
- ❌ Full response bodies (too large)
- ❌ Complete error stacks (use error.message)

## Performance Considerations

### High-Frequency Paths (Minimize Logging)

- **Every request**: Only debug level, only if significant
- **State checks**: No logging unless state changes
- **Success paths**: Minimal debug logging
- **Pre-flight checks**: Debug only, no context unless blocked

### Low-Frequency Paths (More Logging OK)

- **Token refresh**: Detailed logging acceptable (rare event)
- **Authentication flow**: Detailed logging acceptable
- **Error scenarios**: Detailed context helpful
- **State changes**: Log transitions

### Production vs Development

Development (`__DEV__`):
- All debug logs shown
- More verbose context
- Timing information

Production:
- Only error level and above
- Minimal context (privacy)
- No sensitive data

---

*Last Updated: October 30, 2025*  
*For error code documentation, see: `packages/utils/src/logger/ERROR_CODES_README.md`*

