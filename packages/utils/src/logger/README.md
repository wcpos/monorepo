# Logger Utility

A progressive enhancement logger for WooCommerce POS that supports console logging, toast notifications, and database persistence with structured error codes.

## Table of Contents

- [Quick Start](#quick-start)
- [Runtime Log Level Control](#runtime-log-level-control)
- [API Reference](#api-reference)
- [Toast Options](#toast-options)
- [Error Codes](#error-codes)
- [Error Code Reference](#error-code-reference)
- [When to Use What](#when-to-use-what)
- [Configuration](#configuration)

## Quick Start

### Basic Usage

```typescript
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

// 1. Simple console log (always works)
log.debug('User clicked button');

// 2. User-facing error with toast
log.error('Connection failed', {
  showToast: true,
  context: {
    errorCode: ERROR_CODES.CONNECTION_REFUSED
  }
});

// 3. Track important error to database
log.error('Payment declined', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.PAYMENT_DECLINED,
    amount: 99.99,
    cardType: 'visa'
  }
});

// 4. Success message with audit trail
log.success('Order saved', {
  showToast: true,
  saveToDb: true,
  context: {
    orderId: 123,
    orderTotal: 99.99
  }
});
```

### App Initialization

In your app's root component:

```typescript
import { setToast, setDatabase } from '@wcpos/utils/logger';
import { Toast } from '@wcpos/components/toast';

// 1. Enable toast notifications
setToast(Toast.show);

// 2. Enable database logging (when user logs in)
const { storeDB } = useAppState();
setDatabase(storeDB.collections.logs);
```

## Runtime Log Level Control

In production builds, `log.debug()` messages are hidden by default. You can change the log level at runtime via the browser console:

```javascript
// Show all logs (including debug)
window.wcposLog.setLevel('debug')

// Default production level (info, warn, error)
window.wcposLog.setLevel('info')

// Only warnings and errors
window.wcposLog.setLevel('warn')

// Only errors
window.wcposLog.setLevel('error')

// Check current level
window.wcposLog.getLevel()
```

You can also call log methods directly from the console:

```javascript
window.wcposLog.debug('Test debug message')
window.wcposLog.info('Test info message')
window.wcposLog.error('Test error message')
```

### Programmatic Usage

```typescript
import log from '@wcpos/utils/logger';

// Get current level
const level = log.getLevel(); // 'debug' | 'info' | 'warn' | 'error'

// Set level programmatically
log.setLevel('debug');
```

## API Reference

### Log Levels

```typescript
log.debug(message, options?)   // Hidden in production (__DEV__ only)
log.info(message, options?)    // Visible in production
log.warn(message, options?)    // Warnings
log.error(message, options?)   // Errors
log.success(message, options?) // Success messages
```

### Options Interface

```typescript
interface LoggerOptions {
  showToast?: boolean;          // Show toast notification
  saveToDb?: boolean;           // Save to database
  context?: any;                // Additional context data
  toast?: {
    text2?: string;             // Secondary message
    dismissable?: boolean;      // Show close button
    showErrorCode?: boolean;    // Show error code help link (default: true)
    action?: {
      label: string;            // Custom action button label
      onClick: () => void;      // Custom action handler
    };
  };
}
```

## Toast Options

### Secondary Message (text2)

```typescript
log.error('Barcode scanned: 12345', {
  showToast: true,
  toast: {
    text2: '3 products found locally'
  },
  context: {
    errorCode: ERROR_CODES.RECORD_NOT_FOUND,
    barcode: '12345'
  }
});
```

### Dismissable Toast

```typescript
log.success('Settings saved', {
  showToast: true,
  toast: {
    dismissable: true  // Shows close button
  }
});
```

### Custom Action Button

```typescript
log.success('Item removed from cart', {
  showToast: true,
  saveToDb: true,
  toast: {
    dismissable: true,
    action: {
      label: 'Undo',
      onClick: () => restoreItem()
    }
  },
  context: {
    itemId: 123,
    itemName: 'Product Name'
  }
});
```

### Automatic Help Button

When you include an error code, a "Help" button automatically appears (unless you provide a custom action):

```typescript
log.error('Invalid credentials', {
  showToast: true,
  context: {
    errorCode: ERROR_CODES.INVALID_CREDENTIALS  // Adds "Help" button automatically
  }
});
// User can click "Help" to open: https://docs.wcpos.com/error-codes/API02001
```

### Controlling Error Code Display

```typescript
// Default: Show help link in toast
log.error('Connection failed', {
  showToast: true,
  context: { errorCode: ERROR_CODES.CONNECTION_REFUSED }
});
// ✓ Shows "Help" button in toast
// ✓ Error code visible in logs

// Hide help link from toast
log.error('Minor validation issue', {
  showToast: true,
  toast: {
    showErrorCode: false  // Hide help link
  },
  context: { errorCode: ERROR_CODES.CONSTRAINT_VIOLATION }
});
// ✗ No "Help" button in toast
// ✓ Error code still visible in logs

// Custom action takes priority
log.success('Item removed', {
  showToast: true,
  toast: {
    action: {
      label: 'Undo',
      onClick: () => restore()
    }
  },
  context: { errorCode: ERROR_CODES.RECORD_DELETED }
});
// ✓ Shows "Undo" button (not "Help")
// ✓ Error code still in logs
```

**Priority**: Custom action > Error code help > Nothing

## Error Codes

### Format

Error codes follow the format: `[DOMAIN][CATEGORY][SPECIFIC_CODE]`

- **DOMAIN**: API, DB, PY (Payment), SY (System)
- **CATEGORY**: 01-99 for different error types
- **SPECIFIC_CODE**: 001-999 for specific errors

### Documentation

All error codes link to: `https://docs.wcpos.com/error-codes/{CODE}`

Error codes are:
- **Always visible in logs UI** (if present in `context.errorCode`)
- **Optionally shown in toasts** (default: true, can be disabled per-call with `toast.showErrorCode: false`)

### Cross-Platform URL Opening

The logger uses `openExternalURL` utility (`@wcpos/utils/open-external-url`) to open documentation links. Platform-specific implementations:
- **Native** (`.ts`): Uses `expo-linking` to open URLs
- **Web** (`.web.ts`): Uses `window.open(url, '_blank')` to open in new tab
- **Electron** (`.electron.ts`): Uses IPC + `shell.openExternal` to open in system browser

## Error Code Reference

### API Errors (API)

#### Connection Errors (API01xxx)
- `API01001` - CONNECTION_TIMEOUT - Request timed out
- `API01002` - CONNECTION_REFUSED - Server rejected connection
- `API01003` - CONNECTION_RESET - Connection was reset
- `API01004` - DNS_RESOLUTION_FAILED - Cannot resolve domain
- `API01005` - SSL_CERTIFICATE_ERROR - SSL certificate invalid
- `API01006` - NETWORK_UNREACHABLE - Network not available
- `API01007` - DEVICE_OFFLINE - No internet connection
- `API01008` - WEBSITE_UNAVAILABLE - Website not reachable

#### Authentication Errors (API02xxx)
- `API02001` - INVALID_CREDENTIALS - Wrong username/password
- `API02002` - TOKEN_EXPIRED - Session expired
- `API02003` - TOKEN_INVALID - Invalid access token
- `API02004` - USER_NOT_AUTHORIZED - Insufficient permissions
- `API02005` - INSUFFICIENT_PERMISSIONS - Access denied
- `API02006` - API_KEY_INVALID - Invalid API key
- `API02007` - TOKEN_REFRESH_FAILED - Cannot refresh token
- `API02008` - REFRESH_TOKEN_INVALID - Invalid refresh token
- `API02009` - REFRESH_TOKEN_EXPIRED - Refresh token expired
- `API02010` - AUTH_REQUIRED - Authentication required

#### Request Errors (API03xxx)
- `API03001` - INVALID_REQUEST_FORMAT - Malformed request
- `API03002` - MISSING_REQUIRED_PARAMETERS - Missing params
- `API03003` - INVALID_PARAMETER_VALUE - Invalid param value
- `API03004` - REQUEST_TOO_LARGE - Request too big
- `API03005` - RATE_LIMIT_EXCEEDED - Too many requests
- `API03006` - UNSUPPORTED_METHOD - HTTP method not allowed
- `API03007` - REQUEST_QUEUE_FULL - Queue full

#### Response Errors (API04xxx)
- `API04001` - INVALID_RESPONSE_FORMAT - Unexpected response
- `API04002` - UNEXPECTED_RESPONSE_CODE - Unexpected status
- `API04003` - MALFORMED_JSON_RESPONSE - Invalid JSON
- `API04004` - MISSING_RESPONSE_DATA - Empty response
- `API04005` - JSON_RECOVERY_ATTEMPTED - JSON recovery tried
- `API04006` - RESOURCE_NOT_FOUND - Requested resource not found (404)

### Server Error Code Mapping

External server error codes (WordPress, WooCommerce, JWT Auth) are automatically mapped to internal codes using `mapToInternalCode()` from `@wcpos/hooks/use-http-client/parse-wp-error`.

This provides:
1. **Consistent codes** for users across different backends
2. **Documentation links** pointing to our help pages
3. **Original server codes** preserved in logs for debugging (as `serverCode`)

#### WordPress REST API Mappings
| Server Code | Maps To | Internal Code |
|-------------|---------|---------------|
| `rest_forbidden` | INSUFFICIENT_PERMISSIONS | `API02005` |
| `rest_cannot_view` | USER_NOT_AUTHORIZED | `API02004` |
| `rest_cannot_create/edit/delete` | INSUFFICIENT_PERMISSIONS | `API02005` |
| `rest_no_route` | RESOURCE_NOT_FOUND | `API04006` |
| `rest_invalid_param` | INVALID_PARAMETER_VALUE | `API03003` |
| `rest_login_required` | AUTH_REQUIRED | `API02010` |

#### WooCommerce REST API Mappings
| Server Code | Maps To | Internal Code |
|-------------|---------|---------------|
| `woocommerce_rest_cannot_view` | USER_NOT_AUTHORIZED | `API02004` |
| `woocommerce_rest_cannot_create/edit/delete` | INSUFFICIENT_PERMISSIONS | `API02005` |
| `woocommerce_rest_authentication_error` | INVALID_CREDENTIALS | `API02001` |
| `woocommerce_rest_invalid_id` | INVALID_PARAMETER_VALUE | `API03003` |

#### JWT Auth Mappings
| Server Code | Maps To | Internal Code |
|-------------|---------|---------------|
| `jwt_auth_invalid_token` | TOKEN_INVALID | `API02003` |
| `jwt_auth_expired_token` | TOKEN_EXPIRED | `API02002` |
| `jwt_auth_failed` | INVALID_CREDENTIALS | `API02001` |
| `jwt_auth_no_auth_header` | AUTH_REQUIRED | `API02010` |

#### HTTP Status Fallbacks
When no specific server code is provided, the HTTP status code is used:
| HTTP Status | Maps To | Internal Code |
|-------------|---------|---------------|
| 400 | INVALID_REQUEST_FORMAT | `API03001` |
| 401 | AUTH_REQUIRED | `API02010` |
| 403 | INSUFFICIENT_PERMISSIONS | `API02005` |
| 404 | RESOURCE_NOT_FOUND | `API04006` |
| 429 | RATE_LIMIT_EXCEEDED | `API03005` |
| 5xx | SERVICE_UNAVAILABLE | `SY02002` |

#### Usage Example

```typescript
import { parseWpError, mapToInternalCode } from '@wcpos/hooks/use-http-client/parse-wp-error';

// Automatic mapping via parseWpError
const wpError = parseWpError(response.data, 'Fallback message');
// wpError.code = "API02004" (internal)
// wpError.serverCode = "woocommerce_rest_cannot_view" (original)
// wpError.message = "Sorry, you cannot list resources."

// Direct mapping
const internalCode = mapToInternalCode('jwt_auth_expired_token', 401);
// Returns "API02002"
```

#### Plugin/WordPress Errors (API05xxx)
- `API05001` - WOOCOMMERCE_API_DISABLED - WC API disabled
- `API05002` - WCPOS_PLUGIN_NOT_FOUND - WCPOS plugin missing
- `API05003` - WCPOS_PLUGIN_OUTDATED - Plugin needs update
- `API05004` - WORDPRESS_API_DISABLED - WP API disabled
- `API05005` - PLUGIN_NOT_FOUND - Required plugin missing

#### Configuration Errors (API06xxx)
- `API06001` - INVALID_URL_FORMAT - Invalid URL
- `API06002` - MISSING_API_URL - API URL not configured
- `API06003` - INVALID_SITE_CONFIGURATION - Invalid config

### Database Errors (DB)

#### Connection Errors (DB01xxx)
- `DB01001` - CONNECTION_FAILED - Cannot connect to DB
- `DB01002` - QUERY_TIMEOUT - Query took too long
- `DB01003` - TRANSACTION_FAILED - Transaction error

#### Data Integrity Errors (DB02xxx)
- `DB02001` - DUPLICATE_RECORD - Record already exists
- `DB02002` - RECORD_NOT_FOUND - Record not found
- `DB02003` - CONSTRAINT_VIOLATION - Validation failed

#### Query Errors (DB03xxx)
- `DB03001` - QUERY_SYNTAX_ERROR - Invalid query syntax
- `DB03002` - INVALID_DATA_TYPE - Wrong data type
- `DB03003` - MISSING_REQUIRED_FIELD - Required field missing

### Payment Errors (PY)

#### Payment Processing (PY01xxx)
- `PY01001` - PAYMENT_DECLINED - Payment declined
- `PY01002` - INSUFFICIENT_FUNDS - Not enough funds
- `PY01003` - CARD_EXPIRED - Card expired
- `PY01004` - INVALID_CARD_NUMBER - Invalid card

#### Payment Gateway (PY02xxx)
- `PY02001` - PAYMENT_GATEWAY_ERROR - Gateway error
- `PY02002` - PAYMENT_TIMEOUT - Payment timed out

### System Errors (SY)

#### System Resources (SY01xxx)
- `SY01001` - OUT_OF_MEMORY - Out of memory
- `SY01002` - DISK_FULL - Disk space full
- `SY01003` - PERMISSION_DENIED - File permission denied

#### System Configuration (SY02xxx)
- `SY02001` - INVALID_CONFIGURATION - Invalid system config
- `SY02002` - SERVICE_UNAVAILABLE - Service unavailable

## When to Use What

### log.debug() - Developer Only
- Hidden in production (`__DEV__` only)
- Request/response details
- State transitions
- Performance metrics

```typescript
log.debug('Token refresh started', {
  context: { userId: 123, timestamp: Date.now() }
});
```

### log.info() - Important State Changes
- Visible in production
- Successful operations
- User actions completed
- System state changes

```typescript
log.info('User logged in', {
  context: { userId: 123, username: 'john' }
});
```

### log.success() - User Feedback
- Always show toast
- Usually save to DB for audit
- User-initiated successful actions

```typescript
log.success('Customer saved', {
  showToast: true,
  saveToDb: true,
  context: { customerId: 456 }
});
```

### log.warn() - Non-Critical Issues
- Show toast if user needs to know
- Usually don't save to DB
- Validation warnings
- Out of stock, etc.

```typescript
log.warn('Product out of stock', {
  showToast: true,
  context: { productId: 789, productName: 'Item' }
});
```

### log.error() - Critical Errors
- Always show toast (user is blocked)
- Usually save to DB (support needs it)
- Must include error code
- Include all relevant context

```typescript
log.error('Failed to save order', {
  showToast: true,
  saveToDb: true,
  context: {
    errorCode: ERROR_CODES.TRANSACTION_FAILED,
    orderId: 123,
    error: err.message
  }
});
```

## Configuration

### Error Code Documentation URL

Change the base URL for error documentation:

```typescript
// packages/utils/src/logger/constants.ts
export const ERROR_CODE_DOCS_BASE_URL = 'https://your-domain.com/errors';
```

### Toast Implementation

The logger expects a toast implementation with the following signature:

```typescript
interface ToastConfig {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  closeButton?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

function showToast(config: ToastConfig): void;
```

Set your toast implementation:

```typescript
import { setToast } from '@wcpos/utils/logger';

setToast(yourToastImplementation);
```

### Database Implementation

The logger expects a RxDB collection with this schema:

```typescript
interface LogDocument {
  id: string;
  level: 'error' | 'warn' | 'info' | 'debug' | 'success';
  message: string;
  context?: {
    errorCode?: string;
    [key: string]: any;
  };
  timestamp: string;
}
```

Set your database collection:

```typescript
import { setDatabase } from '@wcpos/utils/logger';

setDatabase(rxdbCollection);
```

## Best Practices

### Error Categorization

1. **User Impact Priority**: Show toast if the user needs to act
2. **Critical Errors**: Always save to DB for support tracking
3. **Error Codes**: Always include for user-facing errors
4. **Context**: Include all relevant data for debugging

### Example: Network Error

```typescript
try {
  const response = await http.get(endpoint);
  return response.data;
} catch (err) {
  log.error('Failed to fetch from server', {
    showToast: true,    // User needs to know
    saveToDb: true,     // Support needs to track
    context: {
      errorCode: ERROR_CODES.CONNECTION_REFUSED,
      endpoint,
      error: err.message
    }
  });
  throw err;
}
```

### Example: Database Error

```typescript
try {
  return await collection.upsert(data);
} catch (err) {
  log.error('Failed to save to database', {
    showToast: true,
    saveToDb: true,
    context: {
      errorCode: ERROR_CODES.TRANSACTION_FAILED,
      collectionName: collection.name,
      error: err.message
    }
  });
  throw err;
}
```

### Example: Success with Undo

```typescript
const removeItem = async (itemId: string) => {
  const removedItem = await cart.removeItem(itemId);
  
  log.success('Item removed from cart', {
    showToast: true,
    saveToDb: true,
    toast: {
      dismissable: true,
      action: {
        label: 'Undo',
        onClick: async () => {
          await cart.restoreItem(removedItem);
          log.success('Item restored', { showToast: true });
        }
      }
    },
    context: {
      itemId,
      itemName: removedItem.name
    }
  });
};
```
