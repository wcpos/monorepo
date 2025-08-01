# Simple Logger

A simple, progressive logger that works immediately and can be enhanced over time.

## Features

1. **Works immediately** - console logging out of the box
2. **Progressive enhancement** - add Toast when component is ready
3. **Database logging** - add when user logs in and DB is available
4. **Error codes** - structured error codes for better debugging

## Usage

### Basic Usage (Works Immediately)

```typescript
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

// Works immediately - logs to console  
log.error('Network failed', {
  context: { errorCode: ERROR_CODES.CONNECTION_TIMEOUT }
});
log.info('User logged in');
log.debug('API response received');
```

### Add Toast Support

```typescript
import { setToast } from '@wcpos/utils/logger';
import Toast from 'react-native-toast-message';

// In your app initialization
setToast(Toast.show);

// Now errors will show toasts
log.error('Connection failed', { showToast: true });
```

### Add Database Support

```typescript
import { setDatabase } from '@wcpos/utils/logger';

// When user logs in and DB is ready
setDatabase(
  userDB.collections.logs, 
  () => `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
);

// Now logs will be saved to database
log.error('Database error', { saveToDb: true });
```

## File Structure

```
packages/utils/src/logger/
├── index.ts          # Main logger (works immediately)
├── error-codes.ts    # Error code constants
└── README.md         # This file
```

## Error Codes

Error codes follow the format: `[DOMAIN][CATEGORY][SPECIFIC_CODE]`

- **DOMAIN**: API, DB, SY (System)
- **CATEGORY**: 01-99 for different error types
- **SPECIFIC_CODE**: 001-999 for specific errors

Examples:
- `API01001` - Connection timeout
- `DB02001` - Record not found
- `SY02001` - Invalid configuration