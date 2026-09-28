# Spike 2210 — premium SQLite on `node:sqlite` vs the shipped filesystem-node engine, in plain Node

Read this file, then carry out the task it describes. Ticket: wcpos/monorepo#2210 (wayfinder map
#2137, "Storage engine for 2.0"). Everything you need is in this repo. Do not modify anything outside
`spikes/2210-desktop-engine/` and `.github/workflows/spike-2210-desktop-engine.yml`.

Prior accepted artefacts to copy the shape of (read them first; do not import from them — each spike
stays independently runnable):

- `spikes/2138-rxdb-sqlite-wasm/` — the rxdb conformance runner (`run-conformance.sh`,
  `custom-storage.ts`, `node-conformance-summary.log`).
- `spikes/2143-storage-benchmark/` — the workload: `bench-entry.mjs` (schemas, fixtures, cells,
  sampling, the SHA-256 cross-engine check), `worker-sqlite.mjs` (the `predicate()` translator and the
  `query`/`count` wrapper), `report.mjs`, `run.sh`, `RESULTS.md`, and the Windows workflow
  `.github/workflows/spike-2143-benchmark.yml`.
- `spikes/2144-crash-harness/` — the stop harness: outcome scoring (`open-failed`, `integrity-failed`,
  `lost`, `partial`, `ok`), the transaction stream (`workload.mjs`), `report.mjs`, `RESULTS.md`.

## The question

Desktop's engine is decided (#2149): premium `storage-sqlite` on `node:sqlite` in the Electron main
process, `better-sqlite3` as the fallback only if the binding fails verification. This spike is the
evidence that ruling rests on, and it blocks the migration ticket (#2150), not the decision. Three
legs, one `RESULTS.md`. The harness decides nothing; the operator writes the answer paragraphs.

Everything runs in **plain Node**: no browser, no Electron window, no IPC, no worker. Both engines are
called in-process on their storage-instance methods, so the timing they share is the direct call.

## The two engines (rows)

| Row | Construction | Notes |
|---|---|---|
| `filesystem-node` (incumbent, control) | `getRxStorageAbstractFilesystem({ name: 'filesystem-node', abstractFilesystem: new NodeFilesystem(basePath), abstractLock: createStorageLock(), inWorker: false })` from `rxdb-premium/plugins/storage-abstract-filesystem` and `rxdb-premium/plugins/storage-filesystem-node` | Exactly how wcpos/electron's `src/main/rxdb-storage.ts` builds the storage the desktop app ships today. `createStorageLock()` is the task-queue lock from wcpos/electron's `src/main/storage-lock.ts`; its JS is reproduced below — copy it into `storage-lock.mjs` verbatim. The premium in this repo's `node_modules` is patched by `scripts/patch-rxdb-premium-*.mjs` at install (the Electron app mirrors the same patches); use it as installed and record the marker count in RESULTS (`grep -c __wcpos` on `storage-abstract-filesystem/index.js`). No `withTargetedOpfsRecovery` wrapper: the control is the raw engine. |
| `sqlite-node` (candidate) | `getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })` from `rxdb-premium/plugins/storage-sqlite`, where `sqliteBasics` is **premium's own shipped** `getSQLiteBasicsNodeNative(DatabaseSync)` (exported from the same plugin; `DatabaseSync` from `node:sqlite`), with its `open` wrapped so that right after `new DatabaseSync(path)` it runs `PRAGMA synchronous = NORMAL` (the durability the map settled on: process-kill safe, not power-loss paranoid). `journalMode` stays `'WAL'` as premium ships it. After the seed, run `ANALYZE` once (2143's `findDocumentsById` finding). Wrap each instance's `query()` and `count()` exactly as `spikes/2143-storage-benchmark/worker-sqlite.mjs` does — one translated statement through `sqliteBasics.all()` when `predicate()` can translate the selector, premium otherwise — and say so in RESULTS. |

The one adapter file is `sqlite-basics-node-native.mjs`: import premium's factory, pass
`DatabaseSync`, wrap `open`. Do **not** write a fresh `SQLiteBasics` from scratch; the point is that
the shipped wrapper works.

**WAL proof.** After creating the first `sqlite-node` storage instance in each leg, open the database
file a second time with a plain `new DatabaseSync(path, { readOnly: true })`, read `PRAGMA
journal_mode`, and fail the run loudly if it is not `wal`. Record it.

`storage-lock.mjs` (from wcpos/electron `src/main/storage-lock.ts`, types stripped — the comment is
part of the copy):

```js
/**
 * The task-queue lock for the main process's filesystem-node storage.
 * rxdb-premium's filesystem-node plugin hands its TaskQueue the `web-locks` package as the lock, and
 * that package resolves `request()` whatever the callback did; this lock settles `request()` with
 * the callback's outcome, like `navigator.locks`. Exclusive per name, callbacks in arrival order.
 * Cross-process exclusion is not needed — the storage bridge is the one holder of these files.
 */
export function createStorageLock() {
  const tails = new Map();
  return {
    request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      if (!callback) return Promise.reject(new TypeError('storage lock: no callback'));
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(() => callback({ name, mode: 'exclusive' }));
      const settled = run.then(() => undefined, () => undefined);
      tails.set(name, settled);
      void settled.then(() => { if (tails.get(name) === settled) tails.delete(name); });
      return run;
    },
  };
}
```

Every storage instance is created with `multiInstance: false` and a fresh `databaseName` per engine
per run; data directories live under `spikes/2210-desktop-engine/.data/<leg>/<row>/<run>/`
(gitignored), one directory per row so the two engines never share files.

## Leg 1 — conformance on the Node inside Electron 43.4.0 (`conformance/`)

Copy `spikes/2138-rxdb-sqlite-wasm/run-conformance.sh`'s shape into
`spikes/2210-desktop-engine/conformance/run-conformance.sh`: shallow-clone rxdb at tag `17.4.0` into
`conformance/.rxdb-src` if missing, `npm install`, `npm run build` if `dist/esm` is missing, self-link
`node_modules/rxdb`, `cp -RL` this repo's `node_modules/rxdb-premium` into the clone (the patched
one; one rxdb, one rxjs), copy `conformance/custom-storage.ts` over `test/unit/custom-storage.ts`.
Nothing wasm, no esbuild, no browser suite — Node only.

`custom-storage.ts`: `name: 'sqlite-node-native'`; in `init()` (Node only — throw if `!isNode`)
`await import('node:sqlite')`, build `getSQLiteBasicsNodeNative(DatabaseSync)` with the same
`synchronous = NORMAL` open wrapper, `getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })`,
`wrappedValidateAjvStorage` as 2138 does; flags `hasPersistence`, `hasMultiInstance`, `hasAttachments`,
`hasReplication` all `true` (2138 passed 1416/1416 with them). **`init()` must print one line
`spike-2210 runtime: electron=<process.versions.electron> node=<process.versions.node> sqlite=<sqlite_version()> journal_mode=<pragma>`**
— the summary greps it, and a run whose log lacks `electron=43.4.0` does not count as leg 1.

**Run the suite on Electron's Node, not the Mac's.** `spikes/2210-desktop-engine/.deps/` holds
`electron@43.4.0` (`.deps/package.json` exists so npm installs *there* and not in the repo root —
never run npm in a directory without one; install with `npm install --no-save --no-package-lock
electron@43.4.0` in `.deps/` only if `.deps/node_modules/electron/dist` is missing; the postinstall
downloads the binary and needs network, which `npm` has). The executable path is `require('.deps/node_modules/electron')` when
evaluated by Node (it is a string). With `ELECTRON_RUN_AS_NODE=1` that binary is Node 24.18.1. Read
the clone's `test:node:custom` script from its `package.json` and run the same mocha invocation with
that binary as the node executable (`ELECTRON_RUN_AS_NODE=1 <electron> node_modules/.bin/mocha …`,
same env such as `DEFAULT_STORAGE=custom`; `npm run` would put the Mac's node first on PATH, so do
not go through `npm run`). Write `conformance/node.log` (gitignored) and a tracked
`conformance/node-conformance-summary.log` like 2138's: the runtime line, the per-file list, the
conformance block tick count, the `passing`/`failing`/`pending` lines and the exit code, captured with
`$?` directly, never through a pipe. `MOCHA_GREP` narrows as in 2138. Leave `NODE_OPTIONS=--max-old-space-size=2048`.
Mocha runs with `bail: true`; report the first failure verbatim if there is one and do not edit any
test.

Leg 1 runs on the Mac only. A failure here selects `better-sqlite3`; RESULTS must say so.

## Leg 2 — process stop, scored like 2144 (`crash-node.mjs`, `crash-child.mjs`)

`crash-child.mjs --row <row> --dir <dir> --db <name>`: opens one storage instance (schema
`{ id (primary, 64), tx (number), payload (object) }`, index `['tx']`), seeds 2,000 rows untimed in
two `bulkWrite`s of 1,000, sends `{ type: 'seeded' }` on the IPC channel, then streams transactions
forever in 2144's fixed pattern of sizes `1, 1, 3, 1, 50, 1, 1, 1000` repeating, ~2,000 JSON bytes per
row (2143's product fixture shape, seeded PRNG), 20% of rows in each transaction updating an existing
id (`previous` supplied) and the rest inserting. Each transaction is one `bulkWrite`. Before the call
it sends `{ type: 'started', tx, n, ids }`; when the call resolves with no `error` entries it sends
`{ type: 'acked', tx }`. The child never writes a ledger file and never reads the database after a
stop; the parent's record of what it received is the acked set.

`crash-node.mjs --trials N --out crash.<platform>.json [--rows a,b]`: for each row and trial, a fresh
directory and database name; spawn the child with `stdio: ['ignore','pipe','pipe','ipc']`; after
`seeded`, wait a uniformly random 0–3,000 ms, then end the child with `child.kill('SIGKILL')` (on
Windows that is `TerminateProcess`, which is what we want); then **score in a fresh child**
(`crash-child.mjs --score --row … --dir … --db …`, printing JSON) so that the scorer's process holds
no state from the writer. Scoring order, first failure wins, as 2144:

| Outcome | `sqlite-node` | `filesystem-node` |
|---|---|---|
| `open-failed` | `createStorageInstance` rejects or the first `query` rejects, after retrying every 50 ms for 10 s | same |
| `integrity-failed` | `PRAGMA integrity_check` on a plain `DatabaseSync` open of the file is not exactly one row `ok` | the engine logs a recovery, salvage or parse failure on open (capture `console.*` and the storage's error stream during open and the first query) |
| `lost` | an acked `tx` has fewer than its `n` rows present with `tx` = that value, counting ownership the 2144 way (a later transaction that updated an id owns it; replay expected ownership from the parent's `started` records, with the in-flight transaction wholly present or wholly absent) | same |
| `partial` | rows exist whose `tx` is neither acked nor in-flight, or the in-flight transaction is partly present | same |
| `ok` | everything above passed; record whether the in-flight transaction is present or absent | same |

Record per trial: row, stop offset ms, acked count, in-flight `tx` and its size, outcome, in-flight
presence, reopen-to-first-read ms, integrity result string. `--trials 30` on the Mac. Save after
every trial (a launch failure marks the run incomplete, not a storage verdict). Both rows use the
same stream and the same seed.

Bar (ticket): `sqlite-node` loses nothing acked in any trial on either platform. The control's
losses, if any, are the expected shape (rxdb-premium-issues#28).

## Leg 3 — speed, the 2143 query set in plain Node (`bench-node.mjs`)

Port `spikes/2143-storage-benchmark/bench-entry.mjs` to Node: the same three schemas with the same
declared indexes, the same `fixtures(n)` generator (seed 2143 — the fixtures must be byte-identical to
2143's so the numbers are comparable), the same cells 1–11, the same sampling (one discarded warm-up;
N = 7; N = 25 for `order-line-add` and `order-create`; N = 3 for `seed-products` and cold open), the
same two scales (`small` 2,000 / `large` 20,000), `normalizeMangoQuery` + `prepareQuery` as 2143,
and the same **cross-engine equality check** (SHA-256 of canonical, `_rev`-independent content; a
mismatch fails the run loudly — use `node:crypto`). Timing is `performance.now()` around the direct
storage-instance call. Rows in a fixed order, all cells for one row before the next, every instance
closed between rows.

Changes from 2143:

- `cold-open-first-read` — after the large seed, close everything and **spawn a fresh Node process**
  (`bench-node.mjs --cold-open --row … --dir … --db …`, printing the number) that times storage
  creation + `createStorageInstance` for products + the first `findDocumentsById([one id])`. N = 3
  per row. The OS page cache is warm either way; say so.
- `storage-estimate` becomes `disk-bytes`: the byte total of the row's data directory after the large
  seed (walk it with `node:fs`), plus the file count.
- Add **`products-catalogue-projection`**: the read the migration's condition (ii) would issue instead
  of the whole-document blob. `sqlite-node`: one statement through `sqliteBasics.all()` —
  `SELECT id, JSON_EXTRACT(data,'$.payload.name') AS name, JSON_EXTRACT(data,'$.payload.sku') AS sku,
  JSON_EXTRACT(data,'$.payload.global_unique_id') AS gid FROM "<products table>" WHERE deleted = 0`
  (read the table name and column set from premium's `sqlite-storage-instance.js`). `filesystem-node`
  has no projection path, so its column is the whole-document `query` followed by a JS map to the same
  four fields — what a projection would cost on that engine. Verify the two results are equal (same
  canonical check). Label the cell in the report as "projection (condition ii)".
- No worker bundle bytes; report `node:sqlite`'s `sqlite_version()` and `process.versions.node`
  instead.

`--scale small|large|both` (default both), `--out <file>` (`results.<platform>.json`, `mac` or
`windows`), `--rows` to restrict. Environment block as 2143's (`os`, `cpu`, `node`, `sqlite`,
`rxdb`, `rxdb-premium`, `measuredAt`, premium patch marker count).

## Windows run (GitHub Actions)

`.github/workflows/spike-2210-desktop-engine.yml`, copied from `spike-2143-benchmark.yml` (keep its
comment about the temporary `push:` trigger for a branch): `bundle` on `ubuntu-latest` (checkout,
`./.github/actions/setup-monorepo` with the same two secrets, `bash spikes/2210-desktop-engine/run.sh
--build-only`, upload `.build/` as `spike-2210-bundles`), then `bench-windows` on `windows-latest`,
`needs: bundle`, timeout 120 min: download the artifact, `actions/setup-node` **Node 24** (that is
where `node:sqlite` is built in; do not add `--experimental-sqlite`), then
`node .build/bench-node.js --out results.windows.json --scale both` and
`node .build/crash-node.js --trials 30 --out crash.windows.json`, upload both as
`spike-2210-results-windows`. Nothing else is installed on the runner, so the bundles must carry
rxdb and rxdb-premium.

## Build (`run.sh`)

`run.sh [--build-only] [--legs 2,3] [--trials N] [--scale …]`. Build: this repo's root
`node_modules/.bin/esbuild`, `--bundle --format=esm --platform=node --target=node24`, entry points
`bench-node.mjs`, `crash-node.mjs`, `crash-child.mjs` → `.build/*.js` (Node built-ins including
`node:sqlite` stay external; `rxdb` and `rxdb-premium` are inlined from the root `node_modules`;
the crash driver must spawn the bundled child by a path relative to its own file so the bundle is
self-contained). Write `.build/versions.json`. Assert each bundle is > 10,000 bytes. If esbuild
cannot bundle premium for Node cleanly (a `require` of an ESM-only dependency, say), record the
exact error in RESULTS and fall back to running the `.mjs` sources unbundled on the Mac; the Windows
job then needs `pnpm install` on the runner (say so in the workflow) — but try the bundle first.

Then (unless `--build-only`) run leg 3 then leg 2 on the Mac from the bundles, then `report.mjs`.
Leg 1 has its own runner and is run separately by the operator.

`.gitignore`: `.deps/`, `.build/`, `.data/`, `conformance/.rxdb-src/`, `conformance/node.log`.

## Report (`report.mjs`)

Merge every `results.*.json` and `crash.*.json` present into `RESULTS.md` between
`<!-- generated:start -->` and `<!-- generated:end -->`: per platform, one table per scale (rows =
cells, columns = the two engines, `p50 / p95` ms, plus a **ratio column** `filesystem-node ÷
sqlite-node` at p50, since the ratio is what the ticket asks for), the `disk-bytes` and cold-open
lines, then the crash table (row × trials × each outcome count × in-flight present/absent × median
reopen ms), then a **cross-platform summary**: per cell, the winner on each platform with a
`straddles` flag when Mac and Windows disagree (Windows decides — map ruling 2026-09-18). Inline the
`conformance/node-conformance-summary.log` content under a "Leg 1" heading if the file exists. Must
succeed on an empty results set.

## Execution split

Your sandbox runs Node, so, unlike 2143 and 2144, you can smoke-run here. Do exactly this and no
more:

1. Write every file: `sqlite-basics-node-native.mjs`, `storage-lock.mjs`, `engines.mjs` (both rows
   behind one `openEngine(row, dir, name)`), `bench-node.mjs`, `crash-child.mjs`, `crash-node.mjs`,
   `report.mjs`, `run.sh`, `conformance/run-conformance.sh`, `conformance/custom-storage.ts`,
   `.gitignore`, the workflow, and `RESULTS.md` with environment lines as placeholders, the generated
   section marked "filled by `node report.mjs`", and the four answer paragraphs left as TODO for the
   operator.
2. `bash spikes/2210-desktop-engine/run.sh --build-only`; print the bundle sizes.
3. `node --check` on every `.mjs`; `node report.mjs` on an empty results set.
4. Smoke leg 3 at `--scale small` for both rows into `results.smoke.json` (delete the file afterwards;
   the smoke is proof the harness runs, not a measurement) — the WAL proof line and the equality
   checks must pass.
5. Smoke leg 2 with `--trials 3` for both rows into `crash.smoke.json` (delete afterwards) and print
   the three outcomes per row.
6. Do NOT run leg 1's suite or the full legs; list exactly what the operator must run and what each
   command writes. The operator runs leg 1 (40 min ceiling per 2138), the full Mac legs, and
   dispatches Windows.

## Constraints

- Stakes: a throwaway measurement harness under `spikes/`; nothing ships. A wrong number or a wrong
  verdict is the only real failure, so: the cross-engine equality checks and the WAL proof are not
  optional; a stop trial that cannot be scored is `open-failed`, never skipped; the acked set is the
  parent's IPC record, never reconstructed from the database; leg 1 counts only with the
  `electron=43.4.0` runtime line in its log.
- Do not add: retries beyond the two stated (open 10 s), feature flags, env-var knobs (constants in
  code with a one-line reason), a config file format, charts, TypeScript outside `custom-storage.ts`,
  tests for the harness, `better-sqlite3`, any change to `node_modules`, `patches/`, `scripts/`, the
  app, or wcpos/electron. Do not touch the other spikes.
- Style nits, lint and typecheck do not apply under `spikes/`; do not run `pnpm lint`,
  `pnpm typecheck`, Jest or Vitest.
- 24 GB Mac: run one thing at a time; `NODE_OPTIONS=--max-old-space-size=2048` where a run is large.
- Budget: about 1,400 added lines across the harness files excluding `RESULTS.md` and generated
  content; the whole diff under 1,900 lines. If you are about to exceed either, STOP and report why
  instead of continuing. Splitting into more files does not raise the budget.

## Deliverable

The files above, committed by the operator. `RESULTS.md` will carry the environment lines per
platform, the leg 1 summary, the generated tables, and four answer paragraphs the operator writes:
(1) leg 1 — did the shipped `getSQLiteBasicsNodeNative` over `node:sqlite` pass rxdb's conformance
suite on Electron 43.4.0's Node, and is `better-sqlite3` therefore needed or not; (2) leg 2 — acked
losses per row per platform; (3) leg 3 — which engine wins each cell family and by how much on each
platform, the whole-document read with and without the projection, cold open and disk; (4) whether
SQLite clears the stability gate and wins **clearly** on speed on desktop, and what the numbers do not
decide.
