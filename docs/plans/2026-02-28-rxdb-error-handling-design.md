# RxDB Error Handling Overhaul

**Issue:** [#128](https://github.com/wcpos/monorepo/issues/128)
**Date:** 2026-02-28

## Context

Multiple users reporting raw RxDB error dumps surfacing in the UI — CONFLICT errors on wp_credentials, findDocumentsById failures from null IDs, COL22 schema validation errors on products. These errors are opaque, expose sensitive data (tokens), and offer no recovery actions.

## Design Decisions

- **Approach:** Both layers — fix known bugs at source + storage-level safety net
- **Sync error UX:** Silent + log badge (no toast interruption)
- **Auth error UX:** Still show toast (user needs to act)
- **Partial sync failures:** Skip bad records, continue the batch
- **Token redaction:** Redact sensitive fields in all outputs (console, toast, logs DB)

## Layer 1: Fix Known Bugs at Source

### A. Null ID filtering in populate plugin

**File:** `packages/database/src/plugins/populate.ts`

Filter null/undefined/empty IDs before they reach `findByIds()`:

```ts
switchMap((ids: string[]) => {
  const validIds = ids.filter(id => id != null && id !== '');
  if (validIds.length === 0) return of(new Map());
  return refCollection.findByIds(validIds).exec();
})
```

### B. Credential write conflict prevention

**File:** `packages/core/src/screens/main/hooks/use-rest-http-client/auth-error-handler.ts`

The current `authFlowInFlightRef` mutex prevents duplicate OAuth flows but doesn't prevent the underlying RxDB write race. Fix by using `incrementalPatch()` (which internally retries on conflict) instead of direct `patch()` when saving refreshed tokens.

### C. Schema-safe data coercion in parseRestResponse

**File:** `packages/database/src/plugins/parse-rest-response.ts`

The existing `parseRestResponse` plugin already coerces types, but it doesn't catch everything WC throws at us. Add a validation pass that strips fields not in the schema and applies safe defaults for missing required fields — before the data hits RxDB's bulk write.

## Layer 2: Storage-Level Safety Net

Create an RxDB storage wrapper (`packages/database/src/plugins/error-handler.ts`) that wraps the underlying storage and:

- **Catches all storage method errors** (`bulkWrite`, `findDocumentsById`, `query`, etc.)
- **Translates raw errors** into structured objects with error codes from the existing `error-codes.ts` system
- **Routes through the logger** with `showToast: false` and `saveToDb: true` for sync/DB errors
- **Redacts sensitive fields** before any error reaches the logger
- **Returns graceful fallbacks** where possible (empty results for failed queries, partial success for bulk writes)

## Layer 3: Error Categorization & Routing

| Error Type | Category | User Impact | Behavior |
|-----------|----------|-------------|----------|
| CONFLICT (409) | Sync | Silent | Log to DB, retry on next sync cycle |
| COL22 (schema) | Sync | Silent | Log bad record, skip it, continue batch |
| findDocumentsById null | Bug (fixed) | Silent | Filtered upstream, log if somehow still occurs |
| Auth token expired | Auth | Toast | Show toast with Login action button |
| Auth credential conflict | Auth | Toast | Use incrementalPatch to auto-resolve; toast only if unrecoverable |
| Worker communication failure | Critical | Toast | "Database connection lost" with Reload action |

## Layer 4: Sensitive Data Redaction

Add a `redactSensitiveFields` utility applied in the logger before any output channel (console, toast, DB). Targets:

- `access_token`, `refresh_token`, `jwt_token` → masked to first 6 + last 4 chars
- Applied recursively to error context objects
- Catches both top-level fields and nested objects in error dumps

## Layer 5: Logs Badge (UI Indicator)

Since sync errors go silent, users need a way to know something's off. Add an unread-count badge on the existing Logs screen indicator that increments when new errors are logged. This gives visibility without interruption.

## Files of Interest

- `packages/database/src/plugins/populate.ts` — null ID filtering
- `packages/database/src/plugins/parse-rest-response.ts` — schema-safe coercion
- `packages/database/src/adapters/default/index.web.ts` — storage wrapper insertion point
- `packages/core/src/screens/main/hooks/use-rest-http-client/auth-error-handler.ts` — credential conflict fix
- `packages/query/src/collection-replication-state.ts` — sync error handling
- `packages/query/src/sync-state.ts` — bulk write error isolation
- `packages/utils/src/logger/error-codes.ts` — new error codes
- `packages/utils/src/logger/index.ts` — redaction integration
