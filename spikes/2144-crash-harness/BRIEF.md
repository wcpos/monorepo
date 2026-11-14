# Spike 2144 — does SQLite over OPFS (opfs-sahpool) keep committed data when the process stops?

Read this file, then carry out the task it describes. Ticket: wcpos/monorepo#2144 (wayfinder map
#2137, "Storage engine for 2.0"). Everything you need is in this repo. Do not modify anything outside
`spikes/2144-crash-harness/` and `.github/workflows/spike-2144-crash.yml`.

Prior accepted artefact to copy the shape of: `spikes/2143-storage-benchmark/` (run.sh, a Playwright
driver that serves bundles from memory with COOP/COEP headers, a page entry, a worker entry, a report
script that fills RESULTS.md between markers, a Windows workflow). Reuse its conventions and its
`.deps` install pattern; do not import from it (the two spikes must stay independently runnable).

## The question

The 2.0 storage decision is leaning to SQLite on the strength of things we have *read* about it. This
harness produces the durability evidence we do not have: after an abrupt stop, is every transaction the
page was told had committed still there, whole, and is the database still openable? It is an
instrument. It decides nothing itself; the operator writes the answer paragraphs.

Vocabulary used below:

- **stop** — the storage code stops running with no chance to clean up. Two kinds are simulated:
  a **worker stop** (`Worker.terminate()`, immediate, thread-level; bytes already handed to the OS
  survive, bytes still in JS do not) and a **process stop** (the browser process ends with signal 9;
  same OS-level guarantee). Power loss is not simulated: nothing here can, and the research doc's
  rule is to score process-level runs first, where a correctly built engine is expected to be perfect.
- **boundary** — a named point inside the storage engine's write path at which a worker stop is
  applied deterministically (see "Boundaries").
- **acked** — a transaction whose commit call returned to the page before the stop.
- **in-flight** — the one transaction that was running at the stop, never acked.

## Outcome scoring (every trial in every cell produces exactly one)

After the stop, reopen the same database in a fresh worker (or a fresh browser process) and check,
in this order; the first failing check is the outcome:

| Outcome | Meaning |
|---|---|
| `open-failed` | the pool would not install, or the database would not open, within 10 s of retrying |
| `integrity-failed` | `PRAGMA integrity_check` did not return exactly one row `ok` |
| `lost` | an acked transaction is missing from the ledger |
| `partial` | a transaction is present in the ledger but its row count in `docs` differs from the recorded `n`, or `docs` holds rows whose `tx` is not in the ledger |
| `ok` | everything above passed; the in-flight transaction is either wholly present or wholly absent (record which) |

Also record per trial: journal mode, `cache_size`, boundary name (if any), the stop time relative to
the workload start, the number of acked transactions, whether the in-flight one survived, the time
to reacquire the pool after a worker stop, and the reopen-to-first-read time.

For the incumbent control (see rows) the same outcomes apply with these mappings: `open-failed` =
the storage instance could not be created or its first `query` rejected; `integrity-failed` = the
worker reported a recovery or parse failure on open (capture worker console output and any error
event); `lost` / `partial` from a full `query` of the collection compared to the acked ledger.

## Rows (engines)

| Row | Where | Notes |
|---|---|---|
| `sqlite-sahpool` | `worker-sqlite-crash.mjs` (you write it) | RAW SQLite through `@sqlite.org/sqlite-wasm` 3.53.4-build1's `oo1.DB` on `installOpfsSAHPoolVfs` — no RxDB. Copy `spikes/2143-storage-benchmark/sqlite-basics-oo1.mjs`'s open sequence: `PRAGMA locking_mode = exclusive` FIRST, then `journal_mode`, and fail loudly if the effective journal mode differs from the requested one. `initialCapacity` 12 unless a cell says otherwise. |
| `opfs-shipped` (control) | `apps/main/public/opfs.worker.js` served verbatim (do not rebuild or modify it) | The engine we ship today, driven from the page through `rxdb-premium/plugins/storage-worker`'s `getRxStorageWorker` exactly as `spikes/2143-storage-benchmark/bench-entry.mjs` `open()` does (`workerOptions: { name: 'spike-2144-opfs' }`, `multiInstance: false`, one collection, schema below). Only the **random-stop** and **process-stop** cells run this row: it has no VFS boundaries. |

Both rows in WAL and in DELETE (rollback-journal) mode for SQLite; the control has one mode.

## The workload (both rows)

One table shaped like premium's SQLite storage table so the write shape matches what a 2.0 engine
would issue (read `node_modules/rxdb-premium/dist/esm/plugins/storage-sqlite/sqlite-storage-instance.js`
for the column set; it is minified, one line):

```sql
CREATE TABLE docs (id TEXT PRIMARY KEY, revision TEXT, deleted INTEGER, lastWriteTime INTEGER, data TEXT, tx INTEGER) WITHOUT ROWID;
CREATE INDEX docs_tx ON docs(tx);
CREATE TABLE ledger (tx INTEGER PRIMARY KEY, n INTEGER, committedAt INTEGER);
```

A **transaction** is `BEGIN; <n> × INSERT OR REPLACE INTO docs …; INSERT INTO ledger …; COMMIT;` in one
`db.transaction(...)`. Rows are ~2,000 JSON bytes (reuse 2143's product fixture generator shape or a
padded object; deterministic, seeded PRNG). The stream alternates transaction sizes in a fixed
pattern: 1, 1, 3, 1, 50, 1, 1, 1000, repeat — the cart-line write, a small batch, and a resync
batch. 20% of rows in each transaction update an existing id (so pages already on disk are
rewritten); the rest insert. The worker acks each transaction to the page with its `tx` **after**
`COMMIT` returns; the page keeps the acked set and knows the in-flight `tx`.

For the control, the same stream goes through `bulkWrite` on one RxDB collection (`id` primary,
`tx`, `payload`), each `bulkWrite` = one transaction, acked when the call resolves with no errors;
the ledger is the set of acked `tx` values and the expected row count per `tx`.

## Boundaries (SQLite row only)

Implement boundary stops **without touching SQLite or the VFS code**: before `installOpfsSAHPoolVfs`,
wrap `FileSystemSyncAccessHandle.prototype.write`, `.flush` and `.truncate` in the worker. This is
the physical boundary — the bytes handed to the OS — and it is exactly what sahpool's `xWrite`,
`xSync` and `xTruncate` call (one `sah.write(bytes, { at: 4096 + offset })`, one `sah.flush()`, one
`sah.truncate(4096 + size)`; verified in `.deps/node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs`,
search `xWrite: function(pFile, pSrc, n, offset64)`). Map each access handle to its SQLite path by
observing the pool's association write: a write of 516 bytes at offset 0 whose bytes 0..511 hold the
NUL-terminated UTF-8 path (`setAssociatedPath` in the same file; empty path = slot released). Then a
handle's writes at offset ≥ 4096 are that file's page writes; the file is `/<db>` (main),
`/<db>-wal` or `/<db>-journal`.

A boundary is a predicate over the hook's event stream. When the predicate first fires in the armed
transaction, the worker **holds**: it stores 1 into a `SharedArrayBuffer` slot the page gave it and
blocks in `Atomics.wait` (the page is served with COOP/COEP as 2143 does; a blocked worker cannot
`postMessage`, which is why the flag is shared memory). The page polls the slot (every 5 ms), sees the
hold, and calls `worker.terminate()`. Do not simulate a stop by throwing from the hook: SQLite treats
a thrown write as an I/O error and takes its rollback path, which proves error handling, not stop
survival. Do not let the hold itself do any I/O.

Boundaries to implement (name — fires when):

1. `wal-after-page-write` — WAL mode: after any `write` to `-wal` in the armed tx, before the next `flush` on it.
2. `wal-after-commit-flush-before-checkpoint` — WAL mode: the first `write` to the main file after the armed tx's commit `flush` on `-wal` returned (the checkpoint's first page copy). Arm this on a transaction that will trigger an auto-checkpoint, or run `PRAGMA wal_checkpoint(TRUNCATE)` right after the armed commit and hold on its first main-file write.
3. `wal-mid-checkpoint` — WAL mode: the k-th main-file `write` during that checkpoint, k drawn uniformly from the writes seen in a dry run of the same size.
4. `journal-after-write` — DELETE mode: after any `write` to `-journal` in the armed tx, before its `flush`.
5. `journal-after-flush-before-db-write` — DELETE mode: the first main-file `write` after the `-journal` `flush` in the armed tx.
6. `db-mid-commit` — DELETE mode: the k-th main-file `write` of the armed tx's commit (torn commit), k as in 3.
7. `db-after-write-before-flush` — both modes: the last main-file `write` of the commit/checkpoint, before its `flush`.
8. `journal-before-delete` — DELETE mode: the `truncate`/release of `-journal` at the end of the armed tx (hold on the first `truncate` to 4096 of the journal handle, or on the association-release write, whichever sahpool issues; read `xDelete` in the same file).

Each boundary runs **10 trials**, arming a transaction of the size that makes the boundary reachable
(the 1000-row transaction for 2, 3, 6, 7; the 1-row one for the rest), and each runs twice: with the
default `cache_size` and with `PRAGMA cache_size = -64` (64 KiB — well below a 1000-row transaction's
~2 MB of pages, so the page cache spills to the journal/WAL mid-transaction and the boundary is on a
file that really reached OPFS). Before arming, seed 2,000 rows so updates hit existing pages.

## Cells

Page-driven cells (A, B, E, F) need no Playwright: the page entry exposes `globalThis.runCells(spec)`
and returns the JSON; that is what lets the operator run them in **real Safari** (see "Browsers").
Driver-only cells (C, D) need `drive.mjs`.

- **A `boundary-stop`** — the 8 boundaries × 2 cache settings × 10 trials, SQLite row, each journal
  mode where the boundary applies. Fresh database name per trial. After each stop, note how long
  `installOpfsSAHPoolVfs` took to succeed in the fresh worker (the terminated worker's handles must
  be released by the browser first; retry every 50 ms for up to 10 s, then `open-failed`).
- **B `random-stop`** — run the stream continuously; stop the worker at a uniformly random time
  within the first 3 s; 30 trials per journal mode for SQLite (default cache), 30 for the control.
- **C `process-stop`** — `drive.mjs` only. Launch a persistent context (`launchPersistentContext`
  with a fresh user-data directory per row; `channel: 'chrome'` for chrome), run the stream, end
  the browser process with `browser.process().kill('SIGKILL')` at a random time within the first
  3 s, relaunch on the same directory, reopen, score. 10 trials per journal mode for SQLite, 10 for
  the control. Trap: a Chrome profile killed this way keeps `SingletonLock`/`SingletonSocket`/
  `SingletonCookie` in the user-data directory; remove them before relaunching or Chrome may refuse
  the profile. The acked set must be read from the page *before* the kill — poll it into the driver
  every 20 ms (the page cannot be asked after).
- **D `quota-exhaustion`** — `drive.mjs` only, chrome and firefox. Chrome: a CDP session
  (`context.newCDPSession(page)`) and `Storage.overrideQuotaForOrigin({ origin, quotaSize })` at 24 MB.
  Firefox: launch with `firefoxUserPrefs: { 'dom.quotaManager.temporaryStorage.fixedLimit': 24576 }`
  (KB). Run the stream until a transaction fails; record the SQLite result code and message of the
  failing statement (`SQLITE_FULL` = 13 is the honest answer, an `SQLITE_IOERR*` is the opaque one)
  AND the DOM exception (or the numeric return) the hook saw from `sah.write` at that moment — §4 of
  the research doc says Chrome returns `4294967288` instead of throwing. Then raise the quota (Chrome
  CDP; Firefox: relaunch without the pref), reopen, score. 3 trials per journal mode. Skip on
  webkit with a recorded reason (no quota control in Playwright's WebKit).
- **E `pool-exhaustion`** — page-driven, SQLite. Install with `initialCapacity: 6`, open databases
  in WAL mode (each takes 2 slots: main + wal) until open fails. Assert: the failure is a clean
  `SQLITE_CANTOPEN` whose message contains "SAH pool is full"; every already-open database still
  passes `integrity_check` and its ledger; `addCapacity(4)` then lets the next open succeed. 3
  trials. Plus **`handle-ceiling`**: in a dedicated worker with a fresh directory, create files and
  `createSyncAccessHandle()` on each until it throws; record the count and the exception name/message
  per browser (this is the only first-party number for the "252 on Safari" folklore; it needs real
  Safari to mean anything). Cap at 2,048 and record "no ceiling below 2,048" if reached.
- **F `slot-reuse`** — page-driven, SQLite. 50 rounds: create `/<long-name-64-chars>`, write 20
  transactions, close, `util.unlink()` it; create `/<short>` (8 chars), write 20 transactions, close;
  assert `util.getFileNames()` equals exactly the live set (no phantom, no truncated tail name),
  reopen `/<short>`, score. Every 10 rounds terminate the worker and re-install the pool in a fresh
  one (the pool re-reads every slot header) and repeat the assertion. That is the path behind the
  2023 sahpool header bug.

Run order: A, B, E, F, then C, D. Between trials close every handle (`db.close()`, then for the pool
`util.pauseVfs()` is NOT needed — terminate the worker) and use a fresh database name; between rows
terminate the worker. Every trial's record goes into one JSON per browser: `results.<browser>.json`
with an `environment` block like 2143's (browser version, OS, CPU, node, package versions,
measuredAt) and `trials: [...]`.

## Browsers

`drive.mjs --browser chrome|firefox|webkit [--cells A,B,C,D,E,F] [--out file] [--bundles dir]`
serves `.build/` from memory with `page.route` + COOP/COEP as 2143's `bench.mjs` does, loads the page,
calls `runCells` for the page-driven cells and drives C/D itself. `drive.mjs` depends only on
`playwright` and Node built-ins (it must run on a Windows CI runner with nothing else installed).
Playwright's WebKit cannot open OPFS from a worker on this Mac (2143 saw `UnknownError`); if that
happens, record it per cell and continue — do not fail the run.

`serve.mjs` (Node built-ins only) serves `.build/` on `http://localhost:18998/` with the same two
headers so the operator can open the page in **real Safari** and run the page-driven cells: the page
shows a `Run A,B,E,F` button and, when done, renders the JSON in a `<pre id="results">` and offers it as
a download named `results.safari.json`. Keep the page markup minimal; it is an instrument.

## Windows run (GitHub Actions)

`.github/workflows/spike-2144-crash.yml`, `workflow_dispatch`, copied from
`.github/workflows/spike-2143-benchmark.yml`: `bundle` on ubuntu (setup-monorepo, `run.sh
--build-only`, upload `.build/` + `drive.mjs`), then `crash-windows` on `windows-latest` running
`node drive.mjs --browser chrome --bundles .build --out results.windows-chrome.json` (all cells;
`process.kill(pid, 'SIGKILL')` is TerminateProcess on Windows and is what we want). Timeout 120 min.
Keep the comment about the temporary `push:` trigger.

## Build (`run.sh`)

As 2143: `.deps/` already holds `@sqlite.org/sqlite-wasm@3.53.4-build1` (keep the same
missing-directory install line so CI gets it), bundle `worker-sqlite-crash.mjs`, `handle-ceiling-worker.mjs`
and `harness-entry.mjs` with the root `esbuild` (`--bundle --format=esm --platform=browser`, alias the
sqlite package to `.deps`), copy `sqlite3.wasm` and a verbatim `apps/main/public/opfs.worker.js` into
`.build/`, write `versions.json`, assert sizes > 10,000 bytes. `.gitignore`: `.deps/`, `.build/`.
`run.sh [--build-only] [--browser X] [--cells …]` then runs `drive.mjs` per browser and `report.mjs`.

## Report (`report.mjs`)

Merge every `results.*.json` present into `RESULTS.md` between `<!-- generated:start -->` and
`<!-- generated:end -->`: per browser, one table per cell family with rows = (row, journal mode,
cache, boundary) and columns = trials, ok, ok-with-inflight-present, ok-with-inflight-absent, lost,
partial, integrity-failed, open-failed, median reacquire ms, median reopen ms; then one **summary
table** across browsers: per (row, journal mode) the process-stop and random-stop pass rates side by
side with the control. `handle-ceiling` and `quota-exhaustion` get their own small tables (count /
exception; result code / DOM error / reopen outcome). Must succeed on an empty results set.

## Execution split — you build, the operator runs the browsers

Your sandbox cannot launch a browser (Playwright's Chromium dies at launch; 2143 and 2145 verified
this; do not try, do not report it as a result). Instead:

1. Write every file: `worker-sqlite-crash.mjs`, `handle-ceiling-worker.mjs`, `harness-entry.mjs`,
   `drive.mjs`, `serve.mjs`, `report.mjs`, `run.sh`, `.gitignore`, the workflow, and `RESULTS.md`
   with the environment lines as placeholders, the generated section marked "filled by
   `node report.mjs`", and the answer paragraphs left as TODO for the operator.
2. Run `bash spikes/2144-crash-harness/run.sh --build-only`; print the sizes.
3. Run `node --check` on every `.mjs` and `node report.mjs` against an empty results set.
4. Prove the boundary mechanism without a browser: a small Node script (`selftest-hooks.mjs`, kept)
   that installs the same prototype wrapper on a fake access-handle class, replays a recorded
   sequence of (write/flush/truncate, path, offset, length) events for each of the 8 boundaries, and
   asserts each predicate fires at the intended event and only once. Print its output.
5. Report exactly what the operator must run and what each command writes, including the real-Safari
   steps.

## Constraints

- Stakes: a throwaway measurement harness under `spikes/`. Nothing ships. A wrong verdict is the only
  real failure, so: outcomes are scored by the checks above, never by "no exception was thrown"; a
  trial that cannot be scored is `open-failed`, never skipped; and the acked set is the page's, never
  reconstructed from the database after the fact.
- Do not add: retries beyond the two stated (pool reacquire 10 s, open 10 s), feature flags, env-var
  knobs (constants in code with a one-line reason), a config file format, charts, TypeScript, tests
  beyond `selftest-hooks.mjs`, or any change to `node_modules`, `patches/`, the app, or
  `apps/main/public/opfs.worker.js`. FTS5 is out of scope (#2147: not adopted); no triggers.
- Style nits, lint and typecheck do not apply under `spikes/`; do not run `pnpm lint`, `pnpm typecheck`,
  Jest or Vitest.
- Budget: about 1,500 added lines across the harness files excluding `RESULTS.md`; the whole diff under
  2,000 lines. If you are about to exceed either, STOP and report why instead of continuing.

## Deliverable

The files above, committed by the operator. `RESULTS.md` will carry the environment lines per browser,
the generated tables, and four answer paragraphs the operator writes: (1) process-stop and
random-stop pass rates, SQLite (both journal modes) against the control, per browser; (2) which
boundaries, if any, produced anything but `ok`, and whether cache spill changed that; (3) what quota
exhaustion and pool exhaustion actually report and whether the reopen is clean; (4) the handle
ceiling per browser and whether the Safari number exists.
