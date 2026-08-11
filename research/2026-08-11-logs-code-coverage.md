# Logs: warn/error rows written without a registry `code` (`next`)

Research for [monorepo#1137](https://github.com/wcpos/monorepo/issues/1137) (map: #1136).
Subject: `origin/next` @ `a5996be4a` ("Merge pull request #1133 …"). Read-only investigation; no
test suites were run. Every claim below cites `path:line` on that commit.

---

## 0. Headline

| Measure | Count |
| --- | --- |
| Direct `logger.warn` / `logger.error` call sites (app + packages, non-test) | **245** |
| …that stamp a top-level `code` (via `context.errorCode`) | **111** (103 error, 8 warn) |
| …that persist **bare** — no `code` at all | **134** (80 error, 54 warn) — **54.7 %** |
| Sync-engine event types that can persist a warn/error row | **41** |
| …of those that carry a `code` | **0** |
| Codes in `error-registry.json` | 38 |
| …reachable from any production emit path | **8** |
| …registered but never emitted | **30** (78.9 %) |
| Legacy `error-codes.ts` codes | 69 |
| …actually emitted | 39 |
| …never emitted | 30 |
| Emitted codes that resolve in `ERROR_CATALOGUE` | **0 of 39 legacy** (8 new-registry codes resolve) |

Two independent gaps, in opposite directions:

1. **Bare rows.** More than half of every hand-written warn/error site, plus the *entire* sync
   domain, writes a row with no code.
2. **Wrong codes.** Almost every row that *does* carry a code carries a **legacy** `API…`/`DB…`/
   `PY…`/`SY…` code that the registry marks `deprecated: true`
   (`packages/utils/src/logger/registry.ts:33-41`) and that the Logs detail pane cannot resolve —
   so the chip renders but opens nothing.

---

## 1. How a row acquires a `code` at all

There is exactly one mechanism.

`persistLog` promotes `context.errorCode` — and nothing else — to the top-level `code` column:

```ts
// packages/utils/src/logger/index.ts:314-317
let code = clampColumn(
    'code',
    typeof context.errorCode === 'string' ? context.errorCode : undefined
);
```

The flight-recorder promotion path mirrors it (`packages/utils/src/logger/index.ts:190-193`), and
the RxDB migration backfills the same field for pre-v2 rows
(`packages/database/src/collections/index.ts:586-588`).

Consequences:

- A warn/error call whose `context` has no `errorCode` key produces a row with `code` undefined.
  There is **no** fallback, no exception mapper in the path, no lint rule, and no test gate.
- `LoggerOptions.saveToDb` is a **no-op** — deprecated at
  `packages/utils/src/logger/index.ts:43-44` and never read in `mainTransport`; everything at info
  and above persists whenever a collection is bound (`index.ts:703-714`). Several sites still pass
  `saveToDb: false` believing it suppresses the row (e.g.
  `packages/core/src/screens/main/pos/products/storage-outage-banner.tsx:36`); it does not.

**What the missing code costs on screen.** The ledger only renders a code chip when the row *has*
one and reads as a failure:

```tsx
// packages/core/src/screens/main/logs/ledger.tsx:119-122
if (row.code && (kind === 'error' || kind === 'warn')) {
    return <CodeChip code={row.code} … />;
}
```

and the detail pane's help dialog, safe-action and data-safety lines are all gated on a catalogue
hit for that code (`packages/core/src/screens/main/logs/row-detail.tsx:27-29, 131-134, 202, 216`).
A bare row therefore has no chip, no summary, no `safeAction`, no `dataSafety`, no escalation
advice and no help link — only its message and, for sync rows, an event-derived title
(`packages/core/src/screens/main/logs/logs-logic.ts:35-38`, `event-title.ts:24`).

---

## 2. `map-exception.ts` — which paths yield coded rows vs bare ones

```ts
// packages/utils/src/logger/map-exception.ts:3-23
export function mapExceptionToCode(error: unknown): { code: ErrorCode; context: … } {
    …
    if (/out of memory|heap.*memory/.test(fingerprint))            return { code: ERROR_CODES.OUT_OF_MEMORY, … };   // CLIENT201
    if (/access_violation|breakpoint|sigill|native crash/.test(f)) return { code: ERROR_CODES.NATIVE_CRASH, … };    // CLIENT211
    if (/app start|root load|wcpos:\/\//.test(fingerprint))        return { code: ERROR_CODES.APP_START_FAILED, … };// CLIENT101
    return { code: ERROR_CODES.UNEXPECTED_ERROR, … };                                                               // CLIENT999
}
```

**`mapExceptionToCode` has zero production callers.** The only reference anywhere in the repo is its
own unit test:

```
packages/utils/src/logger/map-exception.test.ts:2  import { mapExceptionToCode } from './map-exception';
```

(grep over `packages/**` + `apps/main/**`, excluding `node_modules`, returns nothing else). So the
answer to "which exception paths produce coded rows" is: **none through this function.** It is a
four-branch classifier that never runs, and the four codes it can mint (CLIENT101/201/211/999) are
consequently unreachable through it.

The **only** production path that turns a thrown/returned error into a *registry* code is the WP
error parser:

- `packages/hooks/src/use-http-client/parse-wp-error.ts:56-96` maps ~30 WordPress / WooCommerce /
  JWT server codes onto registry symbols, and `:105-140` falls back on HTTP status
  (400 → `RECORD_INVALID_FIELD`, 401 → `SESSION_EXPIRED`, 403 → `INSUFFICIENT_ROLE`,
  404 → `REST_ROUTE_MISSING`, 429 → `STORE_RATE_LIMITED`, ≥500 → `STORE_SERVER_ERROR`,
  else `UNEXPECTED_ERROR`).
- Exactly one consumer stamps that result on a row:
  ```ts
  // packages/hooks/src/use-http-client/use-http-client.tsx:290-307
  const wpError = axiosError.response?.data ? parseWpError(…) : undefined;
  httpLogger.error('HTTP request failed', {
      context: { method, endpoint, status, ...(wpError?.code && { errorCode: wpError.code }), … },
  });
  ```
  Note the guard: **no response body ⇒ no `wpError` ⇒ no code.** A DNS failure, a TLS failure or a
  dropped connection all land here bare.
- The sibling handler `packages/hooks/src/use-http-client/use-http-error-handler.tsx:39-132` covers
  the same statuses but stamps **legacy** codes (`ERROR_CODES.SSL_CERTIFICATE_ERROR`,
  `INVALID_CREDENTIALS`, `INSUFFICIENT_PERMISSIONS`, …) imported from
  `@wcpos/utils/logger/error-codes` (line 7). Two handlers, two vocabularies, same HTTP statuses.

Everything else that carries a code does so because a human typed a literal `errorCode:` into the
call site — 104 of the 111 coded sites reference the deprecated `ERROR_CODES.*` constants, and 7 are
computed:

| Site | Code source | Registry? |
| --- | --- | --- |
| `packages/hooks/src/use-http-client/use-http-client.tsx:298` | `wpError.code` | ✅ new registry (8 codes reachable) |
| `packages/core/src/utils/merge-stores.ts:301` | literal `'STORE_VALIDATION_FAILED'` | ❌ invented, in no registry |
| `packages/core/src/screens/main/receipt/email-queue/queue.ts:483` | `failure.code` — a raw WP server code or axios errno (`ECONNREFUSED`, `woocommerce_rest_*`), see `email-queue/classify.ts:117-134` | ❌ external vocabulary |
| `packages/core/src/screens/main/receipt/email.tsx:152` | `failure.code ?? ERROR_CODES.CONNECTION_REFUSED` | ⚠️ mixed |
| `use-login-handler.ts:169`, `use-site-connect.ts:190`, `use-local-mutation.ts:416`, `pos/products/use-barcode.ts:163` | local `errorCode` variable switched over RxDB error shapes | ❌ legacy only |

---

## 3(a). Inventory — every emit site that persists warn/error with **no** `code`

### Family A — the sync engine (whole domain, 0 % coverage)

Engine telemetry never reaches the logger directly. `createSyncLogObserver`
(`apps/main/lib/sync-log-observer.ts:488-665`) converts each `SyncEvent` into a row and hands it to
one bridge call:

```ts
// apps/main/lib/create-app-engine.ts:413-431
const syncLogObserver = createSyncLogObserver({
    persist: (level, message, context, terminal, toast) => {
        engineLogger[level](message, { context, terminal, … });
    },
});
```

The context it builds is `{ ...fields, type: event.type, collection }`
(`sync-log-observer.ts:578-582`). **`errorCode` is never added, and no engine emitter puts an
`errorCode` in `fields`** — so *every* sync row is bare by construction. The row's only identity is
`context.type`, which the UI translates through the event-label registry at render time
(`packages/utils/src/logger/event-registry.json`, 81 entries).

The asymmetry is the story: event **labels** are gated by CI
(`scripts/check-event-labels.mjs:7-23` fails the build when an emitted type has no registry entry)
and the conformance table is total by type (`sync-log-observer.ts:81`, `:473`). Error **codes** have
no equivalent gate at all.

12 event types are routed to `debug` as `INVISIBLE` (`sync-log-observer.ts:169`, `:398-472`) and so
never write warn/error rows outside verbose diagnostics. The remaining **41 types can persist a
warn or error row, all without a code**:

| `context.type` (row identity) | Level | Emit site | Rendered title | Proposed registry disposition |
| --- | --- | --- | --- | --- |
| `transport.request` | warn (status 0 / non-ok), error (403) | `apps/main/lib/engine-fetcher.ts:143-146`, `:221-238`, `:253-258` | "Request to your store" | **SYNC121** `SYNC_UNREACHABLE` (status 0) / **SYNC131** `STORE_SERVER_ERROR` (5xx) / **SYNC141** `STORE_RATE_LIMITED` (429) / **AUTH201** `INSUFFICIENT_ROLE` (403) / **AUTH101** (401) — status→code map already exists in `parse-wp-error.ts:115-140`, it is simply not wired to the engine fetcher |
| `signal.tick.error` | error | `packages/sync-engine/src/change-signal/change-signal-lane.ts:381` | "Checking your store for changes failed" | **SYNC121** or **SYNC131** by cause |
| `engine.lane.tick` | error | `packages/sync-engine/src/automatic-tick-gate.ts:52`; dynamic `report.status === 'error' ? 'error' : 'info'` at `create-rxdb-sync-engine.ts:738` | "Background sync task finished" | **needs minting** — SYNC lane-crash code (nothing in the 38 covers "a scheduled lane threw") |
| `maintenance.lane.error` | error → **warn** (table override, `sync-log-observer.ts:435-440`) | `packages/sync-engine/src/maintenance/maintenance-lanes.ts:295` | "A background maintenance task failed" | **needs minting** — same lane-crash code as above |
| `engine.barcode-selector-hydrate-failed` | debug → **warn** (table override, `sync-log-observer.ts:420-425`) | `packages/sync-engine/src/create-rxdb-sync-engine.ts:1252-1257` | "Barcode settings could not be loaded" | **needs minting** (PRODUCT domain — scanning degraded); nearest existing is PRODUCT401 `STOCK_STALE`, which is about stock, not lookup config |
| `coverage.require.error` | error | `packages/sync-engine/src/require-plane.ts:1035` | "Could not load the records this screen needs" | **SYNC321** `SYNC_PARTIAL` |
| `engine.connectivity-error` | error | `packages/sync-engine/src/create-rxdb-sync-engine.ts:1686` | "Lost the connection to your store" | **SYNC121** `SYNC_UNREACHABLE` |
| `engine.ready-failed` | error | `packages/sync-engine/src/readiness-watchdog.ts:50-58` | "Syncing could not start" | **CLIENT101** `APP_START_FAILED` |
| `engine.ready-stalled` | error | `packages/sync-engine/src/readiness-watchdog.ts:26-38` | "Syncing is taking longer than expected to start" | **needs minting** (warn-severity startup stall; CLIENT101 is error/`contact-support`) |
| `engine.listener-error` | error (×8 sites) | `create-rxdb-sync-engine.ts:667`, `:987`, `:1010`, `:1931`; `census-publisher.ts:72`, `:82`; `local-coverage/coverage-changes.ts:62`, `:114`, `:139` | "A sync update could not be delivered to the app" | **CLIENT999** `UNEXPECTED_ERROR` |
| `engine.pos-bootstrap-error` | warn | `create-rxdb-sync-engine.ts:1275` | "Setting up this store failed" | **CLIENT101** `APP_START_FAILED` |
| `engine.guard` | warn | `create-rxdb-sync-engine.ts:1101` | "Sync work stopped because the store changed" | no code — arguably not a defect; candidate for *policy: no code required* |
| `engine.reset-needs-confirmation` | warn | `create-rxdb-sync-engine.ts:1083` | "A data reset is waiting for your confirmation" | **needs minting** or *no code* (it is a prompt, not a failure) |
| `engine.write-leader.degraded` | warn | `apps/main/lib/create-app-engine.ts:449` | "This browser can only sync one tab at a time" | **needs minting** (CLIENT, warn, `continue`) |
| `push.error` | error (`recordPushAdapter.ts:249`, `:306`, `:348`, `:360`), warn (`:288`) | `packages/sync-core/src/recordPushAdapter.ts` | "Could not send a change to your store" | **SYNC131** `STORE_SERVER_ERROR` / **SYNC121** by status |
| `push.rejected` | warn | `packages/sync-core/src/drainMutationQueue.ts:436` | "Your store rejected a change" | **SYNC201** `RECORD_REJECTED` |
| `push.conflict` | warn | `packages/sync-core/src/recordPushAdapter.ts:263` | "A change clashed with an edit in your store" | **needs minting** or SYNC201 |
| `push.in_progress` | warn | `packages/sync-core/src/recordPushAdapter.ts:234` | "This change was already being sent" | *no code* candidate (benign) |
| `push.dead-letter-unpersisted` | error | `packages/sync-core/src/drainMutationQueue.ts:455` | "A rejected change could not be recorded for recovery" | **SYNC101** `LOCAL_DB_WRITE_FAILED` |
| `push.money-divergence` | error | `packages/sync-engine/src/write-path/write-drain-lane.ts:533` | "Totals from your store differ from the till" | **needs minting** (CHECKOUT, `money-moved`) — the four CHECKOUT codes all describe checkout *not finishing* |
| `queue.write.tick.error` | error | `packages/sync-engine/src/write-path/write-drain-lane.ts:629` | "Sending queued changes failed" | **SYNC321** `SYNC_PARTIAL` |
| `queue.write.auto-reverted` | error (table override) | `create-rxdb-sync-engine.ts:1400` | "Reverted a change your store rejected" | **SYNC201** `RECORD_REJECTED` |
| `queue.write.needs-revision` | warn | `packages/sync-core/src/drainMutationQueue.ts:393` | "A change needs fixing before it can be sent" | **SYNC211** `RECORD_INVALID_FIELD` |
| `queue.write.conflict-transition` | warn | `packages/sync-core/src/drainMutationQueue.ts:671` | "Could not settle a clashing change" | **needs minting** |
| `queue.write.reschedule-failed` | warn | `packages/sync-core/src/drainMutationQueue.ts:369` | "Could not schedule another try for a change" | **SYNC321** `SYNC_PARTIAL` |
| `queue.write.born-twice-requeue` | warn | `packages/sync-engine/src/write-path/write-intents.ts:854`, `:918` | "Queued a change again after a duplicate was created" | *no code* candidate (recovered) |
| `queue.write.requeue-rebuilt` | warn | `packages/sync-engine/src/write-path/write-intents.ts:758` | "Queued a refused change to send again" | *no code* candidate (recovered) |
| `queue.write.discard-repull-deferred` | warn | `packages/sync-engine/src/write-path/conflict-resolution.ts:595` | "Postponed refreshing a record from your store" | *no code* candidate |
| `queue.scheduler.drain` | error when `failed`/`completionLost`/`failureLost`/`renewalLost` > 0 | `packages/sync-engine/src/maintenance/maintenance-lanes.ts:356-364` | "Background sync finished a batch" | **SYNC321** `SYNC_PARTIAL` |
| `signal.cursor` | warn | `packages/sync-engine/src/change-signal/change-signal-lane.ts:348` | "Sync position moved unexpectedly" | **SYNC301** `SYNC_BEHIND_HEAD` |
| `apply.pull` / `apply.delete` / `apply.rebaseline` | warn when `applied < requested` | `packages/sync-core/src/applyReplicationActions.ts:315-322` (one shared emitter, three types) | "Saved updates…" / "Removed items…" / "Refreshed local data…" | **SYNC321** `SYNC_PARTIAL` |
| `apply.escalation` | warn | `packages/sync-core/src/applyReplicationActions.ts:564` | "An update from your store could not be saved" | **SYNC101** `LOCAL_DB_WRITE_FAILED` |
| `apply.barcode-rederive` | warn | `packages/sync-core/src/applyReplicationActions.ts:464` | "Rebuilt barcode lookups" | *no code* candidate |
| `targeted.pull.shortfall-prune` | warn | `packages/sync-engine/src/change-signal/change-signal-handlers.ts:170` | "Removed records no longer returned by your store" | *no code* candidate (recovered) |
| `coverage.existence-reconcile` | warn | `packages/sync-engine/src/local-coverage/local-coverage.ts:518` | "Checked this device for records deleted on your store" | *no code* candidate |
| `coverage.ledger-rebuilt` | warn | `packages/sync-engine/src/local-coverage/local-coverage.ts:294` | "Rebuilt local sync bookkeeping" | **SYNC111** `LOCAL_DB_CORRUPTED` (recovered) |
| `browse-window.backstop-reached` | warn | `packages/sync-engine/src/require-plane.ts:1070` | "This list has reached its maximum size" | *no code* candidate |
| `customer.browse-window.sort-rejected` | warn | `packages/sync-engine/src/scheduler/rx-scheduler-customer-fetcher.ts:135` | "Your store cannot sort the customer list this way" | **needs minting** (SYNC/PRODUCT, warn, `continue`) |
| `product.browse-window.approximate` | warn | `packages/sync-engine/src/scheduler/rx-scheduler-product-fetcher.ts:568` | "Product totals are approximate in a catalogue this large" | *no code* candidate |
| `product.browse-window.brand-filter-ignored` | warn | `packages/sync-engine/src/scheduler/rx-scheduler-product-fetcher.ts:583` | "This WooCommerce version cannot filter products by brand" | **needs minting** (PRODUCT, warn) |

> Note on the ticket's phrasing: "Background sync task finished" showing up **at error** is not a
> mislabel — `engine.lane.tick` keeps its neutral registry label while its level is raised by the
> emitter (`automatic-tick-gate.ts:47-60` on a thrown tick). The title says the lane finished; the
> level says it crashed. A code would be the only thing on that row telling a cashier which.

### Family B — direct logger calls (134 bare sites)

All 134 write `context` with no `errorCode`. Only **one** of them carries a `context.type`
(`receipt/email-queue/queue.ts:507` → `email.queue.deferred`); the rest have no stable event
identity either, so they are un-chippable *and* un-titleable — the row's only identity is its
English message string.

<!-- BEGIN GROUPED INVENTORY -->
#### Novu notifications — 32 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/contexts/novu/notifications.tsx:184` | error | Novu: Failed to mark notification as read |
| `packages/core/src/contexts/novu/notifications.tsx:212` | error | Novu: Failed to mark all notifications as read |
| `packages/core/src/contexts/novu/notifications.tsx:236` | error | Novu: Failed to mark all notifications as seen |
| `packages/core/src/services/novu/bootstrap.ts:175` | warn | Novu: Failed to sync subscriber metadata |
| `packages/core/src/services/novu/bootstrap.ts:181` | error | Novu: Error syncing subscriber metadata |
| `packages/core/src/services/novu/bootstrap.ts:246` | error | (runtime value: `source`) |
| `packages/core/src/services/novu/bootstrap.ts:350` | warn | Novu: Socket connection timeout, syncing anyway |
| `packages/core/src/services/novu/bootstrap.ts:354` | error | Novu: Socket readiness check failed |
| `packages/core/src/services/novu/bootstrap.ts:414` | warn | Novu: Not configured, skipping refresh |
| `packages/core/src/services/novu/client.electron.ts:43` | warn | Novu: Electron ipcRenderer is not available |
| `packages/core/src/services/novu/client.electron.ts:50` | error | Novu: Failed to ${action} |
| `packages/core/src/services/novu/client.ts:108` | warn | Novu: Failed to disconnect previous client |
| `packages/core/src/services/novu/client.ts:175` | warn | Novu: No socket connection promise - client not initialized |
| `packages/core/src/services/novu/client.ts:220` | warn | Novu: Cannot subscribe to events - client not initialized |
| `packages/core/src/services/novu/client.ts:286` | error | Novu: Cannot fetch notifications - client not initialized |
| `packages/core/src/services/novu/client.ts:294` | error | Novu: Failed to fetch notifications |
| `packages/core/src/services/novu/client.ts:306` | error | Novu: Failed to fetch notifications |
| `packages/core/src/services/novu/client.ts:322` | error | Novu: Failed to mark as read |
| `packages/core/src/services/novu/client.ts:329` | error | Novu: Failed to mark as read |
| `packages/core/src/services/novu/client.ts:345` | error | Novu: Failed to mark all as read |
| `packages/core/src/services/novu/client.ts:352` | error | Novu: Failed to mark all as read |
| `packages/core/src/services/novu/client.ts:368` | error | Novu: Failed to mark as seen |
| `packages/core/src/services/novu/client.ts:375` | error | Novu: Failed to mark as seen |
| `packages/core/src/services/novu/client.ts:391` | error | Novu: Failed to mark all as seen |
| `packages/core/src/services/novu/client.ts:398` | error | Novu: Failed to mark all as seen |
| `packages/core/src/services/novu/client.ts:414` | error | Novu: Failed to get unread count |
| `packages/core/src/services/novu/client.ts:421` | error | Novu: Failed to get unread count |
| `packages/core/src/services/novu/client.ts:441` | warn | Novu: Failed to disconnect client |
| `packages/core/src/services/novu/notification-sync.ts:20` | error | Novu: Failed to open external URL |
| `packages/core/src/services/novu/notification-sync.ts:105` | error | Novu: Notification missing ID |
| `packages/core/src/services/novu/notification-sync.ts:156` | error | Novu: Failed to sync notification to RxDB |
| `packages/core/src/services/novu/subscriber.ts:163` | warn | Novu: Subscriber sync failed |

#### Auth / OAuth — 21 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/contexts/app-state/hydration-steps.ts:145` | warn | Server does not support Authorization headers, using query parameters |
| `packages/core/src/contexts/app-state/hydration-steps.ts:152` | warn | Authorization test failed for both methods |
| `packages/core/src/contexts/app-state/hydration-steps.ts:157` | warn | Authorization method test error |
| `packages/core/src/hooks/use-site-info.ts:51` | error | Failed to fetch site info: Invalid response status |
| `packages/core/src/hooks/use-site-info.ts:91` | error | Failed to fetch site info |
| `packages/core/src/hooks/use-user-validation.ts:376` | error | [stores] validation FAILED |
| `packages/core/src/hooks/use-wcpos-auth/index.electron.ts:52` | warn | Auth not ready - no site configured |
| `packages/core/src/hooks/use-wcpos-auth/index.electron.ts:86` | error | State parameter mismatch - possible CSRF attack |
| `packages/core/src/hooks/use-wcpos-auth/index.electron.ts:112` | error | Auth IPC failed |
| `packages/core/src/hooks/use-wcpos-auth/index.web.ts:120` | error | State parameter mismatch - possible CSRF attack |
| `packages/core/src/hooks/use-wcpos-auth/index.web.ts:240` | warn | Auth not ready |
| `packages/core/src/hooks/use-wcpos-auth/index.web.ts:315` | error | Auth failed |
| `packages/core/src/screens/auth/components/add-user-button.tsx:41` | error | Login succeeded without credentials |
| `packages/core/src/screens/auth/components/add-user-button.tsx:51` | error | Login failed: ${response.error} |
| `packages/core/src/screens/auth/components/demo-button.tsx:59` | error | Demo login failed: ${response.error} |
| `packages/core/src/screens/auth/components/demo-button.tsx:88` | error | Demo connection failed: ${err instanceof Error ? err.message : String(err)} |
| `packages/core/src/screens/auth/components/wp-user.tsx:73` | error | Re-authentication succeeded without credentials |
| `packages/core/src/screens/auth/components/wp-user.tsx:92` | error | Failed to finish re-authentication |
| `packages/core/src/screens/auth/components/wp-user.tsx:99` | error | Re-authentication failed: ${response.error} |
| `packages/core/src/screens/auth/hooks/use-api-discovery.ts:216` | warn | WCPOS version ${wcposVersion} may not support all features (recommend 1.8.0+) |
| `packages/core/src/utils/merge-stores.ts:357` | error | Failed to merge stores with response |

#### Barcode / scanning — 13 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/hooks/barcodes/too-short-feedback.ts:20` | warn | t('common.barcode_scanned', { barcode }) |
| `packages/core/src/screens/main/pos/products/scanner-viewfinder.web.tsx:93` | error | Barcode decoder failed to initialize |
| `packages/core/src/screens/main/pos/products/scanner-viewfinder.web.tsx:104` | error | Camera stream unavailable |
| `packages/core/src/screens/main/pos/products/scanner-viewfinder.web.tsx:161` | error | Barcode decode failed |
| `packages/core/src/screens/main/pos/products/storage-outage-banner.tsx:36` | error | t('pos_products.scan_storage_outage_restart_manually') |
| `packages/core/src/screens/main/pos/products/use-barcode.ts:201` | warn | (runtime value: `text1`) |
| `packages/core/src/screens/main/pos/products/use-barcode.ts:386` | warn | (runtime value: `text1`) |
| `packages/core/src/screens/main/pos/products/use-barcode.ts:484` | error | (runtime value: `String`) |
| `packages/core/src/screens/main/pos/products/use-hid-scan.web.ts:189` | warn | hid connect cancelled or failed |
| `packages/core/src/screens/main/pos/products/use-hid-scan.web.ts:219` | warn | Failed to reopen saved HID scanner |
| `packages/core/src/screens/main/pos/products/use-serial-scan.web.ts:203` | warn | serial connect cancelled or failed |
| `packages/core/src/screens/main/pos/products/use-serial-scan.web.ts:239` | warn | Failed to reopen saved serial scanner |
| `packages/core/src/screens/main/products/use-barcode.ts:62` | error | (runtime value: `String`) |

#### Printing — 10 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/hooks/use-print/use-print-external-url.electron.tsx:20` | warn | No HTML or external URL provided to print |
| `packages/core/src/screens/main/hooks/use-print/use-print-external-url.electron.tsx:74` | error | ipcRenderer not available |
| `packages/core/src/screens/main/hooks/use-print/use-print-external-url.tsx:19` | warn | (runtime value: `error.message`) |
| `packages/core/src/screens/main/hooks/use-print/use-print-external-url.tsx:51` | error | Print error |
| `packages/core/src/screens/main/hooks/use-print/use-print.tsx:21` | warn | No HTML content provided to print |
| `packages/core/src/screens/main/hooks/use-print/use-print.tsx:40` | error | Print error |
| `packages/core/src/screens/main/hooks/use-print/use-print.web.ts:53` | error | Print error in ${errorLocation} |
| `packages/core/src/screens/main/settings/printer/dialog/use-printer-dialog-form.ts:249` | warn | Printer vendor probe failed |
| `packages/core/src/screens/main/settings/printer/use-available-printer-profiles.ts:46` | warn | Unable to load cloud printer settings |
| `packages/core/src/screens/main/settings/printing/use-ensure-system-printer.ts:44` | error | Failed to ensure system printer |

#### Cart / checkout — 10 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/pos/checkout/components/payment-webview.tsx:340` | warn | Payment form failed to load in the checkout frame |
| `packages/core/src/screens/main/pos/contexts/current-order/use-new-order.ts:101` | error | (runtime value: `error`) |
| `packages/core/src/screens/main/pos/hooks/use-add-coupon.ts:54` | warn | Coupon application rejected |
| `packages/core/src/screens/main/pos/hooks/use-cart-lines.ts:264` | warn | t('pos_cart.coupon_refresh_timeout') |
| `packages/core/src/screens/main/pos/hooks/use-cart-lines.ts:284` | error | (runtime value: `String`) |
| `packages/core/src/screens/main/pos/hooks/use-cart-lines.ts:354` | error | (runtime value: `String`) |
| `packages/core/src/screens/main/pos/hooks/use-cart-stock-guard.ts:106` | warn | t('pos_products.out_of_stock', { name }) |
| `packages/core/src/screens/main/pos/hooks/use-cart-stock-guard.ts:119` | warn | t('pos_products.out_of_stock', { name }) |
| `packages/core/src/screens/main/pos/hooks/use-cart-stock-guard.ts:145` | warn | (runtime value: `message`) |
| `packages/core/src/screens/main/pos/hooks/use-cart-stock-guard.ts:168` | warn | t('pos_cart.will_be_backordered', { name }) |

#### App shell / startup — 9 sites

| Site | Level | Message |
| --- | --- | --- |
| `apps/main/app/(app)/_layout.tsx:235` | warn | Failed to hydrate host sync metrics |
| `apps/main/app/(app)/_layout.tsx:245` | warn | Failed to persist host sync metrics |
| `apps/main/app/_layout.tsx:139` | error | Failed to clear local data before hydration |
| `apps/main/components/root-error.tsx:91` | error | Failed to schedule the pre-hydration reset; falling back to direct clear |
| `apps/main/components/root-error.tsx:101` | error | Failed to clear database: ${err instanceof Error ? err.message : String(err)} |
| `apps/main/lib/sync-status-persistence-bridge.tsx:37` | warn | Failed to hydrate sync status |
| `apps/main/lib/sync-status-persistence-bridge.tsx:48` | warn | Failed to persist sync status |
| `packages/core/src/contexts/translations/index.tsx:46` | error | Failed to initialize translations |
| `packages/core/src/contexts/translations/index.tsx:59` | error | Failed to change language |

#### Local database / search — 8 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/database/src/plugins/reset-collection.ts:23` | error | Unhandled collection reset hook failure |
| `packages/database/src/plugins/search.ts:93` | warn | Failed to destroy evicted search instance |
| `packages/database/src/plugins/search.ts:139` | warn | Failed to remove existing FlexSearch collection |
| `packages/database/src/plugins/search.ts:203` | warn | Could not destroy search collection via database |
| `packages/database/src/plugins/search.ts:434` | warn | Skipping non-FlexSearch collection destruction |
| `packages/database/src/plugins/search.ts:458` | warn | Error destroying search instance on cleanup |
| `packages/database/src/plugins/search.ts:556` | warn | Error destroying old search instance |
| `packages/query/src/requirement-bridge.ts:637` | warn | Search requirement failed; continuing with local results |

#### Records (refresh / refund / stock) — 8 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/coupons/cells/actions.tsx:65` | error | Failed to refresh coupons |
| `packages/core/src/screens/main/customers/cells/actions.tsx:71` | error | Failed to refresh customer |
| `packages/core/src/screens/main/hooks/use-stock-adjustment.ts:46` | error | Stock refresh failed |
| `packages/core/src/screens/main/orders/cells/actions.tsx:90` | error | Failed to refresh order |
| `packages/core/src/screens/main/orders/cells/actions.tsx:153` | error | t('orders.delete_not_permitted') |
| `packages/core/src/screens/main/orders/refund/use-refund-mutation.ts:120` | warn | Refund succeeded but the local order refresh failed |
| `packages/core/src/screens/main/products/cells/actions.tsx:61` | error | Failed to refresh product |
| `packages/core/src/screens/main/products/cells/variation-actions.tsx:67` | error | Failed to refresh variation |

#### Settings / UI — 7 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/components/header/user-menu.tsx:124` | error | Failed to schedule the pre-hydration reset; falling back to direct clear |
| `packages/core/src/screens/main/components/header/user-menu.tsx:132` | error | Failed to clear database: |
| `packages/core/src/screens/main/components/header/user-menu.tsx:159` | error | Store switch failed |
| `packages/core/src/screens/main/contexts/ui-settings/provider.tsx:83` | warn | storeDB.addState( |
| `packages/core/src/screens/main/contexts/ui-settings/provider.tsx:95` | error | Failed to merge initial values for ${id} |
| `packages/core/src/screens/main/settings/general.tsx:166` | error | Failed to restore server settings |
| `packages/core/src/screens/main/settings/tax.tsx:141` | error | Failed to restore server settings |

#### Receipts & receipt email — 6 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/receipt/email-queue/bridge.tsx:62` | warn | Receipt email drain failed |
| `packages/core/src/screens/main/receipt/email-queue/queue.ts:507` | warn | Queued receipt email deferred |
| `packages/core/src/screens/main/receipt/email-queue/queue.ts:556` | warn | Could not record a receipt email outcome |
| `packages/core/src/screens/main/receipt/email.tsx:94` | error | Failed to queue receipt email |
| `packages/core/src/screens/main/receipt/hooks/use-receipt-data.ts:97` | error | Failed to fetch receipt data |
| `packages/core/src/screens/main/receipt/hooks/use-templates-sync.ts:53` | error | Failed to sync templates |

#### Store health screens — 4 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/health/queued-emails.tsx:76` | error | Receipt email retry failed |
| `packages/core/src/screens/main/health/queued-emails.tsx:106` | error | Receipt email removal failed |
| `packages/core/src/screens/main/health/rejected-mutations.tsx:112` | error | dead letter resolution failed |
| `packages/core/src/screens/main/hooks/use-collection-reset.ts:54` | warn | clearAndSync: reset needs confirmation |

#### HTTP client — 4 sites

| Site | Level | Message |
| --- | --- | --- |
| `apps/main/lib/engine-fetcher.ts:176` | warn | Server clock is ${Math.abs(result.skewSeconds)}s ${result.skewSeconds > 0 ?  |
| `packages/hooks/src/use-http-client/http.electron.ts:173` | warn | Failed to cancel IPC request |
| `packages/hooks/src/use-http-client/http.electron.ts:182` | warn | Failed to cancel IPC request |
| `packages/hooks/src/use-http-client/use-http-client.tsx:95` | error | Error handler ${handler.name} threw an error |

#### Connectivity — 2 sites

| Site | Level | Message |
| --- | --- | --- |
| `packages/core/src/screens/main/components/online-status-logger.tsx:27` | error | t('common.device_went_offline') |
| `packages/core/src/screens/main/components/online-status-logger.tsx:30` | error | t('common.website_is_unreachable') |
<!-- END GROUPED INVENTORY -->

### The ticket's named offenders, explicitly

| Offender (as seen on screen) | Where it comes from | `context.type` | Code today | Proposal |
| --- | --- | --- | --- | --- |
| "Request to your store" (warn) | `apps/main/lib/engine-fetcher.ts:143-146` (status 0), `:253-258` (non-ok; error on 403) via `sync-log-observer.ts:255-269` | `transport.request` | none | SYNC121 / SYNC131 / SYNC141 / AUTH201 / AUTH101 by status — reuse `parse-wp-error.ts:115-140` |
| "A background maintenance task failed" | `packages/sync-engine/src/maintenance/maintenance-lanes.ts:295`, level forced to warn at `sync-log-observer.ts:435-440` | `maintenance.lane.error` | none | **mint** a SYNC lane-crash code |
| "Background sync task finished" **at error** | `packages/sync-engine/src/automatic-tick-gate.ts:47-60` (and `create-rxdb-sync-engine.ts:738`) | `engine.lane.tick` | none | same lane-crash code |
| "Checking your store for changes failed" | `packages/sync-engine/src/change-signal/change-signal-lane.ts:381` | `signal.tick.error` | none | SYNC121 / SYNC131 by cause |
| Novu init / fetch / `waitReady` failures | `services/novu/bootstrap.ts:175,181,246,350,354,414`; `client.ts:108,175,220,286,294,306,322,329,345,352,368,375,391,398,414,421,441`; `client.electron.ts:43,50` (`waitReady` is one of the `${action}` values, `:106`); `notification-sync.ts:20,105,156`; `subscriber.ts:163`; `contexts/novu/notifications.tsx:184,212,236` — **32 sites** | none | none | **mint** — no domain in the 38 covers merchant *notifications*; also the loudest single family in the log, and arguably most of it should not be error at all |
| "El sitio web es inaccesible" | `packages/core/src/screens/main/components/online-status-logger.tsx:30` — `logger.error(t('common.website_is_unreachable'), …)` | none | none | SYNC121 `SYNC_UNREACHABLE`. Note the **second** defect: the message is `t(…)`-rendered at write time, so the persisted row is frozen in the till's language (the exact #912 failure mode the sync observer was fixed for). `common.device_went_offline` at `:27` is the same. Both have a legacy code sitting unused (`API01007 DEVICE_OFFLINE`, `API01008 WEBSITE_UNAVAILABLE`) |
| "Barcode settings could not be loaded" | `packages/sync-engine/src/create-rxdb-sync-engine.ts:1252-1257` (emitted at **debug**, raised to warn by `sync-log-observer.ts:420-425`) | `engine.barcode-selector-hydrate-failed` | none | **mint** a PRODUCT scanning-degraded code |

Six other localized-at-write-time messages share the `t(…)` defect and are also bare:
`hooks/barcodes/too-short-feedback.ts:20`, `pos/products/storage-outage-banner.tsx:36`,
`pos/hooks/use-cart-lines.ts:264`, `pos/hooks/use-cart-stock-guard.ts:106,119,168`,
`orders/cells/actions.tsx:153`.

---

## 3(c). Registry drift in the other direction

### The 38-code registry: 30 never emitted

Grepping each of the 38 codes (and each symbol) across `packages/**` and `apps/main/**` outside
`packages/utils/src/logger/`: **no code string appears at any emit site.** The only production path
that can produce one is `parse-wp-error.ts`, which reaches **8**:

`AUTH101 SESSION_EXPIRED`, `AUTH201 INSUFFICIENT_ROLE`, `AUTH301 AUTH_PLUGIN_CONFLICT`,
`AUTH311 REST_ROUTE_MISSING`, `SYNC131 STORE_SERVER_ERROR`, `SYNC141 STORE_RATE_LIMITED`,
`SYNC211 RECORD_INVALID_FIELD`, `CLIENT999 UNEXPECTED_ERROR`
(`packages/hooks/src/use-http-client/parse-wp-error.ts:56-140`), stamped only at
`use-http-client.tsx:298`.

**The other 30 are dead letters** — registered, documented, translated, help-dialog-ready, and
never written by anything:

| Domain | Never emitted |
| --- | --- |
| SYNC (8 of 10) | SYNC101, SYNC111, SYNC121, SYNC201, SYNC301, SYNC311, SYNC321 — plus SYNC131/SYNC141 only via HTTP fallback |
| AUTH (1 of 5) | AUTH401 `TLS_UNTRUSTED` |
| CHECKOUT (4 of 4) | CHECKOUT101, CHECKOUT201, CHECKOUT211, CHECKOUT301 |
| PAYMENT (4 of 4) | PAYMENT101, PAYMENT201, PAYMENT301, PAYMENT401 |
| PRINT (3 of 3) | PRINT101, PRINT201, PRINT301 |
| PRODUCT (5 of 5) | PRODUCT101, PRODUCT111, PRODUCT201, PRODUCT301, PRODUCT401 |
| LICENSE (3 of 3) | LICENSE101, LICENSE201, LICENSE301 |
| CLIENT (3 of 4) | CLIENT101, CLIENT201, CLIENT211 (only reachable via the dead `map-exception.ts`) |

Four whole domains — CHECKOUT, PAYMENT, PRINT, PRODUCT — have **zero** live codes, while their
subject matter is emitting bare rows right now (10 printing sites, 10 cart/checkout sites, 13
barcode sites in Family B above).

### The legacy 69-code table: still the de-facto vocabulary, and unresolvable

`packages/utils/src/logger/error-codes.ts` defines 69 codes; `registry.ts:33-41` marks all of them
`deprecated: true`. Yet **104 of the 111 coded emit sites use them.** 39 distinct legacy codes are
live; 30 are never emitted:

`API01003`, `API01004`, `API02002`, `API02003`, `API02004`, `API02006`, `API02009`, `API03003`,
`API03004`, `API03005`, `API03006`, `API04006`, `API05002`, `API05003`, `API05004`, `API06002`,
`API06003`, `DB01002`, `DB02004`, `DB02006`, `DB03001`, `DB03004`, `PY01001`, `PY01002`, `PY01003`,
`PY01004`, `PY02002`, `SY01001`, `SY01002`, `SY01003`.

Most-used live legacy codes: `DB01003 TRANSACTION_FAILED` (31 sites), `API01002 CONNECTION_REFUSED`
(9), `API02010 AUTH_REQUIRED` (6), `DB02002 RECORD_NOT_FOUND` (6), `DB03002 INVALID_DATA_TYPE` (6).

**None of the 39 live legacy codes exists in `ERROR_CATALOGUE`.** `catalogueFor` returns `null`
(`packages/core/src/screens/main/logs/row-detail.tsx:27-29`), so a merchant looking at a
`DB01003` chip gets a chip that expands into nothing — no summary, no safe action, no data-safety
line, no help dialog (`row-detail.tsx:131-134, 202, 216`). The 31-site `TRANSACTION_FAILED` is the
single most common code in the product and it is the emptiest row in the ledger.

Plus two vocabularies that belong to no registry at all: the invented
`'STORE_VALIDATION_FAILED'` (`packages/core/src/utils/merge-stores.ts:301`) and raw server/errno
codes forwarded straight into the `code` column by the receipt-email queue
(`receipt/email-queue/queue.ts:483` ← `classify.ts:117-134`, values like `woocommerce_rest_*`,
`ECONNREFUSED`).

---

## 3(d). What full coverage would take

**The shape of the work, in rough order of leverage:**

1. **Stamp the sync bridge (1 file, closes 41 event types → the whole SYNC domain).** The observer
   already owns a total, compile-enforced policy table keyed by event type
   (`sync-log-observer.ts:176-473`). Adding an optional `code?: ErrorCode` field to `Conformance`
   and forwarding it into `context.errorCode` at `:578-582` is a small change that converts the
   single largest bare family in one move. Making the field **required for any entry whose row can
   be warn/error** turns it into the same build-time gate `check-event-labels.mjs` already gives
   labels. ~13 of the 41 need a *newly minted* code; ~16 map cleanly onto existing SYNC/AUTH/CLIENT
   codes; ~12 are plausible "no code needed — this is not a defect" rulings.

2. **Wire the transport status map (1 file, kills the highest-volume offender).** `transport.request`
   is issued continuously; its failures are the most-seen bare warn in the product. The status→code
   table already exists at `parse-wp-error.ts:115-140` and just needs calling from
   `engine-fetcher.ts:143` / `:253`.

3. **Retire or promote the legacy table.** 104 emit sites carry codes that render an empty chip.
   Either (a) mint catalogue entries for the ~39 live legacy codes, or (b) map each live legacy code
   onto a registry code and migrate the call sites. (b) is the smaller surface — 39 distinct codes
   for 104 sites, and a third of them collapse onto `SYNC101`/`SYNC111` (the DB family) and
   `SYNC121`/`SYNC131` (the API family). Whichever way it goes, `registry.ts`'s `deprecated: true`
   should stop being advisory.

4. **Delete or wire `map-exception.ts`.** Four branches, zero callers, and it is the only thing
   standing between a raw thrown error and `CLIENT999`. Either call it from the logger as the last
   resort when a warn/error arrives with no `errorCode` (which would take bare-row count to zero by
   construction, at the cost of a lot of `CLIENT999`), or delete it.

5. **Decide the Novu policy (32 sites, one call).** The largest hand-written family. It needs either
   a minted notification domain or a ruling that Novu plumbing is not merchant-facing and should be
   logging at debug/info, not error. Today, 22 of the 32 are at `error` — the level that promotes
   the flight recorder (`packages/utils/src/logger/index.ts:710`) — for things like
   "client not initialized".

6. **The 8 remaining domains of Family B** (~70 sites): auth/OAuth (21), barcode (13), printing
   (10), cart/checkout (10), app-shell (9), local DB/search (8), record refresh (8), settings/UI (7),
   receipts (6), health screens (4), HTTP client (4), connectivity (2). PRINT, PRODUCT, CHECKOUT and
   PAYMENT codes already exist and are unused, so several of these are pure wiring rather than
   minting.

7. **A gate, or it drifts back.** Nothing today fails a build for a bare warn/error row or an
   unregistered code value. The two candidates are a lint rule ("`logger.warn`/`logger.error` must
   pass `context.errorCode`") and a script in the shape of `check-event-labels.mjs` asserting that
   every literal `errorCode:` value is a member of the generated `ErrorCode` union. The second also
   catches `'STORE_VALIDATION_FAILED'` and the receipt-queue passthrough.

**Separately surfaced by this survey** (not the ticket's question, but adjacent and cheap to fix
alongside):

- 9 sites persist a `t(…)`-rendered message, freezing the row in the till's language — the exact
  defect #912 fixed for sync rows. Listed in §3(a).
- `saveToDb` is dead (`index.ts:43-44`); several call sites still pass it expecting suppression,
  including one that explicitly reasons about not persisting during a storage outage
  (`storage-outage-banner.tsx:33-37`).

---

## Method

- `git fetch origin next`; read via a dedicated worktree at `origin/next` (`a5996be4a`). No test
  suites run.
- Emit-site census: balanced-paren scan of every `*.warn(` / `*.error(` call in `packages/**` and
  `apps/main/**` excluding `*.test.*`, `__tests__/`, `e2e/`, `node_modules/` and `console.*`;
  a call counts as "coded" iff the literal `errorCode` appears inside its argument list. 250 raw
  matches, 5 removed as non-logger receivers (`subscriber.error` ×2 in
  `packages/query/src/engine-adapter/execute-query.ts:226,253` — RxJS; `scan.error` in
  `pos/products/use-barcode.ts:162` — scan-feedback handle; `log.warn`/`log.error` in
  `packages/utils/src/logger/index.ts:934,942` — the logger's own internals) ⇒ 245.
- Engine-event census: for every `type: '<dotted.name>'` literal in `packages/sync-engine/src`,
  `packages/sync-core/src`, `packages/query/src`, `packages/database/src`, `packages/core/src` and
  `apps/main`, the enclosing object literal was extracted and its `level:` read from the *same*
  literal; dynamic levels were read by hand. Cross-checked against the `INVISIBLE` and `level`
  overrides in `apps/main/lib/sync-log-observer.ts`.
- `apps/electron` is a submodule and was **not** in scope; it has its own `electron-log` transport
  and does not write to the `logs` collection through this logger.
