# useRestHttpClient

A comprehensive HTTP client hook for REST API communication with built-in authentication handling and token refresh capabilities.

## Features

- **Token Refresh**: Automatically refreshes access tokens using refresh tokens when encountering 401 errors
- **Auth Flow Integration**: Falls back to OAuth flow when refresh tokens are invalid
- **Error Handling**: Structured error handling with retry capabilities
- **Request Interceptors**: Automatic JWT token injection and store context
- **JSON Recovery**: Handles malformed JSON responses from WordPress plugins

## File Structure

```
use-rest-http-client/
├── index.ts              # Main hook implementation
├── auth-error-handler.ts # Authentication error handling and token refresh
├── types.ts              # TypeScript type definitions
├── exports.ts            # Clean export interface
└── README.md             # This file
```

## Usage

```typescript
import { useRestHttpClient } from './hooks/use-rest-http-client';

const MyComponent = () => {
  const httpClient = useRestHttpClient('products');
  
  const fetchProducts = async () => {
    try {
      const response = await httpClient.get('/');
      return response.data;
    } catch (error) {
      // 401 errors are automatically handled with token refresh
      console.error('Failed to fetch products:', error);
    }
  };
  
  return (
    // Your component JSX
  );
};
```

## Authentication Flow

1. **Request fails with 401**: Token refresh handler is triggered (priority 100)
2. **Token Refresh Attempt**: Uses the dedicated `createTokenRefreshHandler` to get new access token
3. **Retry Original Request**: If refresh succeeds, retries the failed request automatically
4. **Fallback Handler**: If token refresh fails, fallback auth handler is triggered (priority 50)
5. **OAuth Flow**: Initiates OAuth flow as last resort
6. **Error Propagation**: If OAuth fails, throws error with toast notification

## Error Handler Priority

- **Token Refresh Handler** (priority 100): Handles automatic token refresh
- **Fallback Auth Handler** (priority 50): Handles OAuth flow when token refresh fails

This two-tier approach ensures robust authentication handling with automatic recovery.

## Configuration

The hook automatically configures:
- Base URL from site configuration
- JWT authentication (header or query param)
- Store context for multi-store setups
- Request/response interceptors
