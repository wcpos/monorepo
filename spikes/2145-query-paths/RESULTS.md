# Spike 2145 — what the two non-implemented-operator query paths actually cost

Measured 2026-09-18 on this Mac (Apple M4 Pro, Chrome 154.0.8037.44, rxdb + rxdb-premium 17.4.0,
`@sqlite.org/sqlite-wasm` 3.53.4-build1, `opfs-sahpool`, WAL) on the stack spike 2138 proved works:
premium `getRxStorageSQLite` in a dedicated worker, driven through premium's worker RPC from a
headless page. 46,000 logs rows of 500 B and 20,000 engine-shaped orders of ~850 B. Ticket:
[#2145](https://github.com/wcpos/monorepo/issues/2145).

## Verdict

**As shipped, both paths are unusable on this stack, the documented `queryModifier` fixes the grid
page completely and the count only partly, and a small premium patch reaches the floor.**

| Query | As shipped (fallback) | With `queryModifier` | One statement (floor) |
|---|---:|---:|---:|
| Logs search, grid page of 50 (one term) | **16.5 s** | 5.9 ms | 5.6 ms |
| Logs search, grid page of 50 (two terms) | **33.6 s** | 11.1 ms | 11.5 ms |
| Logs search, count (one term, 920 hits) | **310 s** | 4.0 s | 386 ms |
| Orders cashier pill, grid page of 50 | **929 ms** | 1.3 ms | 1.3 ms |
| Orders cashier pill + open statuses, grid page | **1.65 s** | 1.6 ms | 1.4 ms |
| Orders cashier pill, count (5,000 hits) | **94.7 s** | 13.5 s | 706 ms |
| Orders cashier pill + open statuses, count (3,000 hits) | **94.2 s** | 7.5 s | 453 ms |

Medians, timed inside the worker around premium's `query()`/`count()`. The page-side round trip
through premium's worker RPC adds under 2 ms to any cell (1.4 ms on the 16.5 s logs page, 0.3 ms on
the 1.3 ms orders page). Full tables, plans and the SQL are in the generated section below.

## What the mechanism costs, not just the time

- **A fallback page costs ~330 ms on logs and ~230 ms on orders**, whatever the page. The
  WHERE-less statement premium issues is `SELECT data FROM t INDEXED BY idx ORDER BY
  JSON_EXTRACT(data,'$.timestamp') DESC, id ASC LIMIT 50 OFFSET n`; with the leading `deleted`
  column unconstrained the index cannot supply the order, so every page sorts the whole table in a
  temp b-tree (§18 of the research measured that same shape natively at 4 ms). **wasm + the
  opfs-sahpool VFS makes that page ~80x dearer than native.** The multiplier the ticket asked for is
  therefore two numbers: ~80x per page over native, and pages × 330 ms over the pushed query.
- **A grid page needs about `1 / hit-rate` fallback pages.** Each fetched page of 50 rows yields
  `50 × h` matches, so 50 results take `1 / h` pages: logs at 1 hit in 50 rows needs 50 pages (2,500
  rows parsed in JS); two terms need 100. Orders at 1 hit in 4 needs 4 pages, 7 with the status
  filter. Every page is a full sort of the table, so the grid page costs `(1 / h) × table-sort`.
- **A count pages the entire table**: 921 pages and 46,000 `JSON.parse`s on logs, 401 and 20,000 on
  orders, regardless of the term or the hit rate (the one- and two-term counts are within 1%).
- **The modifier makes the first page the last page for a grid query**: the injected WHERE returns
  50 matches in one statement and premium's loop stops (`r.length >= skip+limit`). Rows to JS drop
  from 2,500 to 50. That is why the grid cells reach parity with the floor.
- **The modifier cannot rescue a count.** premium still pages with `OFFSET`, so a count of `m`
  matches issues `m/50 + 1` statements, each a filtered scan that SQLite must walk far enough to skip
  the offset: 20 statements for 920 logs hits (4.0 s), 101 for 5,000 orders hits (13.5 s). Cost is
  roughly `pages × half a table scan`, i.e. it grows with matches × table size — the worst shape for
  the default orders view, where the cashier pill matches most rows.
- **Even the floor is a scan.** The direct count is 386 ms on logs and 706 ms on orders because
  neither predicate has an index to use: `LIKE`/`GLOB` on JSON text, and `json_each` over every row's
  `meta_data` (the plan says `SCAN json_each EXISTS VIRTUAL TABLE`). The declared RxDB index is used
  only for the `deleted = ?` prefix and the sort.

## Answers

**1. The multiplier over the pushed query, on the real VFS.** Grid page: **2,900x** for logs search
(16.5 s vs 5.6 ms), **700–1,200x** for the orders pill (929 ms / 1.65 s vs 1.3 ms). Count: **800x**
for logs (310 s vs 386 ms), **130–210x** for orders (94 s vs 0.7 / 0.45 s). §18's native figure of
~200x was indeed a floor: the per-page statement is ~80x dearer on wasm + opfs-sahpool than on
native sqlite3, and the grid page pays it 50 times over on logs. Either production path as shipped
is a multi-second stall for the grid and a multi-minute stall for a count, in the storage worker,
per keystroke or pill change.

**2. `queryModifier` is enough for the grid page and not for the count.** With the predicate
rewritten to SQL (`GLOB` for the fold-space arm, `LIKE` for the four case-insensitive raw arms;
`EXISTS (SELECT 1 FROM json_each(…))` for `$elemMatch`) every `find` with a limit reaches the
single-statement floor: 5.9 ms, 11.1 ms, 1.3 ms, 1.6 ms. Counts stay **6.6–19x** off the floor
because the fallback loop itself survives the modifier: 4.0 s and 2.5 s for logs, 13.5 s and 7.5 s
for the orders default view. The modifier is a real fix for typing in the Logs screen and for paging
the orders grid; it is not a fix for `count()`, which the orders grid calls on every pill change
(the engine already flags this path `allowSlowCount`).

**3. What a full fix buys and costs.** A patch that lets the modifier declare "fully translated" and
then (a) runs `query()` as one statement without the paging loop and (b) runs `count()` as
`SELECT COUNT(1) … WHERE <modified>` collapses the counts from 4.0 s → 386 ms (logs) and
13.5 s → 706 ms (orders): **10–19x** over the modifier alone, and every `JSON.parse` of a
non-returned row disappears. It is a ~20-line change in `sqlite-storage-instance.js` (`query()` and
`count()` both branch on `nonImplementedOperator`; the branch needs a second condition), in a package
this repo already patches. Two things the patch does not buy, and which belong to the engine
migration (#2150) and the topology grilling (#2146): (i) the counts are still full scans at
0.4–0.7 s per 20–46k rows because the predicates are unindexable as written — the durable fix for
the orders pill is to **promote `_pos_user`/`_pos_store` to top-level engine columns at write time
and index them**, which turns the default orders view into an index seek and removes `$elemMatch`
from the hot path entirely; (ii) the logs rewrite needs an `ESCAPE` clause for `%`/`_` (LIKE) and
`*`/`?`/`[` (GLOB) in user input, and `LIKE`'s case folding is ASCII-only — acceptable for the raw
arms, whose production comment already says "ASCII-faithful, best effort", exact for the fold arm.

## Not measured here (deliberately)

Native sqlite3 or Node comparisons (§18 has the native shape); Firefox/Safari; a patched premium
build (the `direct` mode is the same statement through the same adapter and is the proxy the ticket
asked for); cold-cache latency; Unicode or wildcard equivalence of the rewrite; the current OPFS
engine's cost for the same queries (that is the benchmark ticket, #2143).

## Method and limits
- 46,000 logs, padded toward 500 JSON bytes; deterministic pseudo-random background words. `quartz` appears in fold every 50 rows, `cobalt` co-occurs every 100: 920/460 matches. Fixed ASCII terms need no regex escaping. Five search arms match the production selector; raw fields use case-insensitive LIKE, fold uses case-exact GLOB. This is not proof of Unicode or wildcard rewrite equivalence.
- 20,000 engine-shaped orders; 6–10 metadata entries, four cashiers, `_pos_store` always present. Cashier `1` matches 5,000; combining with `pos-open`, `pos-partial`, `pending` matches 3,000. Five evenly distributed statuses are independent of cashier. Both cashier-only and open-set queries are reported; open set copied from `use-open-orders-resource.ts`.
- Schemas declare timestamp or date/status-date indexes; RxDB adds deleted/primary-key fields. Normalized queries include `_deleted=false` and a primary-key sort tiebreaker. Raw schemas and direct EXPLAIN plans are retained in JSON. No index is forced; the report names observed index use, including temporary sorts.
- Runs are serial: fallback and direct share one worker/dataset; modifier gets an identical seed in its own worker/pool. Fresh database names, 1,000-row writes, one warm-up then five samples per cell (three for a fallback count, which pages the whole table at ~5 min a sample); instances close and workers terminate. No app observers, retention deletes, or background sync. Warm-cache measurements, not cold-start/production latency.
- Worker time wraps storage query/count (nested query counted once); `all() ms` sums adapter call time. Calls and rows-to-JS count every returned SQLite row, including the count scalar and final empty fallback page. They do not count SQLite's internal row visits. Seeding, EXPLAIN, validation, and metrics retrieval are untimed.
- Page timing covers premium worker RPC for fallback/modifier; direct uses a separate type-tagged message on the same worker and returns equivalent documents/count. Direct worker time includes one statement and document JSON parsing, no paging/matcher; all() time isolates the SQL/row-transfer floor. RPC envelopes differ: compare worker ratios first. No genuinely pushed Mango control or patched premium engine was run; direct is the requested proxy, not proof of patch performance.
- Each sample checks exact ordered IDs/count across modes and known cardinality. Current fixtures put matches in fold, not raw-only fields. Broader semantic coverage, mode-order bias, variance beyond five samples, and failure-retry machinery are outside this measurement spike.


<!-- generated:start -->
Environment: `{"chrome":"154.0.8037.44","node":"v24.14.0","os":"darwin 25.6.0 arm64","cpu":"Apple M4 Pro","versions":{"rxdb":"17.4.0","rxdb-premium":"17.4.0","@sqlite.org/sqlite-wasm":"3.53.4-build1","esbuild":"0.28.2"},"measuredAt":"2026-09-17T23:58:39.265Z","vfs":"opfs-sahpool","journal":"WAL"}`

Rows: {"logs":46000,"orders":20000}; mean JSON bytes: {"logs":500,"orders":851.9762}.

All timing/count cells are median / max of five runs after one discarded warm-up (three runs for a fallback count, which pages the whole table). Times in ms.

### logs-1

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find50 | fallback | 16501.80 / 16535.40 | 16497.30 / 16530.10 | 16503.20 / 16535.60 | 50.00 / 50.00 | 2500.00 / 2500.00 | 50.00 / 50.00 | 2946.75× | 2895.30× |
| find50 | direct | 5.60 / 5.60 | 5.60 / 5.60 | 5.70 / 5.90 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| count | fallback | 309803.90 / 310563.90 | 309717.80 / 310489.70 | 309804.40 / 310564.10 | 921.00 / 921.00 | 46000.00 / 46000.00 | 920.00 / 920.00 | 803.02× | 802.60× |
| count | direct | 385.80 / 391.20 | 385.80 / 391.10 | 386.00 / 391.20 | 1.00 / 1.00 | 1.00 / 1.00 | 920.00 / 920.00 | 1.00× | 1.00× |
| find50 | modifier | 5.90 / 6.10 | 5.70 / 5.80 | 5.90 / 6.10 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.05× | 1.04× |
| count | modifier | 4039.90 / 4211.50 | 4038.30 / 4210.00 | 4040.60 / 4211.60 | 20.00 / 20.00 | 920.00 / 920.00 | 920.00 / 920.00 | 10.47× | 10.47× |

### logs-2

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find50 | fallback | 33626.60 / 33879.80 | 33617.60 / 33870.90 | 33627.90 / 33880.20 | 100.00 / 100.00 | 5000.00 / 5000.00 | 50.00 / 50.00 | 2924.05× | 2874.18× |
| find50 | direct | 11.50 / 11.70 | 11.40 / 11.70 | 11.70 / 11.80 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| count | fallback | 308254.30 / 309465.00 | 308179.60 / 309386.10 | 308254.80 / 309465.50 | 921.00 / 921.00 | 46000.00 / 46000.00 | 460.00 / 460.00 | 807.16× | 807.16× |
| count | direct | 381.90 / 386.40 | 381.90 / 386.40 | 381.90 / 386.60 | 1.00 / 1.00 | 1.00 / 1.00 | 460.00 / 460.00 | 1.00× | 1.00× |
| find50 | modifier | 11.10 / 11.20 | 11.00 / 11.10 | 11.30 / 11.30 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 0.97× | 0.97× |
| count | modifier | 2537.20 / 2689.60 | 2535.80 / 2688.50 | 2537.90 / 2690.30 | 11.00 / 11.00 | 460.00 / 460.00 | 460.00 / 460.00 | 6.64× | 6.65× |

### orders-all

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find50 | fallback | 929.20 / 934.90 | 928.80 / 934.50 | 929.70 / 935.20 | 4.00 / 4.00 | 200.00 / 200.00 | 50.00 / 50.00 | 714.77× | 581.06× |
| find50 | direct | 1.30 / 1.40 | 1.30 / 1.30 | 1.60 / 1.60 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| count | fallback | 94662.50 / 95550.30 | 94624.80 / 95513.70 | 94662.90 / 95550.80 | 401.00 / 401.00 | 20000.00 / 20000.00 | 5000.00 / 5000.00 | 134.12× | 134.10× |
| count | direct | 705.80 / 718.30 | 705.80 / 718.30 | 705.90 / 718.30 | 1.00 / 1.00 | 1.00 / 1.00 | 5000.00 / 5000.00 | 1.00× | 1.00× |
| find50 | modifier | 1.30 / 1.40 | 1.20 / 1.20 | 1.50 / 1.60 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 0.94× |
| count | modifier | 13506.70 / 13962.40 | 13497.60 / 13953.90 | 13508.40 / 13962.90 | 101.00 / 101.00 | 5000.00 / 5000.00 | 5000.00 / 5000.00 | 19.14× | 19.14× |

### orders-open

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find50 | fallback | 1650.00 / 1690.90 | 1649.10 / 1690.10 | 1650.40 / 1691.30 | 7.00 / 7.00 | 350.00 / 350.00 | 50.00 / 50.00 | 1178.57× | 970.82× |
| find50 | direct | 1.40 / 1.50 | 1.40 / 1.40 | 1.70 / 1.70 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| count | fallback | 94162.50 / 94176.80 | 94120.60 / 94134.10 | 94163.70 / 94177.20 | 401.00 / 401.00 | 20000.00 / 20000.00 | 3000.00 / 3000.00 | 207.82× | 207.78× |
| count | direct | 453.10 / 457.50 | 453.10 / 457.50 | 453.20 / 457.70 | 1.00 / 1.00 | 1.00 / 1.00 | 3000.00 / 3000.00 | 1.00× | 1.00× |
| find50 | modifier | 1.60 / 1.70 | 1.50 / 1.60 | 1.90 / 1.90 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.14× | 1.12× |
| count | modifier | 7474.20 / 7532.40 | 7468.90 / 7526.10 | 7475.30 / 7533.60 | 61.00 / 61.00 | 3000.00 / 3000.00 | 3000.00 / 3000.00 | 16.50× | 16.49× |

### Direct query plans (observed)

- **logs-1/find50** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-fbcqiflrgbzf_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 50
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-1/count** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-fbcqiflrgbzf_logs_0__deleted_timestamp_id_idx (deleted=?)

```sql
SELECT COUNT(1) AS count FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND deleted = ?)
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-2/find50** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-fbcqiflrgbzf_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND ((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 50
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%","*cobalt*","%cobalt%","%cobalt%","%cobalt%","%cobalt%",false]`

- **logs-2/count** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-fbcqiflrgbzf_logs_0__deleted_timestamp_id_idx (deleted=?)

```sql
SELECT COUNT(1) AS count FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND ((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ?) OR (JSON_EXTRACT(data, '$.context.error') LIKE ?) OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ?) OR (JSON_EXTRACT(data, '$.context.search') LIKE ?)) AND deleted = ?)
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%","*cobalt*","%cobalt%","%cobalt%","%cobalt%","%cobalt%",false]`

- **orders-all/find50** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-hwoyfgmqkglh_orders_0__deleted_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "orders-0" WHERE (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.dateCreatedGmt') desc,id asc LIMIT 50
```
Parameters: `["_pos_user","1",false]`

- **orders-all/count** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-hwoyfgmqkglh_orders_0__deleted_status_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:

```sql
SELECT COUNT(1) AS count FROM "orders-0" WHERE (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?) AND deleted = ?)
```
Parameters: `["_pos_user","1",false]`

- **orders-open/find50** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-hwoyfgmqkglh_orders_0__deleted_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "orders-0" WHERE (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?) AND JSON_EXTRACT(data, '$.status') IN (?,?,?) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.dateCreatedGmt') desc,id asc LIMIT 50
```
Parameters: `["_pos_user","1","pos-open","pos-partial","pending",false]`

- **orders-open/count** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-hwoyfgmqkglh_orders_0__deleted_status_dateCreatedGmt_uuid_idx (deleted=? AND <expr>=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:

```sql
SELECT COUNT(1) AS count FROM "orders-0" WHERE (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?) AND JSON_EXTRACT(data, '$.status') IN (?,?,?) AND deleted = ?)
```
Parameters: `["_pos_user","1","pos-open","pos-partial","pending",false]`

<!-- generated:end -->

## Files

- `sqlite-basics-oo1.mjs` — spike 2138's adapter, unchanged apart from the repo formatter.
- `sqlite-worker-entry.mjs` — 2138's worker plus: a `queryModifier` compiled in by esbuild's
  `--define:MODIFIER`, per-call timing/counting around `sqliteBasics.all`, and a type-tagged message
  handler for the `direct` and `explain` modes and for reading the worker-side counters.
- `bench-entry.mjs` — page side: seeds both collections through `bulkWrite`, runs every cell, checks
  that all three modes return the same ordered ids / count and the expected cardinality.
- `bench.mjs` — Playwright driver (installed Chrome, headless, bundles served via `page.route`).
- `report.mjs` — regenerates the tables between the `generated` markers from `results.json`.
- `run.sh` — bundle + run + report. `--build-only` stops after bundling.

## Reproduce

```
bash spikes/2145-query-paths/run.sh        # ~70 min: the eight fallback counts are ~5 min a sample
node spikes/2145-query-paths/report.mjs    # tables only, from results.json
```

Needs spike 2138's built clone at `spikes/2138-rxdb-sqlite-wasm/.rxdb-src/` (its runner creates it;
this spike only symlinks its `node_modules`). All generated output stays under this spike's
gitignored `.rxdb-src/`; `results.json` is the tracked raw evidence.
