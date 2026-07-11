# `@woo-rxdb-lab/sync-engine-rxdb`

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

- `@woo-rxdb-lab/sync-engine-rxdb` for the runtime facade and public types;
- `@woo-rxdb-lab/sync-engine-rxdb/testing` for test-only builders, repositories, schemas, and scenario helpers.

Everything behind those entry points is package-private. Internal paths may not be imported by another package. Moving an internal file must not change either door's exported names.

`sync()` without a lane runs all registered lanes in this stable order:
change-signal, write-drain, order-window-seed, reference-seed,
scheduler-drain, query-total-retry, coverage-compaction, existence-prime,
existence-reconcile. The two seed lanes deliberately run BEFORE the
scheduler drain (#516 item 6): they only enqueue persisted tasks, so the
drain in the same `sync()` call executes the work they just seeded — a
manual `sync()` never returns `'ran'` with its own seeded work still
pending. `status()` reports the current `gatedBy` reason, per-scope
bootstrap failures, and each lane's `lastTick` plus `lastError`.

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
| `queue.write.discard-repull-deferred` | `mutationId`, `wooOrderId` — the discard's immediate re-pull failed; the durable task self-heals later |
| `queue.write.reschedule-failed` | `recordId`, `mutationId`, `attempts` |
| `push.in_progress`, `push.conflict`, `push.rejected`, `push.error`, `push.aborted`, `push.outcome` | `recordId`, `mutationId`, `operation`, `attempts`; outcome/status/reason where applicable |
| `coverage.require.log` | coverage detail in `message` |
| `coverage.require.outcome` | requirement identity, collection, action/outcome counters |
| `coverage.require.error` | requirement identity; error text in `message` |
| `coverage.gate.hit`, `coverage.gate.miss` | requirement and coverage decision fields |
| `coverage.compacted` | `removed` |
| `coverage.existence-prime` | `products`, `customers`, `orders`, `durationMs` |
| `coverage.existence-reconcile` | `buckets`, `pruned`, `pulled`, `repulled`, `skippedDirty`, `durationMs` |
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
