# Spike 2138 — does rxdb-premium's SQLite storage run on the official SQLite wasm build?

Feasibility build. Nothing here ships. The output is a **verdict with evidence**, recorded in
`RESULTS.md` in this directory, plus the small adapter that produced it.

## The question

Can `getRxStorageSQLite` from `rxdb-premium` (17.4.0, already installed in this repo's
`node_modules`) run on `@sqlite.org/sqlite-wasm` (latest, `3.53.4-build1`) and pass RxDB's own
storage conformance suite —

1. **in Node** (adapter correctness, quick loop), and
2. **in Chrome, inside a dedicated worker, on the `opfs-sahpool` VFS** (the real target topology)?

Either run may fail. A failing run with a precise, reproducible reason is a valid result. Do not
work around a failure by skipping tests, loosening assertions, or editing the suite; record it.

## What already exists (read these first)

- `rxdb-premium`'s adapter contract: `node_modules/rxdb-premium/dist/types/plugins/storage-sqlite/sqlite-types.d.ts`
  (`SQLiteBasics<T>`: `open`, `all`, `run`, `setPragma`, `close`, `journalMode`).
- Reference adapters for other bindings: `node_modules/rxdb/dist/esm/plugins/storage-sqlite/sqlite-basics-helpers.js`.
  `getSQLiteBasicsWasm` there calls `sqlite3.execWithParams` / `sqlite3.run`, which the official
  build does not have — that is why this spike writes its own. `boolParamsToInt` is exported from
  `rxdb-premium/plugins/storage-sqlite` (re-exported from rxdb). Rows must come back as objects
  (`{ id, data, ... }`), the way the node adapters return them.
- The conformance suite: a shallow clone of rxdb at tag `17.4.0` is already in `.rxdb-src/`
  (gitignored). Its documented hook is `test/unit/custom-storage.ts` exporting `CUSTOM_STORAGE`
  (type `RxTestStorage`, see `src/types/util.d.ts`; optional async `init()`, `name`, `getStorage`,
  `getPerformanceStorage`, `hasPersistence`, `hasMultiInstance`, `hasAttachments`, `hasReplication`).
  Look at the `sqlite-trial` case in `test/unit/config.ts` for the shape. The runs are
  `npm run test:node:custom` and `npm run test:browser:custom` (karma, Chrome). Mocha runs with
  `bail: true`, so the first failure stops the run — report it and, if it is cheap, note whether
  the rest passes when that one test is greppped out with `MOCHA_GREP` (browser) or `--grep`.
- Karma serves `/files/*` from `.rxdb-src/test/static/files/` via the static server in
  `test/helper/test-servers.ts`. That is where the worker bundle and `sqlite3.wasm` go for the
  browser run.
- How this repo bundles a storage worker: `scripts/build-opfs-worker.mjs` (esbuild, ESM, single
  file) and `scripts/opfs-worker-entry.mjs` (`exposeWorkerRxStorage({ storage })`). Copy that
  pattern; do not modify those files.
- The worker plugin: `rxdb-premium/plugins/storage-worker` — `getRxStorageWorker({ workerInput, ... })`
  on the page side, `exposeWorkerRxStorage({ storage })` inside the worker
  (`node_modules/rxdb-premium/dist/types/plugins/storage-worker/`).
- `@sqlite.org/sqlite-wasm` package layout: `dist/index.mjs` (browser), `dist/node.mjs` (Node,
  selected by the `node` export condition), `dist/sqlite3.wasm`. The pool VFS is
  `sqlite3.installOpfsSAHPoolVfs({ name, initialCapacity })` → `poolUtil.OpfsSAHPoolDb`. Sync
  access handles exist only in a dedicated worker.

## Design (fixed — implement this, do not redesign it)

All new files live in `spikes/2138-rxdb-sqlite-wasm/`. Nothing else in the repo changes.

1. **`sqlite-basics-oo1.mjs`** — one factory, `getSQLiteBasicsOo1({ openDb })`, returning a
   `SQLiteBasics` over the `oo1.DB` API:
   - `open(name)` → `openDb(name)`
   - `all(db, q)` → `db.exec({ sql: q.query, bind: boolParamsToInt(q.params), rowMode: 'object', returnValue: 'resultRows' })`
   - `run(db, q)` → `db.exec({ sql: q.query, bind: boolParamsToInt(q.params) })`
   - `setPragma(db, key, value)` → `db.exec('PRAGMA ' + key + ' = ' + value)`
   - `close(db)` → `db.close()`
   - `journalMode` taken from the factory argument (see 4).
   `oo1.DB` is synchronous, so no serialising queue is needed — the queue in rxdb's
   `getSQLiteBasicsWasm` was a wa-sqlite workaround. Wrap in `async` only to satisfy the
   Promise-returning contract.
2. **`sqlite-worker-entry.mjs`** — dedicated-worker entry: `sqlite3InitModule()`,
   `installOpfsSAHPoolVfs({ name: 'spike-2138', initialCapacity: 64 })`, then
   `exposeWorkerRxStorage({ storage: getRxStorageSQLite({ sqliteBasics }) })` where `openDb` is
   `name => new poolUtil.OpfsSAHPoolDb('/' + name)`. Before returning the db from `open`, run
   `PRAGMA locking_mode = exclusive` (the WAL-on-this-VFS requirement). `initialCapacity` is a
   named constant with a comment.
3. **`custom-storage.ts`** — the file copied over `.rxdb-src/test/unit/custom-storage.ts`.
   Branches on `isNode` from `../../plugins/test-utils/index.mjs`:
   - Node: `init()` imports `@sqlite.org/sqlite-wasm` (the Node build), opens with
     `new sqlite3.oo1.DB(name)`, wraps in `wrappedValidateAjvStorage` like the other configs.
   - Browser: `getRxStorageWorker({ workerInput: '/files/spike-2138/sqlite-worker.js', workerOptions: { type: 'module' } })`
     (adjust the option names to the real `RxStorageWorkerSettings` type).
   `hasPersistence: true`, `hasMultiInstance: true`, `hasAttachments: true`, `hasReplication: true`.
   If a flag turns out to be false for a documented reason, set it and say why in RESULTS.md.
   Keep the Node import out of the webpack browser bundle (a guarded dynamic import with
   `/* webpackIgnore: true */` is fine).
4. **Journal mode.** First attempt: `journalMode: 'WAL'`. After open, read back `PRAGMA journal_mode`
   and log it. If the pool VFS does not honour WAL, or WAL fails the suite, rerun with
   `journalMode: ''` and record both outcomes. Do not use `WAL2`.
5. **`run-conformance.sh`** — idempotent runner, no arguments:
   - in `.rxdb-src`: `npm ci` if `node_modules` is missing; `npm i --no-save @sqlite.org/sqlite-wasm@3.53.4-build1 esbuild`;
     `npm run build` if `dist/esm` is missing.
   - make `rxdb-premium` resolvable from the clone **against the clone's own rxdb**, so there is
     exactly one rxdb and one rxjs in the process: `ln -s .. .rxdb-src/node_modules/rxdb` (self-link)
     and copy (`cp -RL`, resolving pnpm symlinks) this repo's `node_modules/rxdb-premium` into
     `.rxdb-src/node_modules/rxdb-premium`. If the self-link does not resolve the package's
     `exports`, say so and fall back to symlinking this repo's `node_modules/rxdb` — and record
     that two rxdb copies were in play.
   - copy `custom-storage.ts` into place; bundle the worker with esbuild into
     `.rxdb-src/test/static/files/spike-2138/sqlite-worker.js` and put `sqlite3.wasm` beside it.
   - run the Node suite, then the browser suite, each to its own `.log` file in this directory,
     capturing exit codes with `$?` directly (never through a pipe).
6. **`RESULTS.md`** — the verdict. Sections: *Node run* (exit code, tests passed/failed, first
   failure verbatim if any), *Browser run* (same, plus the `journal_mode` actually in effect and
   the Chrome version), *Workarounds* (every deviation from the design above, with the reason),
   *Adapter* (the final `sqlite-basics-oo1.mjs` inlined). Numbers come from the log files, not
   from memory.

## Stakes

Throwaway spike on a branch; no merchant data, no release. The only thing that can go wrong is a
**wrong verdict** — a pass that was really a skip, or a fail that was really a setup mistake. So:
accuracy of RESULTS.md over code polish. Treat performance, concurrency and error-message quality
as out of scope. A setup failure (npm ci, Chrome not found, karma port clash) is a blocker to
report, not a defect to engineer around.

## Out of scope — do not add

- Any change outside `spikes/2138-rxdb-sqlite-wasm/` (no edits to `packages/database`, `scripts/`,
  `package.json`, `pnpm-lock.yaml`, or to rxdb-premium's dist).
- wa-sqlite, the `opfs` async-proxy VFS, IndexedDB VFSs, FTS5, benchmarks, timing, crash or
  kill testing, migration code, feature flags, environment variables (use named constants), retry
  or queue layers, a SharedWorker, a leader-election layer, TypeScript typings for the adapter.
- Editing any test in `.rxdb-src/test/` other than replacing `custom-storage.ts`.

## Budget and stop rule

Non-test, non-doc code (adapter + worker entry + custom-storage + runner): **≤ 250 added lines**.
Total diff excluding `.rxdb-src/`, logs and RESULTS.md: **≤ 350 lines**. If you are about to
exceed either, STOP and report why instead of continuing. Splitting into more files does not raise
the budget. If a suite run exceeds 40 minutes, stop it, report where it was, and move on.

## Machine constraints

24 GB Mac. Run **one** suite at a time — never Node and browser concurrently, no parallel mocha.
There is no `timeout` binary on this machine. Chrome is installed. The pnpm store is offline-only;
`npm` inside `.rxdb-src` has network access.
