# PR 3A of monorepo#2242 — web storage engine: SQLite wasm worker, delivery, deletions

Read `INVESTIGATE-PR3-FINDINGS.md` first (your own investigation; its line numbers are current), then
`spikes/2138-rxdb-sqlite-wasm/RESULTS.md`, `sqlite-basics-oo1.mjs`, `sqlite-worker-entry.mjs`,
`packages/database/src/adapters/storage/storage-engines.ts` and
`packages/database/src/adapters/default/README.md`. The spec is issue #2242 (its Web section is quoted
below where it binds). PR 1 and PR 2 are merged under this branch.

**Do not push. Do not open or edit a PR.** Commit on this branch as you go (small commits, one
concern each, conventional prefixes, no co-author trailers). Do not run `git fetch`/`pull`/`rebase`.

This is half of PR 3. **Out of scope here (PR 3B, next run):** the one-live-tab protocol (Web Lock +
BroadcastChannel takeover), the parked-tab screen, the root-layout gate, worker-loss → parked
integration, and the two-page Playwright spec. Leave clear seams for them (named below) and nothing
else.

Stakes: **high** (persistent storage under money paths). Budget: about 450 added non-test lines
plus the deletions. If you find yourself past 1.5× that, stop and write `PR3A-STOP.md` saying why.

## What lands

### 1. `@sqlite.org/sqlite-wasm` dependency

Add `@sqlite.org/sqlite-wasm@3.53.4-build1` (the spike's exact build) to the ROOT `package.json`
devDependencies (it is a build input of the worker bundle, like esbuild) with `pnpm add -w -D`
(network is fine; the lockfile changes). Do not add it to `apps/main`'s dependencies: nothing in the
app bundle imports it; only the worker does, and the wasm binary is copied, not bundled.

### 2. The worker: `scripts/sqlite-worker-entry.mjs` → `apps/main/public/sqlite.worker.js` + `sqlite3.wasm`

- `scripts/sqlite-basics-oo1.mjs` — the spike adapter, production-grade: `getSQLiteBasicsOo1({ openDb, journalMode })`
  returning premium's `SQLiteBasics` (`open` sets `PRAGMA locking_mode = exclusive` first — WAL on
  the wasm build only takes with exclusive locking, sqlite.org/wal.html "Use of WAL Without
  Shared-Memory"; `all` → `db.exec({ sql, bind: boolParamsToInt(params), rowMode: 'object', returnValue: 'resultRows' })`;
  `run`; `setPragma` reads `journal_mode` back and THROWS when the effective mode differs from the
  requested one; `close`). No console logging. Also set `PRAGMA synchronous = NORMAL` after the
  journal mode (spec: WAL + synchronous NORMAL everywhere), with a comment citing #2144.
- `scripts/sqlite-worker-entry.mjs` — `exposeWorkerRxStorage` is called SYNCHRONOUSLY at module
  evaluation (spike finding 1: a top-level await loses the page's first request and the open hangs
  forever). Wasm init and the pool install are awaited lazily inside `openDb` on the first open:
  `sqlite3InitModule({ locateFile: () => wasmUrl })` then `installOpfsSAHPoolVfs({ name: SQLITE_POOL_NAME, initialCapacity: SQLITE_POOL_INITIAL_CAPACITY })`,
  `openDb = name => new poolUtil.OpfsSAHPoolDb('/' + name)`. `getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })`
  (a browser worker has no `Buffer`).
  - `wasmUrl`: `sqlite3.wasm` beside the worker's own URL — `new URL('sqlite3.wasm', self.location.href)`
    with the worker URL's query string copied onto it (`url.search = self.location.search`) so the
    plugin's `?ver=<hash>` cache-buster reaches the wasm too. Comment why.
  - Constants in one module `scripts/sqlite-worker-constants.mjs` (also imported by the page-side
    clear/measure code via the database package — put the constants where both can reach them; a
    small dependency-free module under `packages/database/src/adapters/storage/sqlite-pool.ts`
    exported from the package is fine, and the worker entry imports it): `SQLITE_POOL_NAME` (the
    `opfs-sahpool` VFS name AND the OPFS directory it owns — read the installed
    `@sqlite.org/sqlite-wasm` source to state exactly which directory name the pool creates for a
    given `name`/`directory` option and pin it in a comment), `SQLITE_POOL_INITIAL_CAPACITY` — sized
    from the number of SQLite files a store opens (count the RxDatabases the web app opens: user DB,
    store DB, every scope DB it can hold open, logs — read `packages/database/src/create-db.ts`,
    `database-names.ts` and the engine's scope creation; each database is one file plus its `-wal`
    in exclusive-locking WAL) plus headroom, with the arithmetic in the comment. Not an env var.
    No `directory`/`clearOnInit` options.
- `scripts/build-sqlite-worker.mjs` (replaces `build-opfs-worker.mjs`): esbuild, `format: 'esm'`
  (the page creates it with `{ type: 'module' }`), `platform: 'browser'`, bundle, minify, no legal
  comments, banner `/* WCPOS_SQLITE_WORKER */`; writes `apps/main/public/sqlite.worker.js` and copies
  `node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm` (find the real path) to
  `apps/main/public/sqlite3.wasm`. Both tracked (the OPFS bundle was tracked for the same reason:
  the export copies `public/` as-is, no build step). Root script `build:sqlite-worker`; delete
  `build:opfs-worker`. The bundle MUST inline the patched premium so it carries
  `globalThis.WCPOS_SQLITE_QUERY_TRANSLATION_PATCH=1` — check with `grep -o … | wc -l` (one minified
  line; never `grep -c`).
- `scripts/sqlite-worker.test.mjs` (node --test, `test:scripts` lane): (a) the shipped
  `sqlite.worker.js` contains the translation-patch marker exactly once and the banner; (b) the
  shipped `sqlite3.wasm` starts with the `\0asm` magic and its sha256 equals the installed package's
  file (so a premium/sqlite bump that forgets the rebuild goes red); (c) `getSQLiteBasicsOo1` under
  Node against `sqlite3InitModule()` + `new sqlite3.oo1.DB(...)`: proves `setPragma('journal_mode','WAL')`
  reads back `wal` (a `:memory:` database cannot do WAL — use a temp-file `oo1.DB` if the Node build
  opens one; the spike's Node conformance run did), throws on a refused mode, and that
  `boolParamsToInt` binding works for a boolean param. If the Node wasm build cannot open a file DB,
  say so in the test's skip reason and rely on item 8.

### 3. Page side: `packages/database/src/adapters/storage/index.web.ts`

- `getWebNewStorage()` → `getRxStorageWorker({ workerInput: createStorageWorker, workerOptions: { type: 'module', name: STORAGE_WORKER_NAME }, mode: 'one' })`.
  `mode: 'one'` is required (spike finding 2: the default `storage` mode leaks the pool's OPFS access
  handles into a second worker → `NoModificationAllowedError`). Our code constructs the `Worker`
  (`workerInput` factory), keeps the reference in module scope, and subscribes `error` and
  `messageerror`.
- **Lazy: a tab that never opens a database constructs no Worker.** Premium `mode: 'one'` calls the
  factory at storage construction, and today `index.web.ts` builds the storage at module
  evaluation. Wrap it: export a storage whose `createStorageInstance` (and the other RxStorage
  members) construct the inner worker storage on first use. Pin with a test: importing the web
  adapter module constructs no `Worker`; the first `createStorageInstance` constructs exactly one;
  the second reuses it.
- Export a small explicit seam for PR 3B and for the watchdog, in the storage module (not the
  error-handler wrapper): `terminateStorageWorker(): void` (terminates the kept Worker and forgets
  it), and `onStorageWorkerLost(listener: (message: string) => void): () => void` — fired from the
  Worker `error`/`messageerror` listeners with a message. Then in
  `wrapped-error-handler-storage.ts` route a fired listener into the existing `worker-lost`
  degradation (the private `latchDegradedStorage` — expose ONE narrow function
  `reportStorageWorkerLost(databaseName | undefined, message)` that latches `worker-lost` for every
  registered instance, or for a sentinel name when none exists yet, and emits `degradedStorage$`)
  and make the existing watchdog condemnation call `terminateStorageWorker()` on web (inject it as
  an optional `onCondemn` so the wrapper stays platform-neutral and the web adapter passes it).
  Spike/wiki fact to state in a comment: `terminate()` fires no `error` event, so the watchdog stays
  the only detector for a silently dead worker; the event listeners catch script-load failures and
  crashes that DO report.
- `getWebStorageWorkerPaths()` and the basename refusal stay as they are (engine path
  `/sqlite.worker.js`, `globalThis.opfsWorker` keeps its name — the pool VFS IS OPFS, and the plugin
  injects that variable). Retarget `index.web.test.ts`.
- `apps/main/app/+html.tsx` and `apps/main/public/index.html`: `window.opfsWorker = "/sqlite.worker.js"`.
  `apps/main/lib/storage-worker-bootstrap.test.ts` must pass unchanged in spirit.

### 4. The pair-pin flip and the engine-scope flag

- `storage-engines.ts`: `WEB_STORAGE_ENGINE = 'sqlite-sahpool'`. Rewrite the doc comments so
  `opfs-filesystem` reads as the previous era.
- `adapters/default/index.web.ts`: `multiInstance: false`, comment rewritten (the ruling text about
  #1049 stays as history; `false` is now what the engine requires). Remove the repair-ownership
  plugin registration.
- `apps/main/lib/create-app-engine.ts:600`: engine-scope databases on web must take
  `REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]` (false), never `webLocksAvailable`.
  Delete `apps/main/lib/web-write-leader.ts` + its test and the host's web write-lease / outcome
  channel plumbing (`wcpos-write-leader:*`, `wcpos-write-outcomes:*` opening on web,
  `engine.write-leader.degraded`), and retarget `create-app-engine.test.ts` (findings §9 lists the
  five cases). The sync-engine's generic `writePlaneOwner` / `writeOutcomeBridge` ports and their
  tests STAY (host passes nothing → owner defaults to `() => true`); do not touch
  `packages/sync-engine`.
- `multi-instance-ruling.test.ts` must pass with the flip and still assert the two eras disagree.

### 5. Deletions (web-only; everything native still needs STAYS — findings §2/§4)

Delete: `scripts/opfs-worker-entry.mjs`, `scripts/build-opfs-worker.mjs`, `scripts/patch-opfs-worker.mjs`
+ `.test.mjs`, `apps/main/public/opfs.worker.js`, `packages/database/src/plugins/repair-ownership.ts`
+ `.test.ts`, `scripts/opfs-repair-ownership.mjs` + `.test.mjs`, `apps/main/lib/web-write-leader.ts`
+ `.test.ts`, `apps/main/e2e/two-tab-changelog-identity.spec.ts` (its scenario cannot exist with one
live tab; PR 3B adds the replacement spec).
KEEP: all eight `scripts/patch-rxdb-premium-*.mjs`, `scripts/opfs-targeted-recovery*.mjs`,
`scripts/opfs-recovery-database-sync.test.mjs`, `packages/database/src/plugins/opfs-targeted-recovery.*`,
`packages/query/src/logs-storage-recovery.ts`, the ledger recovery, the ESLint mirror ignores.
Fix `packages/eslint/index.js` so the new browser worker files (`sqlite-worker-entry.mjs`,
`sqlite-basics-oo1.mjs`) are NOT under the Node-globals override. Update `scripts/ci-plan.mjs` +
its test fixtures to the new script names. Update `apps/web/tests/sync-build-artifacts.test.js` to
the new artifacts if it references the old worker (the submodule is a separate repo: edit only if
the change stays inside the superproject; otherwise leave it and list it in `PR3A-NOTES.md`).

### 6. Clear data, measure, purge on web

- `clear-all-db.web.ts`: after closing the databases, call `terminateStorageWorker()` (releases the
  pool's sync access handles), then remove the pool's OPFS directory (`SQLITE_POOL_NAME`-derived
  name) recursively, in addition to the legacy `rxdb-*` entries it already removes. Test with the
  existing fake `navigator.storage.getDirectory()` shape.
- `measure-storage.web.ts`: enumerate the pool directory as ONE root `{ root: 'sqlite', bytes }`
  (per-collection attribution is a follow-up — the pool's file names are opaque). Keep `rxdb-*`
  enumeration for legacy bytes and mark them `legacy: true` (mirror what PR 2 did for Electron in
  `measure-storage.electron.ts`). Adjust `storage-footprint-logic.ts` only if it would otherwise
  misreport the pool root as unknown bytes; if it does, make the `sqlite` root land in the same
  bucket Electron's does.
- `purge-legacy-db.web.ts`: must never touch the pool directory. Add a test: a directory listing
  containing the pool directory plus `rxdb-…_v6…` entries deletes only the v6 entries.

### 7. `apps/main/e2e/opfs-helpers.ts` and global-setup

The suite snapshots/restores OPFS to skip login (findings §3, global-setup :357–367). Read
`opfs-helpers.ts` and make snapshot/restore handle the pool directory (recursive directory copy of
the pool root is enough — the files are opaque). The two specs that parse the old filesystem
layout (`session-recovery.live.spec.ts`, `ghost-prune.live.spec.ts`) get `test.skip` with a reason
naming #2242 and "SQLite pool: needs a worker-side query, PR 5"; do not rewrite them.

### 8. Probe (kept as a release-gate script, spec user story 33)

`scripts/sqlite-worker-probe.mjs`: like the spike's `page-probe.mjs` — serves `apps/main/public`
statically, opens headless Chromium (Playwright is installed in the repo), creates
`getRxStorageWorker` against `/sqlite.worker.js` via a tiny page bundle (built with esbuild into a
temp dir), opens one storage instance, does a `bulkWrite` + `findDocumentsById`, closes, then
reopens and reads the row back (persistence through the pool). The journal-mode assertion lives
inside `setPragma` (it throws, so a refused WAL fails the open). Exit non-zero on any failure,
including a worker `error` event. Run it once and paste its output into `PR3A-NOTES.md`.

### 9. Docs

`packages/database/src/adapters/default/README.md` Decision section: the web era is now
`sqlite-sahpool`; describe the worker lifecycle (lazy construction, `mode: 'one'`, terminate on
condemn) in a paragraph. No wiki edits (I do those).

## Tests to run (one suite at a time, `--maxWorkers=2`, from the worktree root)

`pnpm --filter @wcpos/database test -- --maxWorkers=2`, `pnpm --filter @wcpos/core test -- --maxWorkers=2`
(only if you touched core), `pnpm --filter main test -- --maxWorkers=2` (apps/main jest),
`node --test scripts/*.test.mjs` (the `test:scripts` lane — run the exact root script),
`pnpm typecheck --force`, `pnpm lint` on changed files. Record every command and result in
`PR3A-NOTES.md` with the counts. Mutation check: temporarily set `mode: 'storage'` and show which
test goes red (or state that none does and why that is acceptable).

## Rules

- No env vars for the pool name, capacity, pragmas. Named constants with the reason.
- No `better-sqlite3`, no IndexedDB fallback, no SharedWorker, no in-tab worker restart, no retry
  on WebKit.
- Do not touch `packages/sync-engine`, `packages/sync-core`, `packages/query` engine code, or any
  schema.
- Keep every existing test that findings §4/§9 mark STAY green without weakening it.
- Comment density: match the surrounding files (they explain WHY, with issue numbers).
- Finish with `PR3A-NOTES.md`: what changed (by file), the test log, anything you could not do,
  and the seams left for PR 3B (`terminateStorageWorker`, `onStorageWorkerLost`,
  `reportStorageWorkerLost`, the lazy storage).
