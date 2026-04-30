# WooCommerce POS (monorepo-v2)

React Native + Expo cross-platform POS client app.

## Wiki

This repo includes the WCPOS wiki as a submodule at `.wiki/`. Pull latest before reading:

```bash
git submodule update --init --remote .wiki
```

Relevant wiki pages:

- [Product Overview](.wiki/product/overview.md) — what WCPOS is, business context
- [Client Architecture](.wiki/architecture/client.md) — React Native app architecture, state management, data flow
- [Features](.wiki/product/features.md) — feature inventory (free vs Pro)
- [Personas](.wiki/product/personas.md) — user personas and design implications

## E2E selector policy

E2E tests must use stable `testID` selectors for app UI. Do not use localized UI text as selectors: no `getByText`, no `getByPlaceholder`, no `getByLabel`, and no `getByRole(..., { name })` in `apps/main/e2e`. If a UI element needs to be exercised by E2E, add a stable `testID` to the component and select it with `getByTestId()`.
