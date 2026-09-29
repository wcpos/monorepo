# PR 3A — SQLite wasm web storage (#2242)

## Status / scope

Implemented the PR 3A worker, delivery, web adapter, cleanup, and prescribed deletions on
`feat/2242-web-engine-pr3`, based on `513ac45f8`. No fetch/pull/rebase, push, PR, wiki edit,
submodule edit, or PR 3B implementation. Existing staged briefs/findings and the newly supplied
`BRIEF-PR3B.md` were not authored or included in implementation commits.

Stakes: high, persisted storage under money paths. Scope: approximately 395 added non-test source
lines, excluding generated assets, lockfile, and this report; prescribed deletions are separate.
The only lifecycle additions are the requested seams and closing registered databases before clear.
No restart, retry, fallback storage, feature flag, or new locking system.

## Changed, by file

- `package.json`, `pnpm-lock.yaml`: exact root build dependency
  `@sqlite.org/sqlite-wasm@3.53.4-build1`; replace `build:opfs-worker` with `build:sqlite-worker`.
  Registry lookup confirmed the requested build. pnpm also normalized existing ESLint peer snapshot
  keys in the lockfile; no versions of those dependencies changed.
- `scripts/sqlite-basics-oo1.mjs`: oo1 adapter, exclusive locking before WAL, verified journal-mode
  readback, synchronous NORMAL (#2144), boolean bindings, no adapter logging.
- `scripts/sqlite-worker-entry.mjs`: synchronous RPC exposure; lazy wasm/pool initialization;
  base64 attachments; wasm beside worker with the worker's query string retained.
- `packages/database/src/adapters/storage/sqlite-pool.ts`, `packages/database/src/index.ts`:
  dependency-free shared/exported constants. Installed SQLite source (`dist/index.mjs`, SAHPool
  constructor) sets `vfsDir = options.directory || '.' + vfsName`; `wcpos-sqlite` therefore owns
  `.wcpos-sqlite`. No directory or clearOnInit override.
- `scripts/build-sqlite-worker.mjs`, `apps/main/public/sqlite.worker.js`,
  `apps/main/public/sqlite3.wasm`: tracked module-worker bundle and copied wasm. The package's actual
  wasm export resolves to `dist/sqlite3.wasm`, not the historical jswasm path.
- `scripts/sqlite-worker.test.mjs`: shipped patch-marker/banner, wasm magic/hash, real Node oo1 WAL,
  NORMAL, refused WAL on `:memory:`, and true/false bindings.
- `scripts/sqlite-worker-probe.mjs`: local static server/headless Chromium release gate; actual
  shipped artifacts, write/read/close/reopen, page/worker restart persistence, wasm cache-buster,
  and the E2E helpers' opaque-pool export/restore followed by a real SQLite read.
- `packages/database/src/adapters/storage/index.web.ts` and its test: lazy page client, one worker,
  module options, retained basename refusal, termination and worker-loss subscriptions.
- `packages/database/src/plugins/wrapped-error-handler-storage.ts` and its test: explicit
  worker-event reporter and optional watchdog `onCondemn`; pending writes remain un-rejected by
  the clock. Events cover registered DBs or a pre-instance sentinel.
- `packages/database/src/adapters/default/index.web.ts`, `storage/storage-engines.ts`: flip engine
  and `multiInstance: false` together; remove repair plugin, subscribe to worker loss, terminate
  on watchdog condemnation. Ruling/timing test mocks updated; two-era and wrapper assertions stay.
- `apps/main/app/+html.tsx`, `apps/main/public/index.html`: `/sqlite.worker.js` bootstrap.
- `apps/main/lib/create-app-engine.ts` and its test: engine-required web multiInstance flag; remove
  web write lease/outcome bridge wiring. Keep scope/header/disposal behavior and generic sync-engine
  ports/tests. No sync-engine, sync-core, query, core, or schema source changed.
- `packages/database/src/plugins/rx-database-registry.ts` and test,
  `clear-all-db.web.ts` and test: close registered DBs, then terminate worker, then delete pool plus
  known legacy app roots. A failed close prevents termination/deletion.
- `packages/database/src/measure-storage.web.ts`, `measure-storage-types.ts`, new measurement test:
  recursively measure the opaque pool as one entry with `root: 'sqlite'`; filesystem roots legacy.
- `packages/database/src/purge-legacy-db.web.test.ts`: pool survives while v6 entries are purged;
  existing purge implementation already satisfies this, so no production purge change.
- `apps/main/e2e/opfs-helpers.ts`: document that its existing recursive copy preserves SQLite pool
  files/metadata too. No copy rewrite was needed; the Chromium probe executes these exact helpers.
  `global-setup.ts` already closes the auth page before export, so it is unchanged.
- `apps/main/e2e/session-recovery.live.spec.ts`, `ghost-prune.live.spec.ts`: explicit skips naming
  #2242 and “SQLite pool: needs a worker-side query, PR 5”.
- `packages/eslint/index.js`: browser worker/oo1 modules excluded from Node globals override;
  native recovery mirror ignores retained.
- `scripts/ci-plan.mjs`, `scripts/ci-plan.test.mjs`: document existing conservative script routing
  and pin the replacement build/worker/adapter/probe filenames.
- `packages/database/src/adapters/default/README.md`: current SQLite era/lifecycle, historical
  #1049/#1057/#1987 ruling, explicit PR 3B deployment boundary.

### Deletions

As requested: `scripts/opfs-worker-entry.mjs`, `build-opfs-worker.mjs`, `patch-opfs-worker.mjs`
and its test, `opfs-repair-ownership.mjs` and its test; `apps/main/public/opfs.worker.js`;
`packages/database/src/plugins/repair-ownership.ts` and its test; `apps/main/lib/web-write-leader.ts`
and its test; `apps/main/e2e/two-tab-changelog-identity.spec.ts`.

All eight premium patchers, shared/native targeted recovery, mirror tests/ignores, query recovery,
and ledger recovery remain. Generic sync-engine owner/bridge ports and tests are untouched.

## Verification — Observed

Commands run from the worktree root. Tests ran one suite at a time, Jest capped at two workers.

| Command | Result |
| --- | --- |
| `npm view @sqlite.org/sqlite-wasm version` and `npm view @sqlite.org/sqlite-wasm@3.53.4-build1 version` | Both returned `3.53.4-build1`. |
| `pnpm add -w -D @sqlite.org/sqlite-wasm@3.53.4-build1` | Exit 0; all eight postinstall patches confirmed present. |
| Brief's `pnpm --filter @wcpos/database test -- --maxWorkers=2` | Exit 1, no tests: pnpm forwards the extra `--`, so Jest treats the worker flag as a filename pattern. Corrected commands below omit it. |
| Baseline `pnpm --filter @wcpos/database test --maxWorkers=2` | Exit 0: 48 suites / 597 tests passed; 1 suite / 1 test skipped. |
| `node --test scripts/sqlite-worker.test.mjs` before implementation | Exit 1: 3 failed because the worker, wasm and adapter did not exist. |
| Targeted database red runs (`test --maxWorkers=2 --coverage=false` with `index.web.test.ts`, `wrapped-error-handler-storage.test.ts`, clear/measure/purge tests, and registry test) | Demonstrated old path/eager client, missing event/condemn hooks, missing pool measurement/clear, and missing close-registry behavior. Existing purge guard already passed. |
| App-engine red run: `pnpm --filter @wcpos/main test --maxWorkers=2 --runTestsByPath lib/create-app-engine.test.ts` | Exit 1: 8 old-topology cases failed, 51 passed. |
| `pnpm build:sqlite-worker` | Exit 0; rerun after source formatting. |
| `grep -o 'WCPOS_SQLITE_QUERY_TRANSLATION_PATCH=1' apps/main/public/sqlite.worker.js \| wc -l` | Exactly 1 (not line-count grep). |
| `node --test scripts/sqlite-worker.test.mjs` final | Exit 0: 3 passed. Node wasm opens a temporary virtual-filesystem file DB and really reports `wal`; no skip needed. Object rows have null prototypes, so tests normalize row prototypes before deep comparison. |
| `node scripts/sqlite-worker-probe.mjs` | Exit 0; output below, repeated after rebuild. |
| `pnpm --filter @wcpos/database test --maxWorkers=2 --coverage=false` and final `pnpm --filter @wcpos/database test --maxWorkers=2` | Both exit 0: 48 suites / 592 tests passed; 1 suite / 1 test skipped. |
| `pnpm --filter @wcpos/main test --maxWorkers=2 --runTestsByPath lib/create-app-engine.test.ts lib/storage-worker-bootstrap.test.ts` | Exit 0: 2 suites / 62 tests passed. |
| `pnpm --filter @wcpos/main test --maxWorkers=2` | Exit 0: 38 suites / 516 tests passed. |
| `pnpm test:scripts` (exact root script) | Exit 0: printer 43/43, ESLint-config 135/135, root scripts 925/925; dependency, Expo, AAR, labels, event types, CI matrix, test removal, workspace tasks, React compiler checks passed. |
| `pnpm --filter @wcpos/database exec tsc --noEmit` initial | Exit 1: new test's unresolved promise inferred `unknown`; corrected to `Promise<never>`. |
| `pnpm typecheck --force` | Exit 0: 15/15 tasks successful, none cached. This reports the repository's existing typecheck scripts as executed, not a stronger claim about their internals. |
| Changed-source `pnpm exec eslint --fix ...` | Exit 0; source formatting only. |
| Root `pnpm lint --filter=@wcpos/database --filter=@wcpos/main --filter=@wcpos/eslint-config` initial | Root filters are additive: runs all 17 packages. Found one formatting error in the subsequently corrected typed test. Final lint results recorded below. |
| `pnpm lint` final | Exit 0: 16/16 tasks successful (15 cached from the full run, database rerun); existing warnings remain, no errors. |
| Final explicit ESLint check of the new scripts, CI fixtures, and corrected test | Exit 0. |
| `git diff --check` | Exit 0. |

Core tests were not required: no core files changed. Retained generic sync-engine/query unit suites
were not separately run; the existing native/shared script regressions ran in `test:scripts`.

Probe output:

```text
PASS write/read/close/reopen/
PASS write/read/close/reopen/?read=persisted
PASS persistence across page/worker restart; wasm cache-buster
PASS write/read/close/reopen/?read=restored
PASS OPFS snapshot/restore preserves readable SQLite pool
```

### Mutation check

Temporarily changed the web adapter to `mode: 'storage'` and ran
`pnpm --filter @wcpos/database test --maxWorkers=2 --coverage=false index.web.test.ts`.
**Exit 1: 1 failed, 3 passed.** The lazy/reuse case failed its explicit `mode: 'one'` contract
assertion. Restored immediately. This is a wiring mutation check, not a claim that the mocked unit
worker reproduces real pool-handle contention; real close/reopen is covered by the Chromium probe.

### Reviews

Independent doc-logic review: CLEAN. Independent read-only code review: CLEAN within PR 3A,
not over-scoped; no additional actionable findings. Two review rounds total, no expanding loop.
Accepted risk: a direct clear with a wedged registered database close waits indefinitely; the normal
scheduled reset reloads first. No new timeout/cancellation is added to money-path writes.

## Behavior changes / regressions

- Web now uses SQLite with `multiInstance: false`, not abstract-filesystem live followers. Old web
  repair/write-leader/outcome channels are gone. **PR 3B ownership gate/takeover is still absent;
  this half is not a complete deployable multi-tab migration.**
- SQLite uses a new pool; this task does not migrate prior OPFS records or add a generation bump.
  Legacy purge semantics remain those of the existing generation filters. Old `rxdb-*` bytes are
  now reported as legacy; manual clear deletes both engines' app roots.
- Opaque pool bytes carry `root: 'sqlite'` and remain unattributed in the footprint UI. Observed:
  Electron currently also strips SQLite root metadata and its database-file entries become unknown;
  there is no existing SQLite-specific UI bucket to reuse. No bookkeeping attribution is fabricated
  and no core UI change is made. Per-collection attribution remains a follow-up.
- Fixed initial capacity remains 64, matching the spike. Observed: user + store (logs are a store
  collection) + first scope = 3 database/WAL pairs = 6 handles, leaving 58 headroom. Engine scope
  retention is unbounded, and closed database files remain in the pool; **64 cannot guarantee every
  possible session history** (at most 32 database/WAL pairs, fewer if other files occupy slots).
  Asked whether to retain this bounded policy or grow capacity; no growth policy was invented.
  SQLite's `initialCapacity` applies only to an empty pool, not existing pools.

## Not done / unverified

- `apps/web/tests/sync-build-artifacts.test.js` belongs to the separate web-bundle submodule.
  Left untouched, including its gitlink, as required. Companion change should replace its synthetic
  `opfs.worker.js` copy fixture with `sqlite.worker.js` plus `sqlite3.wasm`.
- No deployed WordPress/CDN MIME/cache verification, WebKit run, crash/power-loss durability test,
  native/Electron runtime test, or full authenticated app E2E run. No performance, compatibility,
  or “no regression” claim: old and new engines were not run on comparable application inputs.
- PR 3B: one-live-tab protocol, gate, parked screen, cooperative takeover, and worker-loss-to-parked
  wiring. PR 5: worker-query replacements for the two skipped filesystem-parsing specs.

## Seams left for PR 3B

- `terminateStorageWorker(): void`: terminates/forgets the kept Worker; does not restart the client.
- `onStorageWorkerLost(listener): () => void`: error/messageerror subscription and unsubscribe.
- `reportStorageWorkerLost(databaseName | undefined, message)`: existing worker-lost degradation,
  including the pre-instance sentinel.
- Lazy `getWebNewStorage()` metadata/client: import and metadata reads allocate no Worker; first
  `createStorageInstance` constructs the shared `mode: 'one'` client.
- Existing database registry now offers `closeRegisteredDatabases()` for clear-before-termination.
