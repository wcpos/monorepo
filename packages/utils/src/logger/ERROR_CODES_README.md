# WCPos Error Codes Reference

This document provides detailed information about all error codes used in WCPos. Error codes are structured to help users and developers quickly identify and resolve issues.

## Error Code Format

All error codes follow the format: `[DOMAIN][CATEGORY][SPECIFIC_CODE]`

- **DOMAIN** (2-3 letters): API, DB, PY (Payment), SY (System)
- **CATEGORY** (2 digits): Groups related errors (01-99)
- **SPECIFIC_CODE** (3 digits): Unique identifier (001-999)

Example: `API02007` = API domain, Authentication category (02), Token refresh failed (007)

---

## API Errors (API)

### Connection Errors (API01xxx)

#### `API01001` - CONNECTION_TIMEOUT
**What it means**: The server took too long to respond  
**Common causes**:
- Slow internet connection
- Server under heavy load
- Network congestion

**What to try**:
1. Check your internet connection
2. Try again in a few moments
3. Contact your server administrator if problem persists

---

#### `API01002` - CONNECTION_REFUSED
**What it means**: The server refused the connection  
**Common causes**:
- Server is down or offline
- Firewall blocking the connection
- Incorrect server URL

**What to try**:
1. Verify the server URL in settings
2. Check if the website is accessible in a browser
3. Contact your server administrator

---

#### `API01003` - CONNECTION_RESET
**What it means**: The connection was reset during communication  
**Common causes**:
- Network interruption
- Proxy or firewall interference
- Server crashed mid-request

**What to try**:
1. Check your network stability
2. Retry the operation
3. Contact your network administrator if using corporate network

---

#### `API01004` - DNS_RESOLUTION_FAILED
**What it means**: Unable to find the server address  
**Common causes**:
- Invalid domain name
- DNS server issues
- Network configuration problems

**What to try**:
1. Verify the server URL is correct
2. Check your DNS settings
3. Try using a different network

---

#### `API01005` - SSL_CERTIFICATE_ERROR
**What it means**: The server's security certificate is invalid  
**Common causes**:
- Expired SSL certificate
- Self-signed certificate
- Certificate name mismatch

**What to try**:
1. Contact your server administrator to renew SSL certificate
2. Verify you're using the correct domain (www vs non-www)
3. Check if server requires HTTPS

---

#### `API01006` - NETWORK_UNREACHABLE
**What it means**: Cannot reach the network  
**Common causes**:
- No internet connection
- WiFi disconnected
- Mobile data turned off

**What to try**:
1. Check your internet connection
2. Toggle WiFi or mobile data
3. Try switching networks

---

#### `API01007` - DEVICE_OFFLINE
**What it means**: Your device has no internet connection  
**Common causes**:
- WiFi disconnected
- Mobile data disabled
- Airplane mode enabled

**What to try**:
1. Check WiFi or mobile data settings
2. Disable airplane mode
3. Restart your network connection

---

#### `API01008` - WEBSITE_UNAVAILABLE
**What it means**: Internet is available but the website cannot be reached  
**Common causes**:
- Server is down
- Website moved or deleted
- Firewall blocking the specific site

**What to try**:
1. Check if website is accessible in browser
2. Verify the server URL is correct
3. Contact your server administrator

---

### Authentication Errors (API02xxx)

#### `API02001` - INVALID_CREDENTIALS
**What it means**: Login credentials are incorrect  
**Common causes**:
- Wrong username or password
- Account doesn't exist
- Account disabled

**What to try**:
1. Verify your username and password
2. Reset your password if forgotten
3. Contact administrator if account is disabled

---

#### `API02002` - TOKEN_EXPIRED
**What it means**: Your session has expired  
**Common causes**:
- Logged in for too long (>30 minutes typically)
- Server time configuration issues

**What to try**:
1. App will automatically refresh your session
2. If automatic refresh fails, log in again
3. Contact administrator if issue persists

---

#### `API02003` - TOKEN_INVALID
**What it means**: Your session token is not valid  
**Common causes**:
- Token corrupted
- Server configuration changed
- Security settings updated

**What to try**:
1. Log out and log in again
2. Clear app data if problem persists
3. Contact your server administrator

---

#### `API02004` - USER_NOT_AUTHORIZED
**What it means**: Your account doesn't have permission for this action  
**Common causes**:
- Insufficient user role/permissions
- Feature disabled for your account
- Account restrictions

**What to try**:
1. Contact administrator to grant permissions
2. Verify your user role
3. Check if feature is enabled on server

---

#### `API02005` - INSUFFICIENT_PERMISSIONS
**What it means**: You don't have permission to access this resource  
**Common causes**:
- User role lacks required capabilities
- Resource restricted to specific users
- Store-specific permissions

**What to try**:
1. Contact administrator for permission upgrade
2. Ask to be assigned appropriate user role
3. Verify you're accessing the correct store

---

#### `API02006` - API_KEY_INVALID
**What it means**: The API key is not valid  
**Common causes**:
- API key revoked or expired
- Wrong API key configured
- Server API settings changed

**What to try**:
1. Regenerate API keys in WordPress
2. Update API keys in app settings
3. Contact administrator

---

#### `API02007` - TOKEN_REFRESH_FAILED
**What it means**: Could not refresh your session automatically  
**Common causes**:
- Refresh token expired
- Server connectivity issues
- Server configuration changed

**What to try**:
1. App will prompt you to log in again
2. Complete the login process
3. Contact administrator if unable to login

---

#### `API02008` - REFRESH_TOKEN_INVALID
**What it means**: Your refresh token is no longer valid  
**Common causes**:
- Logged out on another device
- Security revocation
- Token expired after extended inactivity

**What to try**:
1. Log in again (app will prompt automatically)
2. Ensure login succeeds
3. Contact administrator if repeated failures

---

#### `API02009` - REFRESH_TOKEN_EXPIRED
**What it means**: Your refresh token has expired  
**Common causes**:
- Extended period of inactivity
- Token lifetime configuration on server
- User logged out on server

**What to try**:
1. Log in again
2. Keep app active to avoid expiration
3. Contact administrator about token lifetime settings

---

#### `API02010` - AUTH_REQUIRED
**What it means**: Authentication is required to proceed  
**Common causes**:
- Not logged in
- Session expired completely
- Authentication state cleared

**What to try**:
1. Log in to your account
2. Verify credentials are correct
3. Contact administrator if unable to login

---

### Request Errors (API03xxx)

#### `API03001` - INVALID_REQUEST_FORMAT
**What it means**: The request format is not acceptable to the server  
**Common causes**:
- Malformed data
- Unsupported content type
- API version mismatch

**What to try**:
1. Update WCPos app to latest version
2. Update WCPos plugin on server
3. Contact support with error details

---

#### `API03002` - MISSING_REQUIRED_PARAMETERS
**What it means**: Required data is missing from the request  
**Common causes**:
- Form validation bypassed
- Plugin version mismatch
- Required fields changed on server

**What to try**:
1. Fill in all required fields
2. Update app and plugin to match versions
3. Contact support

---

#### `API03003` - INVALID_PARAMETER_VALUE
**What it means**: A provided value is not acceptable  
**Common causes**:
- Invalid format (e.g., email, phone)
- Value out of range
- Data type mismatch

**What to try**:
1. Check form field values
2. Follow validation rules shown
3. Contact support if validation seems incorrect

---

#### `API03004` - REQUEST_TOO_LARGE
**What it means**: The request data exceeds server limits  
**Common causes**:
- Too many items in batch operation
- Large image upload
- Server upload limits

**What to try**:
1. Process in smaller batches
2. Reduce image sizes
3. Contact administrator to increase server limits

---

#### `API03005` - RATE_LIMIT_EXCEEDED
**What it means**: Too many requests sent too quickly  
**Common causes**:
- Rapid clicking/actions
- Automated sync running too fast
- Server protection triggered

**What to try**:
1. Wait a few moments before retrying
2. Slow down interactions
3. Contact administrator if persistent

---

#### `API03006` - UNSUPPORTED_METHOD
**What it means**: The HTTP method is not supported by the server  
**Common causes**:
- Server configuration restricts PUT/PATCH
- Plugin not installed correctly
- Apache/Nginx configuration issue

**What to try**:
1. Contact server administrator
2. Check server supports REST API methods
3. Verify plugin is properly installed

---

#### `API03007` - REQUEST_QUEUE_FULL
**What it means**: Too many pending requests  
**Common causes**:
- App sending requests faster than processing
- Network issues causing backlog
- Server very slow to respond

**What to try**:
1. Wait for current operations to complete
2. Close and restart app if frozen
3. Check server performance

---

### Response Errors (API04xxx)

#### `API04001` - INVALID_RESPONSE_FORMAT
**What it means**: Server response format is not recognized  
**Common causes**:
- Plugin version mismatch
- Server error page returned instead of JSON
- API endpoint changed

**What to try**:
1. Update app and plugin to same version
2. Check server error logs
3. Contact support

---

#### `API04002` - UNEXPECTED_RESPONSE_CODE
**What it means**: Server returned an unexpected status code  
**Common causes**:
- Server error (500, 502, 503, 504)
- Endpoint not found (404)
- Server misconfiguration

**What to try**:
1. Try again later
2. Check if server is operational
3. Contact server administrator

---

#### `API04003` - MALFORMED_JSON_RESPONSE
**What it means**: Server returned invalid JSON  
**Common causes**:
- Other plugins outputting text/HTML
- PHP warnings/errors mixed in response
- Server configuration issue

**What to try**:
1. App will attempt automatic recovery
2. Contact administrator about plugin conflicts
3. Check PHP error logging on server

---

#### `API04004` - MISSING_RESPONSE_DATA
**What it means**: Expected data is missing from the response  
**Common causes**:
- Incomplete server response
- API changed on server
- Data filtering removed expected fields

**What to try**:
1. Update app and plugin to match versions
2. Check server logs for errors
3. Contact support

---

#### `API04005` - JSON_RECOVERY_ATTEMPTED
**What it means**: App detected and recovered from corrupted JSON response  
**Common causes**:
- WordPress plugin outputting HTML before JSON
- PHP warnings in response
- Debug mode enabled on server

**What to try**:
1. Operation may have succeeded - verify result
2. Disable conflicting plugins on server
3. Disable WordPress debug mode in production
4. Contact administrator about server configuration

---

### Plugin/WordPress Errors (API05xxx)

#### `API05001` - WOOCOMMERCE_API_DISABLED
**What it means**: WooCommerce REST API is disabled  
**Common causes**:
- API disabled in WooCommerce settings
- Security plugin blocking API
- Server configuration blocking REST API

**What to try**:
1. Enable REST API in WooCommerce > Settings > Advanced > REST API
2. Check security plugins (WordFence, etc.)
3. Contact administrator

---

#### `API05002` - WCPOS_PLUGIN_NOT_FOUND
**What it means**: WCPos plugin not found or not active on server  
**Common causes**:
- Plugin not installed
- Plugin deactivated
- Wrong website URL

**What to try**:
1. Install WCPos plugin on WordPress site
2. Activate the plugin
3. Verify you're connecting to correct website

---

#### `API05003` - WCPOS_PLUGIN_OUTDATED
**What it means**: WCPos plugin version is too old  
**Common causes**:
- Plugin needs updating
- App version too new for plugin
- Feature requires newer plugin

**What to try**:
1. Update WCPos plugin on server
2. Contact administrator to update plugin
3. Downgrade app if plugin cannot be updated

---

#### `API05004` - WORDPRESS_API_DISABLED
**What it means**: WordPress REST API is completely disabled  
**Common causes**:
- Security plugin disabled API
- Custom code disabled REST API
- Server configuration

**What to try**:
1. Contact administrator to enable REST API
2. Check security plugin settings
3. Review custom code in theme/plugins

---

#### `API05005` - PLUGIN_NOT_FOUND
**What it means**: Required WordPress plugin not found  
**Common causes**:
- WooCommerce not installed
- Required dependency missing
- Plugin deactivated

**What to try**:
1. Install required plugins (WooCommerce, WCPos)
2. Activate all required plugins
3. Contact administrator

---

### Configuration Errors (API06xxx)

#### `API06001` - INVALID_URL_FORMAT
**What it means**: The server URL format is invalid  
**Common causes**:
- Missing http:// or https://
- Typo in domain name
- Invalid characters in URL

**What to try**:
1. Check server URL format (must start with http:// or https://)
2. Verify domain spelling
3. Remove any extra characters

---

#### `API06002` - MISSING_API_URL
**What it means**: API URL is not configured  
**Common causes**:
- Initial setup incomplete
- Configuration reset
- Migration issue

**What to try**:
1. App will attempt to auto-configure
2. Manually set API URL in settings
3. Reconnect to server

---

#### `API06003` - INVALID_SITE_CONFIGURATION
**What it means**: Site configuration is incomplete or invalid  
**Common causes**:
- Setup not completed
- Configuration corrupted
- Required settings missing

**What to try**:
1. Complete site setup wizard
2. Reconnect to server
3. Delete and re-add site

---

## Database Errors (DB)

### Connection Errors (DB01xxx)

#### `DB01001` - CONNECTION_FAILED
**What it means**: Cannot connect to local database  
**Common causes**:
- Database not initialized
- Storage permission denied
- Corrupted database file

**What to try**:
1. Restart the app
2. Check storage permissions
3. Clear app data (warning: loses local data)

---

#### `DB01002` - QUERY_TIMEOUT
**What it means**: Database query took too long  
**Common causes**:
- Very large dataset
- Complex query
- Database performance issue

**What to try**:
1. Wait for operation to complete
2. Close other apps to free memory
3. Contact support if persistent

---

#### `DB01003` - TRANSACTION_FAILED
**What it means**: Database transaction could not complete  
**Common causes**:
- Concurrent write conflict
- Storage full
- Database corrupted

**What to try**:
1. Retry the operation
2. Check available storage space
3. Contact support if repeated failures

---

### Data Errors (DB02xxx)

#### `DB02001` - DUPLICATE_RECORD
**What it means**: Record already exists  
**Common causes**:
- Attempted to create duplicate
- Sync conflict
- Race condition

**What to try**:
1. Refresh data
2. Check if record already exists
3. Contact support if seeing duplicates

---

#### `DB02002` - RECORD_NOT_FOUND
**What it means**: Requested record doesn't exist  
**Common causes**:
- Record deleted
- Sync not completed
- Wrong ID used

**What to try**:
1. Refresh data from server
2. Verify record exists
3. Complete sync operation

---

#### `DB02003` - CONSTRAINT_VIOLATION
**What it means**: Data violates database rules  
**Common causes**:
- Required field missing
- Invalid reference
- Unique constraint violation

**What to try**:
1. Fill in all required fields
2. Verify referenced data exists
3. Contact support

---

### Query Errors (DB03xxx)

#### `DB03001` - QUERY_SYNTAX_ERROR
**What it means**: Database query has syntax error  
**Common causes**:
- App bug
- Database schema mismatch
- Corrupted query

**What to try**:
1. Update app to latest version
2. Contact support with error details
3. Reinstall app if persistent

---

#### `DB03002` - INVALID_DATA_TYPE
**What it means**: Data type doesn't match expected type  
**Common causes**:
- Data corruption
- Version mismatch
- Migration issue

**What to try**:
1. Update app and plugin
2. Re-sync data from server
3. Contact support

---

#### `DB03003` - MISSING_REQUIRED_FIELD
**What it means**: Required database field is missing  
**Common causes**:
- Incomplete data entry
- Sync incomplete
- Schema migration issue

**What to try**:
1. Fill in all required fields
2. Complete sync from server
3. Contact support

---

## Payment Errors (PY)

### Payment Processing (PY01xxx)

#### `PY01001` - PAYMENT_DECLINED
**What it means**: Payment was declined by payment processor  
**Common causes**:
- Insufficient funds
- Card declined by bank
- Fraud prevention triggered

**What to try**:
1. Try different payment method
2. Contact card issuer
3. Verify payment details are correct

---

#### `PY01002` - INSUFFICIENT_FUNDS
**What it means**: Not enough funds for payment  
**Common causes**:
- Account balance too low
- Credit limit reached

**What to try**:
1. Use different payment method
2. Check account balance
3. Contact bank

---

#### `PY01003` - CARD_EXPIRED
**What it means**: Payment card has expired  
**Common causes**:
- Expiration date passed
- Card not renewed

**What to try**:
1. Use current card
2. Update card details
3. Contact bank for renewed card

---

#### `PY01004` - INVALID_CARD_NUMBER
**What it means**: Card number is not valid  
**Common causes**:
- Typo in card number
- Invalid card type
- Unsupported card brand

**What to try**:
1. Verify card number is correct
2. Check card type is accepted
3. Try different card

---

### Gateway Errors (PY02xxx)

#### `PY02001` - PAYMENT_GATEWAY_ERROR
**What it means**: Payment gateway encountered an error  
**Common causes**:
- Gateway configuration issue
- Gateway service down
- Communication failure

**What to try**:
1. Try again in a few moments
2. Use alternative payment method
3. Contact administrator

---

#### `PY02002` - PAYMENT_TIMEOUT
**What it means**: Payment processing timed out  
**Common causes**:
- Slow gateway response
- Network issues
- Gateway overloaded

**What to try**:
1. Check if payment went through before retrying
2. Wait and try again
3. Use alternative payment method

---

## System Errors (SY)

### Resource Errors (SY01xxx)

#### `SY01001` - OUT_OF_MEMORY
**What it means**: App ran out of memory  
**Common causes**:
- Too much data loaded
- Memory leak
- Device low on RAM

**What to try**:
1. Close other apps
2. Restart WCPos app
3. Restart device

---

#### `SY01002` - DISK_FULL
**What it means**: Device storage is full  
**Common causes**:
- No available storage space
- Large database
- Many cached images

**What to try**:
1. Free up storage space
2. Delete unnecessary files/apps
3. Clear app cache

---

#### `SY01003` - PERMISSION_DENIED
**What it means**: App lacks required system permission  
**Common causes**:
- Storage permission denied
- Network permission denied
- OS security restrictions

**What to try**:
1. Grant required permissions in device settings
2. Reinstall app and grant permissions
3. Check device security settings

---

### Configuration Errors (SY02xxx)

#### `SY02001` - INVALID_CONFIGURATION
**What it means**: App configuration is invalid  
**Common causes**:
- Corrupted settings
- Manual configuration edit error
- Migration issue

**What to try**:
1. Reset app settings to default
2. Reconfigure from scratch
3. Reinstall app

---

#### `SY02002` - SERVICE_UNAVAILABLE
**What it means**: Required service is not available  
**Common causes**:
- Service not started
- Service crashed
- Dependency missing

**What to try**:
1. Restart app
2. Check app has all required permissions
3. Reinstall app if persistent

---

## Usage in Code

When logging errors, always include the appropriate error code:

```typescript
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

// User-facing error (shows toast)
log.error('Unable to connect to server', {
  showToast: true,
  context: {
    errorCode: ERROR_CODES.CONNECTION_REFUSED,
    serverUrl: 'https://example.com',
  },
});

// Developer debugging (console only)
log.debug('Token refresh started', {
  context: {
    userId: 123,
    tokenExpiry: Date.now(),
  },
});

// Important error that needs tracking (saved to DB)
log.error('Token refresh failed', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
    userId: 123,
    attemptNumber: 3,
  },
});
```

## Logging Guidelines

### When to use `showToast: true`
- **User-facing errors** that require user action
- **Critical errors** that prevent app functionality
- **Authentication errors** that need immediate attention
- **Network errors** that explain why something failed

### When to use `saveToDb: true`
- **Errors** that need tracking for support
- **Authentication failures** for security audit
- **Payment errors** for reconciliation
- **Sync errors** for data integrity tracking

### When to use debug level
- **Developer information** for troubleshooting
- **State changes** during normal operation
- **Request/response details** during development
- **Performance metrics** and timing data

## Error Code Categories Quick Reference

| Prefix | Domain | Category | Description |
|--------|--------|----------|-------------|
| API01xxx | API | Connection | Network and connectivity issues |
| API02xxx | API | Authentication | Login, tokens, permissions |
| API03xxx | API | Request | Request format and validation |
| API04xxx | API | Response | Response parsing and validation |
| API05xxx | API | Plugin | WordPress/WooCommerce plugin issues |
| API06xxx | API | Configuration | Setup and configuration issues |
| DB01xxx | Database | Connection | Database connectivity |
| DB02xxx | Database | Data | Data integrity and constraints |
| DB03xxx | Database | Query | Query execution errors |
| PY01xxx | Payment | Processing | Payment transaction issues |
| PY02xxx | Payment | Gateway | Payment gateway communication |
| SY01xxx | System | Resources | Memory, storage, permissions |
| SY02xxx | System | Configuration | System setup and services |

---

*Last Updated: October 30, 2025*  
*For technical implementation details, see: `packages/utils/src/logger/error-codes.ts`*

