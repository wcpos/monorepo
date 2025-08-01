# Site Connection Hooks

This directory contains a modular and robust implementation of the site connection functionality, split into focused, reusable hooks.

## Architecture

The functionality has been broken down into several focused hooks:

### 1. `useUrlDiscovery`
Handles the discovery of WordPress API URLs from user-entered site URLs.

**Features:**
- Link header discovery (primary method)
- Fallback to `/wp-json/` if Link header is blocked
- Proper URL normalization and validation
- Detailed error states and logging

**Usage:**
```typescript
const { status, error, wpApiUrl, discoverWpApiUrl } = useUrlDiscovery();

const handleUrlDiscovery = async () => {
  const apiUrl = await discoverWpApiUrl('https://mystore.com');
  if (apiUrl) {
    console.log('WordPress API URL:', apiUrl);
  }
};
```

### 2. `useApiDiscovery`
Handles REST API endpoint discovery and validation.

**Features:**
- Fetches and validates WordPress REST API index
- Validates required namespaces (wp/v2, wc/v3, wcpos/v1)
- Checks WCPOS version compatibility (>= 1.8.0)
- Validates authentication endpoints and extracts WCPOS login URL
- Builds complete endpoint configuration

**Usage:**
```typescript
const { status, error, siteData, endpoints, discoverApiEndpoints } = useApiDiscovery();

const handleApiDiscovery = async () => {
  const result = await discoverApiEndpoints('https://mystore.com/wp-json/');
  if (result) {
    console.log('Site data:', result.siteData);
    console.log('Endpoints:', result.endpoints);
  }
};
```

### 3. `useAuthTesting`
Tests authorization methods to determine if the server supports Authorization headers or requires query parameters.

**Features:**
- Tests Authorization header support
- Tests query parameter authorization as fallback
- Mock token generation for testing
- Determines optimal authorization method
- Comprehensive error handling

**Usage:**
```typescript
const { status, error, testResult, testAuthorizationMethod } = useAuthTesting();

const handleAuthTesting = async () => {
  const result = await testAuthorizationMethod('https://mystore.com/wp-json/wcpos/v1/');
  if (result) {
    console.log('Use JWT as param:', result.useJwtAsParam);
    console.log('Supports header auth:', result.supportsHeaderAuth);
    console.log('Supports param auth:', result.supportsParamAuth);
  }
};
```

### 4. `useLoginHandler`
Handles OAuth login responses and saves credentials to the database.

**Features:**
- Processes OAuth success responses
- Extracts access tokens, refresh tokens, and user information
- Creates or updates WordPress credentials in the database
- Links credentials to sites
- Handles errors gracefully

**Usage:**
```typescript
const { handleLoginSuccess, isProcessing, error } = useLoginHandler(site);

// Called when OAuth login succeeds
await handleLoginSuccess(oauthResponse);
```

### 5. `useSiteConnect` (Main Hook)
Orchestrates all discovery steps with comprehensive progress tracking and error handling.

**Features:**
- Step-by-step progress tracking
- Comprehensive error states
- Automatic fallback and retry logic
- Database integration
- Site creation/updating

**Status States:**
- `idle` - Initial state
- `discovering-url` - Discovering WordPress API URL
- `discovering-api` - Validating API endpoints
- `testing-auth` - Testing authorization methods
- `saving` - Saving site configuration
- `success` - Connection completed successfully
- `error` - Connection failed

**Usage:**
```typescript
const { status, progress, error, loading, onConnect, reset } = useSiteConnect();

const handleConnect = async () => {
  const site = await onConnect('https://mystore.com');
  if (site) {
    console.log('Site connected:', site.name);
  }
};

// Monitor progress
React.useEffect(() => {
  if (progress) {
    console.log(`Step ${progress.step}/${progress.totalSteps}: ${progress.message}`);
  }
}, [progress]);
```

## Discovery Flow

The complete discovery flow follows this sequence:

1. **URL Discovery** (`discovering-url`)
   - Try Link header discovery from HEAD request
   - Fallback to `/wp-json/` if Link header not available
   - Validate WordPress site detection

2. **API Discovery** (`discovering-api`)
   - Fetch WordPress REST API index
   - Validate JSON structure and namespaces
   - Check for WooCommerce (`wc/v3`) and WCPOS (`wcpos/v1`) APIs
   - Validate authentication endpoints exist and extract WCPOS login URL
   - Check WCPOS version compatibility

3. **Authorization Testing** (`testing-auth`)
   - Test Authorization header support
   - Test query parameter authorization
   - Determine optimal method for the server
   - Set `use_jwt_as_param` flag accordingly

4. **Data Persistence** (`saving`)
   - Parse and validate data against database schema
   - Update existing site or create new one
   - Link site to user account

## Authentication and Credentials

### WordPress Credentials Schema

The system stores WordPress user credentials with the following key fields:

- `access_token` - The OAuth access token for API requests
- `refresh_token` - The refresh token for obtaining new access tokens  
- `expires_in` - Token expiration information
- `uuid` - Unique identifier for the WordPress user
- `id` - WordPress user ID
- `display_name` - User's display name
- `first_name`, `last_name`, `email` - User profile information

### Migration Notes

The credentials schema has evolved:
- **v1**: Added `refresh_token` field
- **v2**: Migrated from `jwt` to `access_token`, removed unused fields (`username`, `wp_nonce`, `key_id`, `key_permissions`)

## Error Handling

Each hook provides detailed error states and messages:

- **URL Discovery Errors**
  - Site not reachable
  - Not a WordPress site
  - Link header blocked and fallback failed

- **API Discovery Errors**
  - Invalid API response
  - Missing required namespaces
  - WCPOS plugin not installed or outdated
  - Authentication endpoints not configured

- **Authorization Testing Errors**
  - Server blocks all authorization methods
  - Network connectivity issues
  - Invalid API responses

- **Login Handler Errors**
  - Invalid OAuth response format
  - Database insertion/update failures
  - Site linking failures

- **Persistence Errors**
  - Database validation failures
  - Site creation/update failures
  - User account linking issues

## Benefits of the New Architecture

1. **Modularity**: Each hook has a single responsibility
2. **Reusability**: Individual hooks can be used independently
3. **Testability**: Easier to unit test individual components
4. **Robustness**: Comprehensive error handling and fallback logic
5. **User Experience**: Detailed progress tracking and status updates
6. **Maintainability**: Clear separation of concerns
7. **Extensibility**: Easy to add new discovery steps or modify existing ones
8. **Modern Authentication**: OAuth 2.0 flow with proper token management