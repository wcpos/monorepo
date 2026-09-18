# Spike 2145 — what the two non-implemented-operator query paths actually cost

Measured 2026-09-18 on this Mac (Apple M4 Pro, Chrome 154.0.8037.44, rxdb + rxdb-premium 17.4.0,
`@sqlite.org/sqlite-wasm` 3.53.4-build1, `opfs-sahpool`, WAL) on the stack spike 2138 proved works:
premium `getRxStorageSQLite` in a dedicated worker, driven through premium's worker RPC from a
headless page. 46,000 logs rows of 500 B and 20,000 engine-shaped orders of ~850 B. Ticket:
[#2145](https://github.com/wcpos/monorepo/issues/2145).

The queries are the ones the screens issue: the Logs grid's `buildScanSearchSelector` (five `$regex`
arms per term, terms regex-escaped) sorted by timestamp, and the Orders screen's default scope —
cashier **and** store, one `$elemMatch` each, joined by `$and` (`orders/index.tsx` always sets both;
`wooMetaCarrier.identityFilter`) — sorted by date. `find` windows are the grids' real cumulative
limits (Logs starts at 20 rows, Orders at 10; scrolling adds a page each time), and `count` is the
engine's `count({ selector })`, which RxQuery normalizes to primary-key order.

## Verdict

**Both paths are unusable on premium SQLite as shipped, and the documented `queryModifier` alone
fixes neither screen: it brings every grid window to milliseconds but leaves the `count()` both
screens wait on at 7.5 s (logs) and 15.5 s (orders). A ~20-line premium patch that runs a fully
translated query and count as one statement brings a Logs keystroke to 0.38 s and an Orders pill
change to 0.72 s — and those are still full scans, which only indexed columns can remove.**

Screen-visible latency — both screens render only when `find` **and** `count` have answered, and one
worker serves both (`use-local-query.ts` `combineLatest([documents$, total$])`; `execute-query.ts`
`combineLatest([query.$, count.$])`):

| Screen action | As shipped (fallback) | With `queryModifier` | Patched (one statement) |
|---|---:|---:|---:|
| Logs: keystroke, first window of 20 (one term) | **115 s** | 7.5 s | 0.38 s |
| Logs: keystroke, two terms | **121 s** | 4.2 s | 0.38 s |
| Logs: scroll to 100 rows | **141 s** | 7.5 s | 0.39 s |
| Orders: pill change, first window of 10 | **29.7 s** | 15.5 s | 0.72 s |
| Orders: scroll to 100 rows | **32.9 s** | 15.5 s | 0.72 s |

The two halves (median ms in the worker, five runs, three for the fallback counts):

| Query | Operation | Fallback | Modifier | One statement |
|---|---|---:|---:|---:|
| Logs, one term | find 20 / 60 / 100 | 6,560 / 19,682 / 32,918 | 5.7 / 16.5 / 16.3 | 2.4 / 6.6 / 10.8 |
| Logs, one term | count (920 hits) | 108,144 | 7,494 | 378 |
| Logs, two terms (`co-balt`) | find 20 | 13,306 | 11.2 | 4.5 |
| Logs, two terms | count (460 hits) | 107,970 | 4,142 | 379 |
| Orders, cashier + store | find 10 / 50 / 100 | 459 / 1,847 / 3,675 | 2.8 / 2.6 / 7.3 | 0.6 / 2.6 / 4.9 |
| Orders, cashier + store | count (2,500 hits) | 29,274 | 15,541 | 715 |

Page-side round trips through premium's RPC add under 2 ms to any cell. Full tables, `EXPLAIN`
output and the SQL are in the generated section below.

## What the mechanism costs, not just the time

- **A fallback `find` page costs ~330 ms on logs and ~230 ms on orders**, whatever the offset. The
  WHERE-less statement premium issues keeps `INDEXED BY idx` and the grid's `ORDER BY
  JSON_EXTRACT(data,'$.timestamp') DESC, id ASC LIMIT 50 OFFSET n`; with the index's leading
  `deleted` column unconstrained it cannot supply the order, so every page sorts the whole table in a
  temp b-tree. §18 of the research measured that same statement natively at 4 ms: **wasm + the
  opfs-sahpool VFS makes it ~80x dearer.**
- **A fallback `count` page costs ~117 ms on logs and ~73 ms on orders.** RxQuery normalizes a count
  to primary-key order, so its pages are `ORDER BY id LIMIT 50 OFFSET n` on the primary key — no
  sort, but SQLite still walks `n` rows to honour the offset, so the 921 pages of a 46k-row count
  cost 108 s and the 401 pages of a 20k-row count 29 s. (An earlier run of this harness imposed the
  grid's sort on the counts and read 310 s / 95 s; superseded.)
- **A grid window needs about `1 / hit-rate` fallback pages.** Each fetched page of 50 rows yields
  `50 × h` matches: logs at 1 hit in 50 needs a page per result (20 pages for the first window,
  100 for a 100-row window, 1,000–5,000 rows parsed in JS); two terms at 1 in 100 need two pages per
  result. Orders at 1 hit in 8 need 2, 8 and 16 pages for windows of 10, 50 and 100.
- **A count pages the entire table**: 921 pages and 46,000 `JSON.parse`s on logs, 401 and 20,000 on
  orders, regardless of the term or the hit rate (one- and two-term counts agree within 0.2%).
- **With the modifier a grid window is one statement up to 50 rows and two up to 100.** The injected
  WHERE makes each 50-row page return only matches, and premium's loop stops once it holds
  `skip + limit` rows: 1.5–2.5x the floor, all in milliseconds, at every window the grids use.
- **With the modifier a count is `matches / 50 + 1` full filtered scans.** premium still pages with
  `OFFSET` and `count()` still routes through `query()`, so each statement re-walks the table far
  enough to skip the offset: 20 statements × ~375 ms for 920 logs hits (7.5 s, 20x the floor), 51 ×
  ~305 ms for 2,500 orders hits (15.5 s, 22x). It grows with matches × table size, and the Orders
  default view is exactly the query whose matches grow with the store's history.
- **Even the one-statement floor is a full scan.** 378 ms on logs and 715 ms on orders because neither
  predicate can use an index: `GLOB`/`LIKE` over JSON text, and `json_each` over every row's
  `meta_data` (plan: `SCAN json_each EXISTS VIRTUAL TABLE`). The declared RxDB index serves only the
  `deleted = ?` prefix and the sort.

## Answers

**1. The multiplier over the pushed query, on the real VFS.** Grid windows: **2,700–3,050x** for logs
search (6.6 s vs 2.4 ms at 20 rows; 32.9 s vs 10.8 ms at 100), **650–760x** for the orders scope
(459 ms vs 0.6 ms at 10 rows; 3.7 s vs 4.9 ms at 100). Counts: **285x** for logs (108 s vs 378 ms),
**41x** for orders (29.3 s vs 715 ms). Per statement, the sorted fallback page is ~80x its native
cost (§18's 4 ms) and the primary-key page ~30x. What the user sees is the sum of both halves: **115 s
for a Logs keystroke and 30 s for an Orders pill change**, in the storage worker, as shipped.

**2. `queryModifier` alone is not enough for either screen.** With the predicate rewritten to SQL
(`GLOB` for the fold-space arm; `LIKE … ESCAPE '\'` for the four case-insensitive raw arms; `EXISTS
(SELECT 1 FROM json_each(…))` per `$elemMatch`; the regex-escaped term unescaped first — verified
against the shipped fallback on the punctuation term `co-balt`), every grid window lands within
1.5–2.5x of the floor, in milliseconds. But the count survives the loop and the screens wait for it:
**7.5 s per Logs keystroke, 15.5 s per Orders pill change**. That is an order of magnitude better
than shipped and still a stall on every interaction.

**3. A full fix.** A ~20-line patch to premium's `sqlite-storage-instance.js` — let the modifier
declare the selector fully translated, then (a) run `query()` as one statement without the paging
loop and (b) run `count()` as `SELECT COUNT(1) … WHERE <modified>` — collapses the screen-visible
figures to **0.38 s (logs) and 0.72 s (orders)**: 20x over the modifier alone, 300x / 40x over
shipped, and every `JSON.parse` of a non-returned row disappears. This repo already patches premium.
Two things the patch does not buy, and which belong to the engine migration (#2150) and the topology
grilling (#2146): (i) the counts remain full scans at 0.4–0.7 s per 20–46k rows because the predicates
are unindexable as written — the durable fix for the Orders scope is to **promote `_pos_user` and
`_pos_store` to top-level engine columns at write time and index them**, which makes the default view
an index seek and removes `$elemMatch` from the hot path; (ii) `LIKE`'s case folding is ASCII-only,
which matches the raw arms' documented "ASCII-faithful, best effort" contract, and the fold arm is
exact under `GLOB`.

## Not measured here (deliberately)

Native sqlite3 or Node comparisons (§18 has the native shape); Firefox/Safari; a patched premium
build (the `direct` mode is the same statement through the same adapter and is the proxy the ticket
asked for); cold-cache latency; Unicode equivalence of the rewrite; the current OPFS engine's cost
for the same queries (that is the benchmark ticket, #2143).

## Method and limits
- 46,000 logs, padded toward 500 JSON bytes; deterministic pseudo-random background words. `quartz` appears in `context.fold` every 50 rows and `co-balt` with it every 100: 920 / 460 matches. Terms go through the same `escapeRegex` as `buildScanSearchSelector` (so the second term reaches the modifier as `co\-balt`), five arms per term as in production; raw fields use case-insensitive `LIKE … ESCAPE '\'`, the fold arm case-exact `GLOB` with `[…]`-escaped wildcards. Matches live in the fold field, as they do for every row written since it existed; the raw-field arms are exercised but never the sole hit. This is not proof of Unicode equivalence.
- 20,000 engine-shaped orders with 6–10 `meta_data` entries; four cashiers, two stores, `_pos_user` and `_pos_store` on every row. The selector is the Orders screen's default scope — cashier 1 **and** store 1, one `$elemMatch` each under `$and` — which matches 2,500 rows (1 in 8). `status` is seeded (five values) but not queried: the open-orders resource queries status alone, which SQL translates natively, and filters cashier/store in JS, so it never enters the fallback.
- Schemas declare the timestamp or date/status-date indexes; RxDB adds `deleted`/primary-key fields. `find` queries carry the grid's sort (`timestamp`/`dateCreatedGmt` desc) and its cumulative limit (20/60/100 logs, 10/50/100 orders); `count` queries are normalized as `RxQuery` does for `op === 'count'` (no sort → primary-key order). Every query includes `_deleted = false`. Raw schemas and the direct `EXPLAIN` plans are kept in `results.json`.
- Runs are serial: fallback and direct share one worker/dataset; modifier gets an identical seed in its own worker and pool. Fresh database names, 1,000-row writes, one warm-up then five samples per cell (three for a fallback count, ~1.8 min a sample on logs); instances close and workers terminate. No app observers, retention deletes or background sync. Warm-cache measurements, not cold-start latency.
- Worker time wraps the storage instance's `query()`/`count()` (a nested query is counted once); `all() ms` sums adapter call time. Calls and rows-to-JS count every row SQLite returned, including the count scalar and the final empty fallback page; they do not count SQLite's internal row visits. Seeding, `EXPLAIN`, validation and metrics retrieval are untimed.
- Page timing covers premium's worker RPC for fallback/modifier; direct uses a separate type-tagged message on the same worker and returns equivalent documents/count. Direct worker time is one statement plus document `JSON.parse`, no paging, no matcher. No patched premium build was run; direct is the proxy the ticket asked for, not a measurement of a patch.
- Every sample checks exact ordered ids / count across all three modes and the expected cardinality, so the modifier's rewrite (including the unescaping) is verified against the shipped matcher on every cell. The screen-visible table sums the median find and median count of the same mode; the two requests are issued together and serialize on the one worker.
- An earlier run of this harness (superseded, kept in the PR history) used a cashier-only orders selector, an open-status variant that is not a fallback path, a fixed limit of 50, and the grid sort on counts; it read 310 s / 95 s for the counts. Those figures are withdrawn.

<!-- generated:start -->
Environment: `{"chrome":"154.0.8037.44","node":"v24.14.0","os":"darwin 25.6.0 arm64","cpu":"Apple M4 Pro","versions":{"rxdb":"17.4.0","rxdb-premium":"17.4.0","@sqlite.org/sqlite-wasm":"3.53.4-build1","esbuild":"0.28.2"},"measuredAt":"2026-09-18T00:43:03.794Z","vfs":"opfs-sahpool","journal":"WAL"}`

Rows: {"logs":46000,"orders":20000}; mean JSON bytes: {"logs":500,"orders":851.9762}.

All timing/count cells are median / max of five runs after one discarded warm-up (three runs for a fallback count, which pages the whole table). Times in ms.

### logs-1

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find20 | fallback | 6560.00 / 6587.80 | 6557.40 / 6585.80 | 6560.00 / 6587.90 | 20.00 / 20.00 | 1000.00 / 1000.00 | 20.00 / 20.00 | 2733.33× | 2733.33× |
| find20 | direct | 2.40 / 2.60 | 2.30 / 2.60 | 2.40 / 2.60 | 1.00 / 1.00 | 20.00 / 20.00 | 20.00 / 20.00 | 1.00× | 1.00× |
| find60 | fallback | 19682.10 / 19740.80 | 19677.10 / 19734.60 | 19683.50 / 19742.30 | 60.00 / 60.00 | 3000.00 / 3000.00 | 60.00 / 60.00 | 2982.14× | 2894.63× |
| find60 | direct | 6.60 / 6.70 | 6.60 / 6.70 | 6.80 / 6.80 | 1.00 / 1.00 | 60.00 / 60.00 | 60.00 / 60.00 | 1.00× | 1.00× |
| find100 | fallback | 32917.60 / 33207.20 | 32909.60 / 33198.60 | 32917.90 / 33207.50 | 100.00 / 100.00 | 5000.00 / 5000.00 | 100.00 / 100.00 | 3047.93× | 3019.99× |
| find100 | direct | 10.80 / 10.90 | 10.70 / 10.80 | 10.90 / 11.00 | 1.00 / 1.00 | 100.00 / 100.00 | 100.00 / 100.00 | 1.00× | 1.00× |
| count | fallback | 108143.70 / 108677.00 | 108070.30 / 108601.90 | 108143.80 / 108677.30 | 921.00 / 921.00 | 46000.00 / 46000.00 | 920.00 / 920.00 | 285.94× | 285.79× |
| count | direct | 378.20 / 383.50 | 378.20 / 383.50 | 378.40 / 383.50 | 1.00 / 1.00 | 1.00 / 1.00 | 920.00 / 920.00 | 1.00× | 1.00× |
| find20 | modifier | 5.70 / 6.10 | 5.50 / 5.80 | 5.80 / 6.10 | 1.00 / 1.00 | 50.00 / 50.00 | 20.00 / 20.00 | 2.38× | 2.42× |
| find60 | modifier | 16.50 / 17.00 | 16.30 / 16.60 | 16.70 / 17.00 | 2.00 / 2.00 | 100.00 / 100.00 | 60.00 / 60.00 | 2.50× | 2.46× |
| find100 | modifier | 16.30 / 16.40 | 16.10 / 16.30 | 16.50 / 16.50 | 2.00 / 2.00 | 100.00 / 100.00 | 100.00 / 100.00 | 1.51× | 1.51× |
| count | modifier | 7494.40 / 7751.90 | 7492.90 / 7750.40 | 7495.90 / 7752.70 | 20.00 / 20.00 | 920.00 / 920.00 | 920.00 / 920.00 | 19.82× | 19.81× |

### logs-2

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find20 | fallback | 13306.10 / 13412.70 | 13302.00 / 13408.50 | 13306.30 / 13414.00 | 40.00 / 40.00 | 2000.00 / 2000.00 | 20.00 / 20.00 | 2956.91× | 2892.67× |
| find20 | direct | 4.50 / 4.80 | 4.50 / 4.70 | 4.60 / 4.80 | 1.00 / 1.00 | 20.00 / 20.00 | 20.00 / 20.00 | 1.00× | 1.00× |
| count | fallback | 107969.60 / 108078.80 | 107903.80 / 108010.70 | 107971.00 / 108078.90 | 921.00 / 921.00 | 46000.00 / 46000.00 | 460.00 / 460.00 | 284.88× | 284.81× |
| count | direct | 379.00 / 382.80 | 379.00 / 382.80 | 379.10 / 382.90 | 1.00 / 1.00 | 1.00 / 1.00 | 460.00 / 460.00 | 1.00× | 1.00× |
| find20 | modifier | 11.20 / 11.50 | 11.10 / 11.40 | 11.30 / 11.60 | 1.00 / 1.00 | 50.00 / 50.00 | 20.00 / 20.00 | 2.49× | 2.46× |
| count | modifier | 4142.10 / 4336.20 | 4141.40 / 4335.20 | 4142.20 / 4336.40 | 11.00 / 11.00 | 460.00 / 460.00 | 460.00 / 460.00 | 10.93× | 10.93× |

### orders

| Operation | Mode | Worker ms | all() ms | Page ms | all() calls | Rows to JS | Matches | Worker / direct | Page / direct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| find10 | fallback | 458.60 / 464.50 | 458.10 / 464.20 | 459.10 / 464.70 | 2.00 / 2.00 | 100.00 / 100.00 | 10.00 / 10.00 | 764.33× | 655.86× |
| find10 | direct | 0.60 / 0.70 | 0.60 / 0.70 | 0.70 / 0.80 | 1.00 / 1.00 | 10.00 / 10.00 | 10.00 / 10.00 | 1.00× | 1.00× |
| find50 | fallback | 1846.50 / 2079.20 | 1845.40 / 2077.90 | 1846.80 / 2079.50 | 8.00 / 8.00 | 400.00 / 400.00 | 50.00 / 50.00 | 710.19× | 659.57× |
| find50 | direct | 2.60 / 2.80 | 2.60 / 2.70 | 2.80 / 2.90 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| find100 | fallback | 3674.50 / 3686.00 | 3673.30 / 3684.20 | 3675.00 / 3687.10 | 16.00 / 16.00 | 800.00 / 800.00 | 100.00 / 100.00 | 749.90× | 693.40× |
| find100 | direct | 4.90 / 5.00 | 4.80 / 4.90 | 5.30 / 5.40 | 1.00 / 1.00 | 100.00 / 100.00 | 100.00 / 100.00 | 1.00× | 1.00× |
| count | fallback | 29273.60 / 29285.40 | 29241.40 / 29254.80 | 29274.70 / 29285.80 | 401.00 / 401.00 | 20000.00 / 20000.00 | 2500.00 / 2500.00 | 40.95× | 40.90× |
| count | direct | 714.90 / 724.60 | 714.90 / 724.60 | 715.70 / 724.70 | 1.00 / 1.00 | 1.00 / 1.00 | 2500.00 / 2500.00 | 1.00× | 1.00× |
| find10 | modifier | 2.80 / 3.00 | 2.60 / 2.70 | 2.90 / 3.00 | 1.00 / 1.00 | 50.00 / 50.00 | 10.00 / 10.00 | 4.67× | 4.14× |
| find50 | modifier | 2.60 / 2.70 | 2.40 / 2.60 | 2.80 / 2.80 | 1.00 / 1.00 | 50.00 / 50.00 | 50.00 / 50.00 | 1.00× | 1.00× |
| find100 | modifier | 7.30 / 7.30 | 7.10 / 7.20 | 7.60 / 7.70 | 2.00 / 2.00 | 100.00 / 100.00 | 100.00 / 100.00 | 1.49× | 1.43× |
| count | modifier | 15540.80 / 15651.00 | 15536.40 / 15645.90 | 15541.00 / 15652.30 | 51.00 / 51.00 | 2500.00 / 2500.00 | 2500.00 / 2500.00 | 21.74× | 21.71× |

### Screen-visible latency: find + count on one worker (median ms)

| Query | Window | Fallback | Modifier | One statement |
|---|---|---:|---:|---:|
| logs-1 | find20 | 114703.7 | 7500.1 | 380.6 |
| logs-1 | find60 | 127825.8 | 7510.9 | 384.8 |
| logs-1 | find100 | 141061.3 | 7510.7 | 389.0 |
| logs-2 | find20 | 121275.7 | 4153.3 | 383.5 |
| orders | find10 | 29732.2 | 15543.6 | 715.5 |
| orders | find50 | 31120.1 | 15543.4 | 717.5 |
| orders | find100 | 32948.1 | 15548.1 | 719.8 |

### Direct query plans (observed)

- **logs-1/find20** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 20
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-1/find60** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 60
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-1/find100** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 100
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-1/count** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?)

```sql
SELECT COUNT(1) AS count FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?)
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%",false]`

- **logs-2/find20** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?); USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND ((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.timestamp') desc,id asc LIMIT 20
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%","*co-balt*","%co-balt%","%co-balt%","%co-balt%","%co-balt%",false]`

- **logs-2/count** — declared RxDB index mentioned: **yes**. SEARCH logs-0 USING INDEX rxdbspike2145-fallback-xvmbmhpgzrpn_logs_0__deleted_timestamp_id_idx (deleted=?)

```sql
SELECT COUNT(1) AS count FROM "logs-0" WHERE (((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND ((JSON_EXTRACT(data, '$.context.fold') GLOB ?) OR (JSON_EXTRACT(data, '$.message') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.error') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.errorCode') LIKE ? ESCAPE '\') OR (JSON_EXTRACT(data, '$.context.search') LIKE ? ESCAPE '\')) AND deleted = ?)
```
Parameters: `["*quartz*","%quartz%","%quartz%","%quartz%","%quartz%","*co-balt*","%co-balt%","%co-balt%","%co-balt%","%co-balt%",false]`

- **orders/find10** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-ftqkwzqzatmg_orders_0__deleted_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "orders-0" WHERE ((EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.dateCreatedGmt') desc,id asc LIMIT 10
```
Parameters: `["_pos_user","1","_pos_store","1",false]`

- **orders/find50** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-ftqkwzqzatmg_orders_0__deleted_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "orders-0" WHERE ((EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.dateCreatedGmt') desc,id asc LIMIT 50
```
Parameters: `["_pos_user","1","_pos_store","1",false]`

- **orders/find100** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-ftqkwzqzatmg_orders_0__deleted_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; USE TEMP B-TREE FOR LAST TERM OF ORDER BY

```sql
SELECT data FROM "orders-0" WHERE ((EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND deleted = ?) ORDER BY JSON_EXTRACT(data, '$.dateCreatedGmt') desc,id asc LIMIT 100
```
Parameters: `["_pos_user","1","_pos_store","1",false]`

- **orders/count** — declared RxDB index mentioned: **yes**. SEARCH orders-0 USING INDEX rxdbspike2145-fallback-ftqkwzqzatmg_orders_0__deleted_status_dateCreatedGmt_uuid_idx (deleted=?); SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:; SCAN json_each EXISTS VIRTUAL TABLE INDEX 1:

```sql
SELECT COUNT(1) AS count FROM "orders-0" WHERE ((EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND (EXISTS (SELECT 1 FROM json_each(JSON_EXTRACT(data, '$.payload.meta_data')) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)) AND deleted = ?)
```
Parameters: `["_pos_user","1","_pos_store","1",false]`

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
bash spikes/2145-query-paths/run.sh        # ~50 min: the fallback counts are ~1.8 min a sample
node spikes/2145-query-paths/report.mjs    # tables only, from results.json
```

Needs spike 2138's built clone at `spikes/2138-rxdb-sqlite-wasm/.rxdb-src/` (its runner creates it;
this spike only symlinks its `node_modules`). All generated output stays under this spike's
gitignored `.rxdb-src/`; `results.json` is the tracked raw evidence.
