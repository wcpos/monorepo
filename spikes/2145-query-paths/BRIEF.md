# Spike 2145 — what the two non-implemented-operator query paths actually cost

Read this file, then carry out the task it describes. Ticket: wcpos/monorepo#2145.
Everything you need is in this repo. Do not modify anything outside `spikes/2145-query-paths/`.

## The question

rxdb-premium's SQLite storage translates eleven Mango operators to SQL. Any other operator
(`$regex`, `$elemMatch`, …) throws inside `prepareSQLiteQuery`, and the catch block rebuilds the
query **with the WHERE clause discarded** — the instance then pages the WHOLE table 50 rows at a
time (`NON_IMPLEMENTED_OPERATOR_QUERY_BATCH_SIZE`), `JSON.parse`s every row and applies rxdb's
JS matcher. `count()` on such a query calls `query()` and returns `documents.length`.

Read the shipped code before you build anything (it is minified, one line each):

- `node_modules/rxdb-premium/dist/esm/plugins/storage-sqlite/sqlite-helpers.js` — `prepareSQLiteQuery`
  (the catch block: `m=[], i=e.operator, l=p+" "+u+" LIMIT "+r`).
- `node_modules/rxdb-premium/dist/esm/plugins/storage-sqlite/sqlite-storage-instance.js` —
  `query()` / `count()` / `modifyQuery()`. Note that `modifyQuery` (the documented
  `queryModifier` setting, `settings.queryModifier(queryWithParams, preparedQuery)`) IS called on
  every page of the fallback loop, with `preparedQuery.mangoQuery` available — so a modifier can
  put a WHERE back. But it cannot leave the loop: the instance still pages with `OFFSET`, parses
  every returned row and re-applies the JS matcher, and `count()` still goes through `query()`.

Two production queries land in that path. Measure them, on the real stack, and answer:

1. **What is the multiplier** of the fallback over a pushed query, on wasm SQLite + the
   `opfs-sahpool` VFS inside a dedicated Chrome worker (NOT native sqlite3 — §18 of the research
   already measured native at ~200x and called it a floor).
2. **Is `queryModifier` enough?** i.e. with a modifier that rewrites the predicate into SQL, how
   close does each query get to a genuinely pushed one, given the loop it cannot escape?
3. **What would a full fix cost?** The floor is the rewritten SQL executed directly (one statement,
   no paging, no JS matcher). Measure that too, so the ticket can say how much a small premium
   patch (we already patch premium elsewhere) would buy over the modifier alone.

## The two queries

**A. Logs search** (`packages/sync-core/src/scanSearchSelector.ts`, `buildScanSearchSelector`).
The Logs screen searches a `logs` collection whose rows are ~500 B of JSON. The selector for one
typed term `t` is `{$and: [{$or: [five arms]}]}`: one arm `{'context.fold': {$regex: escape(t)}}`
plus four arms `{<raw field>: {$regex: escape(t), $options: 'i'}}` over `message`,
`context.error`, `context.errorCode`, `context.search`. Two terms give two `$and` members. Seed
**46,000 rows** (the measured merchant day); make roughly 1 in 50 rows contain the search term in
`context.fold` (so a page of 50 needs ~2,500 rows scanned), the rest random words. Sort as the
Logs screen does: `[{timestamp: 'desc'}]` (a string ISO timestamp is fine; declare the index
`['timestamp']` in the schema). Row shape: copy the seed of
`packages/database/src/logs-volume.bench.test.ts` loosely — `id`, `timestamp`, `level`, `message`,
`context: {fold, error, errorCode, search, …}` — do not import the real schema; a throwaway
schema with `maxLength` on the indexed string is enough.

Measure with `limit: 50` (the grid page) AND with no limit (what `count()` and the retention paths
do), for one term and for two terms.

Rewrite for the modifier: each `$regex` arm becomes `JSON_EXTRACT(data,'$.<path>') LIKE ?` with
`%term%` (the folded arm is case-exact: use `GLOB '*term*'` there, `LIKE` for the four `$options:'i'`
arms — say in RESULTS which you used and why); `$and`/`$or` map directly.

**B. Orders cashier pill** (`packages/core/src/query/query-state-translator.ts`, the `metadata`
operator, via `wooMetaCarrier.identityFilter` in `packages/sync-core/src/pos-carrier/carrier.ts`).
The engine's orders document is `{uuid, remoteId, dateCreatedGmt, status, …, payload, sync, local}`
and the pill's prefilter is
`{'payload.meta_data': {$elemMatch: {key: '_pos_user', value: '<cashier id>'}}}` — the POS's
default orders view — combined with the grid's sort `[{dateCreatedGmt: 'desc'}]` and, in the
default view, `status` in the open set. Seed **20,000 orders** with a `payload.meta_data` array of
6–10 `{id, key, value}` entries that always includes `_pos_user` (spread across 4 cashiers, so the
pill matches ~25%) and `_pos_store`. Declare the indexes the engine declares:
`['dateCreatedGmt']` and `['status','dateCreatedGmt']`.

Measure `find` with `limit: 50` sorted by `dateCreatedGmt desc`, and `count()` (this one is the
live pain: the engine already sets `allowSlowCount` for it).

Rewrite for the modifier: `EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data,'$.payload.meta_data'))
WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)`.

## Modes to measure, per query

| Mode | What runs |
|---|---|
| `fallback` | the query exactly as premium ships it (no modifier) |
| `modifier` | premium with `queryModifier` injecting the rewritten WHERE into every fallback page |
| `direct` | the rewritten SQL as ONE statement through the same `sqliteBasics.all()` in the same worker (the floor a patched engine would reach) — for `count`, `SELECT COUNT(1)`; for `find`, the `ORDER BY … LIMIT 50` form |

Report median and max of 5 timed runs after 1 warm-up, in ms, timed in the **worker** (wrap the
`sqliteBasics.all` call and the storage-instance `query`/`count` call with `performance.now()`)
AND as seen from the page (round trip through premium's worker RPC). Also count the number of
`all()` calls and total rows returned to JS per query — that is the mechanism, not just the time.

## The stack — reuse spike 2138, do not rebuild it

`spikes/2138-rxdb-sqlite-wasm/` is a merged, working harness for exactly this stack. Read its
`RESULTS.md` first: five things had to be worked around and every one applies here (expose the
worker storage synchronously; `mode: 'one'`; `storeAttachmentsAsBase64String: true`;
`PRAGMA locking_mode = exclusive` before WAL; bundles go under
`.rxdb-src/docs-src/static/files/`, never under `test/`).

- The rxdb 17.4.0 clone is ALREADY present and built at `spikes/2138-rxdb-sqlite-wasm/.rxdb-src/`
  (gitignored), with `@sqlite.org/sqlite-wasm`, `esbuild` and a real copy of `rxdb-premium` in its
  `node_modules`. Do not re-run 2138's setup; do not run `npm install` there.
- `sqlite-basics-oo1.mjs` and `sqlite-worker-entry.mjs` are the adapter and the worker. Copy
  them into `spikes/2145-query-paths/` and extend the copy: the worker needs a `queryModifier`
  in one build and none in another (two bundles, `worker-fallback.js` and `worker-modifier.js`,
  is simplest), plus a small message handler on the worker `self` for the `direct` mode and for
  reading the worker-side timings/counters (`postMessage` on a name you choose; premium's
  `exposeWorkerRxStorage` uses its own message shapes, so guard yours by a `type` field it will
  ignore — check `rxdb/plugins/storage-remote` for how it filters messages before you rely on
  that).
- `page-probe-entry.mjs` + `page-probe.mjs` show how to drive the worker storage from a page in
  headless Chromium with Playwright serving the bundles via `page.route`. Copy that shape into
  `bench-entry.mjs` (page side: create instances, seed, run modes, print a JSON table) and
  `bench.mjs` (Playwright driver; exits non-zero on failure). Bundle with the clone's esbuild into
  `.rxdb-src/docs-src/static/files/spike-2145/`. Use the clone's `node_modules` for `rxdb`,
  `rxdb-premium` and `@sqlite.org/sqlite-wasm` (import paths resolve from
  `spikes/2138-rxdb-sqlite-wasm/.rxdb-src/spike-2145/…` if you copy the entries there, exactly as
  2138's runner does for `spike-2138/`). Playwright is in this repo's root `node_modules`.
- One `run.sh` in `spikes/2145-query-paths/` that does bundle + run and writes `results.json`
  and refreshes `RESULTS.md`'s tables (or prints them for you to paste — say which).

Seeding 46k + 20k rows through `bulkWrite` in batches of 1,000 is fine (it is what the app does).
Use a fresh database name per run so nothing persists between runs; close instances at the end.

## Execution split — you build, the operator runs the browser

Your sandbox cannot launch Chrome (verified on the first attempt: Playwright's Chromium died with
`SIGABRT` at launch). Do not try again and do not report that as the result. Instead:

1. Build every file: the worker entries, `bench-entry.mjs`, `bench.mjs`, `run.sh`, and a
   `report.mjs` that turns `results.json` into the RESULTS.md tables (so the tables are generated,
   not hand-typed).
2. Run only the esbuild bundling step from `run.sh` to prove the bundles build (that works in
   your sandbox). Check the bundle sizes are non-trivial and that `sqlite3.wasm` was copied.
3. Write `RESULTS.md` with the environment line left as placeholders, the generated-table section
   marked as "filled by `node report.mjs`", and the three answer paragraphs left as TODO for the
   operator to fill from the numbers.
4. Report exactly what the operator must run (one command) and what it writes.

The operator runs `run.sh` outside the sandbox, then `report.mjs`, and writes the answers.

## Deliverable

`spikes/2145-query-paths/RESULTS.md`: the environment line (Chrome version, sqlite-wasm version,
row counts), one table per query with the modes × (find limit 50 / find unlimited or count) cells,
the `all()` call and rows-to-JS counts, and three short paragraphs answering questions 1–3 above.
State plainly anything you could not measure and why. Keep raw output in `results.json`.

## Stakes and scope

This is a measurement spike. No production code changes, nothing ships, no user data. The worst
failure is a misleading number, so: time in the worker, not just the page; run each cell 5 times;
and print the `EXPLAIN QUERY PLAN` for the `direct` statements once so the table can say whether
the declared index was used.

Out of scope — do not do these: patching rxdb-premium; FTS5; Firefox/Safari; Node or native
sqlite3 comparisons; changing anything under `packages/`; touching spike 2138's files (copy, do
not edit); feature flags, env vars, config files; a plan file.

Budget: at most **350 added lines** of non-generated code across the new spike files (the bundles
and `results.json` do not count). If you are about to exceed it, STOP and report why rather than
continuing; splitting into more files does not raise it. Build the harness, run it, write
RESULTS.md, then report what you ran and every number you could not obtain.
