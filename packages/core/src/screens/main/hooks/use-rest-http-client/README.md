# useRestHttpClient

High-level HTTP client hook for WordPress/WooCommerce REST API communication.

## Quick Overview

This hook wraps `useHttpClient` to provide:
- Automatic JWT token injection (header or query param)
- Multi-store context (`store_id` parameter)
- Token refresh and OAuth fallback handling
- Invalid JSON recovery from malformed server responses

## Usage

```typescript
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';

const productClient = useRestHttpClient('products');

// All requests include JWT and store context automatically
const products = await productClient.get('/', { params: { per_page: 10 } });
```

## Full Documentation

For complete architecture documentation, error handling flow, and API reference:

👉 **[packages/hooks/src/use-http-client/README.md](../../../../../../../packages/hooks/src/use-http-client/README.md)**

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Main hook implementation |
| `auth-error-handler.ts` | OAuth fallback when token refresh fails |
| `types.ts` | TypeScript interfaces |
