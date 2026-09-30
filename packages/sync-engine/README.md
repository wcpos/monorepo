# `@wcpos/sync-engine`

PORTED-FROM: woo-rxdb-replication-lab@c081086


The RxDB binding for the sync engine facade.

## Layout

Production (`monorepo-v2`) layout is the convention here:

- filenames are kebab-case and match their primary export (`create-rxdb-sync-engine.ts` → `createRxdbSyncEngine`);
- each file owns one concept, with its `*.test.ts` beside it;
- feature internals live in domain-named folders: `change-signal/`, `collections/`, `local-coverage/`, `maintenance/`, `materialization/`, `scheduler/`, and `write-path/`;
- genuinely package-level facade files remain at `src/`.

**Layout frozen (2026-07-11): renames need a reason, not taste.**

## Two-door contract

Consumers have exactly two supported doors:

- `@wcpos/sync-engine` for the runtime facade and public types;
- `@wcpos/sync-engine/testing` for test-only builders, repositories, schemas, and scenario helpers.

Everything behind those entry points is package-private. Internal paths may not be imported by another package. Moving an internal file must not change either door's exported names.

`sync()` without a lane runs the foreground/manual lanes in this stable order:
change-signal, write-drain, order-window-seed, product-browse-window-seed, reference-seed,
scheduler-drain, query-total-retry, coverage-compaction, existence-prime,
existence-reconcile. The seed lanes deliberately run BEFORE the
scheduler drain (#516 item 6): they only enqueue persisted tasks, so the
drain in the same `sync()` call executes the work they just seeded — a
manual `sync()` never returns `'ran'` with its own seeded work still
pending. `status()` reports the current `gatedBy` reason, per-scope
bootstrap failures, and each lane's `lastTick` plus `lastError`.
`customer-trickle` is also registered, but is idle-only: auto mode first ticks
it at its five-minute boundary, and no-arg `sync()` deliberately excludes it.
Tests and diagnostics can tick it explicitly with `sync('customer-trickle')`.

## SyncEvent telemetry vocabulary

ADR 0020 defines `ports.diagnostics?: SyncObserver` as the single, best-effort telemetry spine. Every event carries `type` and `level`, and may carry `collection`, `message`, `fields`, and `at`; timings use `fields.durationMs`.

The engine's diagnostics call sites emit these event types (including events emitted by sync-core operations to which the engine passes the same observer):

| Event type | Key fields |
| --- | --- |
| `engine.listener-error` | `listener`, `eventType`; error text in `message` |
| `engine.collection-reset` | `collection`, `scopeId` |
| `engine.reset-needs-confirmation` | `collection`, `scopeId` |
| `engine.guard` | `scopeId`, `outcome` |
| `engine.pos-bootstrap-error` | `scopeId`; error text in `message` |
| `engine.scope-switched` | active scope in `message` |
| `engine.lane.tick` | `lane`, `scopeId`, plus lane report counters |
| `engine.connectivity-error`, `engine.disposed` | error or lifecycle text in `message` |
| `signal.log`, `signal.tick.error` | structured signal detail or error text in `message` |
| `queue.scheduler.drain` | scheduler drain counters and `durationMs` |
| `queue.drain.progress` | `completed`, `total`, `taskId`, `collection` |
| `queue.write.enqueued` | `recordId`, `mutationId`, `operation`, `scopeId`, `baseRevision` |
| `queue.write.tick.error` | error text in `message` |
| `queue.write.drain` | `scanned`, `attempted`, `pushed`, `deferred`, `conflicts`, `failed`, `rejected` |
| `queue.write.coalesce`, `queue.write.annihilate` | `recordId`; `removed`/`added` counters |
| `queue.write.needs-revision` | `recordId`, `mutationId` — an unrecoverable 428 parked for explicit resolution |
| `queue.write.born-twice-requeue` | `recordId`, `mutationId`, `followUpMutationId` — a 200-acked create's discarded snapshot re-queued |
| `queue.write.resolve` | `recordId`, `mutationId`, `resolution` |
| `queue.write.conflict-transition` | `recordId`, `mutationId` — one terminal transition after push conflict |
| `queue.write.discard-repull-deferred` | `mutationId`, `remoteId` — the discard's immediate re-pull failed; the durable task self-heals later |
| `queue.write.reschedule-failed` | `recordId`, `mutationId`, `attempts` |
| `push.in_progress`, `push.conflict`, `push.rejected`, `push.error`, `push.aborted`, `push.outcome` | `recordId`, `mutationId`, `operation`, `attempts`; outcome/status/reason where applicable |
| `coverage.require.log` | coverage detail in `message` |
| `coverage.require.outcome` | requirement identity, collection, action/outcome counters |
| `coverage.require.error` | requirement identity; error text in `message` |
| `coverage.gate.hit`, `coverage.gate.miss` | requirement and coverage decision fields |
| `coverage.compacted` | `removed` |
| `coverage.existence-prime` | `products`, `customers`, `orders`, `durationMs` |
| `coverage.existence-reconcile` | `buckets`, `pruned`, `emptyBuckets`, `missing`, `changed`, `skippedDirty`, `durationMs` |
| `<maintenance-lane>.tick`, `<maintenance-lane>.tick-error` | lane summary or error text in `message` |
| `apply.refresh` | `collection` |
| `apply.refetch` | `collection`, `refetched`, `reason` |
| `apply.barcode-rederive` | `collection`, `docs`, `applied` |
| `apply.escalation` | `collection`, `from`, `to`, `reason` |
| `apply.pull`, `apply.delete` | `collection`, `requested`, `applied` |

This is the complete census of diagnostics `SyncEvent` types emitted by the
engine and the sync-core operations that receive its observer at HEAD. The
engine's separate host-view `EngineEvent` stream also emits
`write-annihilated` when a never-pushed local write chain cancels out; it is not
a diagnostics `SyncEvent`.

## Using it outside the monorepo

### Installing

Install from GitHub Packages with this line in your `.npmrc` and a token with
`read:packages` access:

```ini
@wcpos:registry=https://npm.pkg.github.com
```

The required peer is `rxdb@17.5.0`. `rxdb-premium@17.5.0` is an optional peer;
the engine never imports it, but the host needs it to enable the premium flag below.
The published engine depends on the exact matching version of `@wcpos/sync-core`.
The two packages are published in lockstep: if your host also depends on sync-core,
use that same version so a second copy does not break `instanceof` checks across them.

### Host setup

- Call `setPremiumFlag()` from `rxdb-premium/plugins/shared` before
  `createRxdbSyncEngine`. The engine opens about 39 collections; open-source RxDB
  refuses more than 16 with `COL23`. WCPOS sets the flag in
  [`packages/database/src/plugins/index.ts`](../database/src/plugins/index.ts).
- Supply an RxDB 17 storage implementation through the `storage` port.
- Set `setSyncEngineLogger(logger | null)`, exported from `@wcpos/sync-engine`, once
  before creating engines. It is a process-wide warn sink, defaulting to `console.warn`;
  `null` restores that default. See
  [`apps/main/lib/create-app-engine.ts`](../../apps/main/lib/create-app-engine.ts).

### RxDB patches

A registry install gets stock `rxdb`/`rxdb-premium`; it does not get WCPOS's patches.
The host must apply these itself if it needs the fixes. WCPOS applies the RxDB patch
through pnpm `patchedDependencies` and the seven premium scripts through the root
`postinstall`, after rxdb-premium has materialized its licensed `dist/` files.
Abstract-filesystem storages below include OPFS and filesystem storage.

| Patch | What it fixes | Applies when |
| --- | --- | --- |
| [`patches/rxdb@17.5.0.patch`](../../patches/rxdb@17.5.0.patch) | Keeps `IncrementalWriteQueue` in `dist/{cjs,esm}/incremental-write.js` from staying wedged with `isRunning` stuck after a failed bulk write. | Always |
| [`scripts/patch-rxdb-premium-resurrection-leak.mjs`](../../scripts/patch-rxdb-premium-resurrection-leak.mjs) | Prevents leaked index rows when a soft-deleted document is reinserted. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-task-queue-containment.mjs`](../../scripts/patch-rxdb-premium-task-queue-containment.mjs) | Releases access handles and keeps the task queue usable after a storage task fails. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-changelog-replay-safety.mjs`](../../scripts/patch-rxdb-premium-changelog-replay-safety.mjs) | Makes changelog compaction crash-safe and rebuilds corrupt derived indexes from `documents.json` on boot. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-cleanup-compaction-batch.mjs`](../../scripts/patch-rxdb-premium-cleanup-compaction-batch.mjs) | Batches document moves and index writes in the same cleanup round. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-changes-file-salvage.mjs`](../../scripts/patch-rxdb-premium-changes-file-salvage.mjs) | Tracks append offsets and salvages complete leading bulks from damaged `changes.json` logs. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-changelog-identity.mjs`](../../scripts/patch-rxdb-premium-changelog-identity.mjs) | Applies peer changelog operations by index-string identity when positions drift, avoiding deletion of healthy neighbours. | Abstract-filesystem storages |
| [`scripts/patch-rxdb-premium-flexsearch-churn.mjs`](../../scripts/patch-rxdb-premium-flexsearch-churn.mjs) | Skips append writes and re-indexing for text already held in the index. | FlexSearch |

### Publishing

[`.github/workflows/publish-sync-packages.yml`](../../.github/workflows/publish-sync-packages.yml)
publishes both packages in lockstep. Manual dispatch publishes
`<base>-next.<run>.g<sha7>` on dist-tag `next`; a `sync-packages-v<version>` tag
publishes that version. The workflow uses `pnpm pack`, then `npm publish <tarball>`.
Direct publishing from a package folder is blocked: npm ignores pnpm's
`publishConfig` overrides for `main`/`types`/`exports` and does not rewrite `workspace:*`.
