# Spike 2210 — premium SQLite on `node:sqlite` vs the shipped filesystem-node engine, in plain Node

Measured 2026-09-23. Ticket: [wcpos/monorepo#2210](https://github.com/wcpos/monorepo/issues/2210)
(wayfinder map #2137). Desktop's engine was already ruled in
[#2149](https://github.com/wcpos/monorepo/issues/2149): premium `storage-sqlite` on `node:sqlite` in
the Electron main process, `better-sqlite3` as the fallback if the binding failed verification. This
is the evidence that ruling said it rests on; it gates the migration (#2150), not the choice. Nothing
here ships. Two engines, both called directly in plain Node on the same throwaway schemas, fixtures
and query shapes as [spike 2143](../2143-storage-benchmark/RESULTS.md): the incumbent
`filesystem-node` (premium abstract-filesystem over Node `fs`, `inWorker: false`, the seven install
patches, the Electron task-queue lock — what wcpos/electron ships) and `sqlite-node` (premium
`getRxStorageSQLite` over premium's own shipped `getSQLiteBasicsNodeNative(DatabaseSync)`, WAL,
`synchronous = NORMAL`, one translated statement per supported query, `ANALYZE` after the seed).
Every timed sample's content is SHA-256-checked across engines; every run reported here passed.

**Environments.** Mac: Apple M4 Pro, macOS (darwin 27.0.0 arm64), Node 24.14.0 with SQLite 3.51.2
for legs 2 and 3. Windows: GitHub `windows-latest` (Windows 10.0.26100, AMD EPYC 9V74 shared runner,
NTFS), Node 24.20.0 with SQLite 3.53.4 — a CI VM, so read its ratios, not its absolutes. Leg 1 ran on
the Node **inside Electron 43.4.0**: Node 24.18.1, SQLite 3.53.1 (`ELECTRON_RUN_AS_NODE=1` against the
pinned binary). rxdb / rxdb-premium 17.4.0, esbuild 0.28.2; premium patch marker count 47 on both
platforms (the same seven patches wcpos/electron mirrors).

## Answers

**1. Leg 1 — conformance on Electron's Node: PASS, `better-sqlite3` is not needed.** rxdb 17.4.0's own
unit suite with `DEFAULT_STORAGE=custom` = premium SQLite over `getSQLiteBasicsNodeNative(DatabaseSync)`
from `node:sqlite`, run by Electron 43.4.0's bundled Node: **1428 passing, 0 failing, exit 0**
(`conformance/node-conformance-summary.log`; the runtime line reads `electron=43.4.0 node=24.18.1
sqlite=3.53.1 journal_mode=wal`). The storage conformance block
(`rx-storage-implementations.test.ts`) passed with `hasMultiInstance`, `hasAttachments` and
`hasReplication` all true. The "Release candidate" stability label on `node:sqlite` produced no
failure; the two failures on the way were the environment, not the binding (a WebRTC native module
that npm's `ignore-scripts` had left unbuilt, and a test that spawns `mocha` from `PATH`). The shipped
wrapper needed no adapter of ours beyond one `PRAGMA synchronous = NORMAL` after open.

**2. Leg 2 — process stop: SQLite lost nothing acknowledged in 60 of 60 trials; the incumbent lost
acknowledged rows in 8 of 30 on each platform.** A child process streams `bulkWrite` transactions
(sizes 1,1,3,1,50,1,1,1000 repeating, 20% updates) through each engine and reports each one as acked
only after the call resolves; the parent ends it with signal 9 at a random point in the first 3 s and
a fresh process scores the reopened database against the parent's record.

| Platform | Row | Trials | ok | acked rows lost | repaired on reopen | in-flight present / absent | median reopen |
|---|---|---|---|---|---|---|---|
| Mac | filesystem-node | 30 | 22 | **8** | 30 | 2 / 28 | 481 ms |
| Mac | sqlite-node | 30 | **30** | 0 | 0 | 11 / 18 | 539 ms |
| Windows | filesystem-node | 30 | 22 | **8** | 30 | 0 / 29 | 645 ms |
| Windows | sqlite-node | 30 | **30** | 0 | 0 | 10 / 19 | 938 ms |

The incumbent's losses are the shape rxdb-premium-issues#28 describes: the *last* acknowledged
transactions before the stop are gone — typically the two 1-row writes acked just before an in-flight
1000-row batch (2 rows lost), the 1+1+3+1 acked before a 50-row batch (6 rows), and in five trials
200 rows of an **acknowledged** 1000-row batch that was only partly on disk. It acknowledges before
the bytes are durable. On every one of the 60 reopens its changelog was found stale and the wcpos
index-rebuild patch rebuilt the indexes from `documents.json` (`__wcposOnIndexRebuild`,
`stale-changelog-op`); an unpatched premium would not have that repair. SQLite in WAL with
`synchronous = NORMAL` reopened clean every time (`PRAGMA integrity_check` = `ok`), and the in-flight
1000-row batch was either wholly present (its COMMIT had landed before the ack was delivered) or
wholly absent, never partial. Not measured: power loss (no process-level harness can), and the
Electron IPC bridge (out of scope by design).

**3. Leg 3 — speed: the same three families as web, with the same winner in each on both
platforms.** Large scale (20,000 products and orders), p50, incumbent → SQLite, Mac / Windows:

- **Indexed and pushed queries: SQLite, by one to three orders of magnitude.** The Orders default
  scope find (`$elemMatch` ×2, sorted, limit 10): 233 → 1.0 ms / 685 → 4.1 ms (×228 / ×166); the
  100-id `remoteId $in` find 93 → 1.1 / 248 → 4.9 (×88 / ×51) and its count 97 → 0.6 / 248 → 3.6
  (×169 / ×69); the hypothetical pushed products grid (sort by name, limit 10) 218 → 0.15 /
  920 → 0.7 ms (×1485 / ×1271). As on web, the incumbent's sorted-limit path is slower than its own
  unsorted full read.
- **Whole-document reads: the incumbent, by 1.3–7×.** The catalogue-blob read (every product
  document, what `catalogue-search-blob.ts` does on every open): 58 → 328 ms on the Mac, 158 → 1190
  on the runner (×0.18 / ×0.13). The grid as issued today (15,337 whole rows): 123 → 203 / 425 → 713
  (×0.6). The JSON-scanned orders count is a wash (229 vs 232 / 692 vs 897). The open-status read
  (12,000 rows) is the one straddle that is not a sub-millisecond tie: the incumbent wins it on the
  Mac (136 vs 180) and SQLite wins it on the runner (579 vs 453); Windows decides, but it is a whole-set
  read either way and the migration's condition (i) removes the shape. **The projection read
  (condition ii) closes the gap to parity**: 58 vs 64 ms on the Mac, 153 vs 184 on the runner (×0.9 /
  ×0.8) — the full read was never the cost, marshalling whole documents was.
- **Writes and open: SQLite.** The three-write cart line add: 27 → 0.23 ms / 59 → 0.86 ms (×121 /
  ×68) — the incumbent's cost grows with the table (2.2 ms at 2k), SQLite's does not. Order create is
  a tie under 0.4 ms. A full 20,000-product resync: 1.15 s → 0.50 s / 3.2 s → 1.0 s (×2.3 / ×3.2).
  **Cold open to first read on the 20k database: 138 → 2.9 ms / 370 → 6.3 ms (×48 / ×59)** — the
  incumbent loads its store into memory on open; that is where its whole-read speed comes from and
  why it is undurable (research §1). `findDocumentsById` is 0.1–0.5 ms on SQLite against 0.03–0.35 ms
  on the memory-resident incumbent: slower by ratio, irrelevant in absolute terms.
- **Disk:** 201 MB in 3 files (SQLite, WAL + shm) against 151 MB in 26 files for the large seed, on
  both platforms.

At the small scale (2,000 rows) every ratio has the same sign with smaller magnitude; the incumbent's
whole-set reads are 5–17 ms there, SQLite's 17–84 ms.

**4. The gate: SQLite clears stability and wins clearly on desktop speed, conditional on the same
three migration items as web.** Stability: 60/60 stops kept every acknowledged row and every reopen
was clean, against 16/60 stops that lost acknowledged rows on the engine we ship. Speed: on every
interactive path the app *could* push, SQLite wins by 50–1500×, on the cart write by 68–121×, on cold
open by ~50×; it loses only the whole-document reads the app makes *today*, and the projection cell
shows condition (ii) closes that loss to parity. Windows agrees with the Mac on the winner of every
cell except three (two sub-millisecond `order-create` ties and `orders-open-status`, above); the
Windows runner widens SQLite's whole-read penalty (×0.13 on the blob) and narrows nothing else, so the
conditions are not optional on the platform that carries most tills. Numbers do not decide: anything
about the IPC bridge (both engines sit behind `exposeRxStorageRemote` in Electron; its tax is the
same for both), power-loss durability, native (#2091), or the second-window fog on the map.

## Two defects the harness found on the way

- **The incumbent returns whole-set finds in an unstable order in Node.** RxDB promises the
  normalized sort (for a no-sort products query that is `[_deleted, stockStatus, uuid]`); the
  incumbent's 15,337-row grid read came back in a different order on repeated runs of the identical
  query — 3 of 8 results out of order on the Mac, 8 of 8 on the Windows runner (`unsortedSamples` in
  `results.*.json`; the probe that found it showed the same set every time with chunk boundaries
  such as `…00007037, 00003501…`, i.e. page reads merged in completion order). The 2143 browser runs
  never saw this: the OPFS worker reads synchronously; Node `fs` is async. The app's products grid
  re-sorts in JS today, which is presumably why nobody noticed. SQLite's order was stable in every
  sample. Recorded, not repaired.
- **One intermittent cross-engine content mismatch on Windows** (run 2 of 3, `large/products-grid-pushed-50`:
  sort by name, limit 50 — the two engines returned different top-50 sets once). It did not recur in
  run 3, which is the run reported here, and the Mac never produced it. The harness now records both
  engines' returned ids on any mismatch so a recurrence identifies the deviating engine; with the
  order defect above on the same engine, the incumbent's limited sorted read is the suspect, not
  SQLite's `ORDER BY … LIMIT`.

## Method and limits

- Both engines are called in-process on their storage-instance methods; timing is
  `performance.now()` around the direct call. No worker, no IPC, no Electron window — so these
  numbers are engine costs, and the IPC bridge's tax (identical for both) is not in them.
- `filesystem-node` is the raw installed premium engine (47 patch-marker lines across the
  abstract-filesystem plugin) with wcpos/electron's `createStorageLock()` copied verbatim; no
  `withTargetedOpfsRecovery` wrapper. `sqlite-node` is premium's shipped `getSQLiteBasicsNodeNative`
  with one `open` wrapper (`PRAGMA synchronous = NORMAL`); a second read-only connection proves
  `journal_mode = wal` in every leg. The `query`/`count` wrapper (one translated statement for the
  selectors this workload uses, premium's own path otherwise) is 2143's, and is the in-harness
  equivalent of the ~20-line premium patch spike 2145 recommended.
- Schemas, fixtures (seed 2143, byte-identical to the web spike's), declared indexes, cells and
  sample counts are 2143's (one discarded warm-up; N = 7; N = 25 for the two write cells; N = 3 for
  full seeds and cold reads; p50/p95 by nearest rank, so p95 is the max at N ≤ 7). Cross-engine checks
  compare canonical, `_rev`-independent content per sample sorted by primary key; a content mismatch
  fails the run (exit 1 after writing the JSON). Returned order is compared separately and recorded.
- Cold open spawns a fresh Node process per sample (module load outside the timer; storage
  construction, instance creation and the first `findDocumentsById` inside); the OS page cache is
  warm. Disk bytes are the row's data directory after the large seed.
- The stop harness scores like 2144: `open-failed` (10 s of retries), `integrity-failed`
  (`PRAGMA integrity_check` for SQLite; a reported failure, parse error or corruption in the
  incumbent's console/hook output — a completed repair is recorded as `repairs`, not as failure),
  `lost` (an acked row missing under 2144's ownership replay), `partial`, `ok`. The acked set is the
  parent's IPC record; nothing is reconstructed from the database. Stops are process-level (signal 9;
  `TerminateProcess` on Windows). Power loss is not simulated.
- Leg 1 runs rxdb's suite with Electron's binary as the Node executable (a `node` shim on `PATH` so
  the test that spawns `mocha` runs there too); it is Mac-only. 2138's wasm-in-Node run of the same
  suite passed 1416 tests — the count differs because the WebRTC tests now run.
- Windows ran on a shared GitHub runner from bundles built on Ubuntu
  (`spike-2210-desktop-engine.yml`, Node 24 from `setup-node`; nothing else installed).

## Reproduce

```bash
bash spikes/2210-desktop-engine/conformance/run-conformance.sh   # leg 1 on Electron 43.4.0's Node (Mac; ~5 min after setup)
bash spikes/2210-desktop-engine/run.sh --legs 3,2 --trials 30       # legs 3 and 2 on this machine, then report
gh workflow run spike-2210-desktop-engine.yml --ref <branch>        # Windows (dispatch needs the file on the default branch)
gh run download <run-id> -n spike-2210-results-windows -D spikes/2210-desktop-engine/
node spikes/2210-desktop-engine/report.mjs
```

`.deps/` (Electron 43.4.0, ~100 MB; npm's `ignore-scripts` means `node install.js` runs by hand),
`conformance/.rxdb-src/` (the rxdb 17.4.0 clone) and `.data/` are gitignored and recreated by the
runners.

<!-- generated:start -->
## Leg 1

```text
# Node conformance summary (rxdb 17.4.0, DEFAULT_STORAGE=custom)
spike-2210 runtime: electron=43.4.0 node=24.18.1 sqlite=3.53.1 journal_mode=wal
spike-2210 runtime: electron=43.4.0 node=24.18.1 sqlite=3.53.1 journal_mode=wal
init.test.ts;util.test.js;vector-distance.test.ts;custom-index.test.ts;query-planner.test.js;doc-cache.test.ts;internal-indexes.test.js;rx-storage-implementations.test.ts (implementation: sqlite-node-native);rx-storage-query-correctness.test.ts;rx-storage-helper.test.ts;instance-of-check.test.js;rx-schema.test.ts;bug-report.test.js;rx-database.test.ts;rx-document.test.js;rx-collection.test.ts;validate.test.js (ajv) ;validate.test.js (z-schema) ;validate.test.js (custom formats) ;rx-query.test.ts;cross-instance.test.js;local-documents.test.ts;change-event-buffer.test.js;reactive-query.test.js;key-compression.test.js;event-reduce.test.js;cache-replacement-policy.test.js;query-builder.test.js;idle-queue.test.js;reactivity.test.ts;reactive-collection.test.js;reactive-document.test.js;cleanup.test.js;hooks.test.js;rx-pipeline.test.js;orm.test.js;replication-protocol.test.ts (implementation: sqlite-node-native);replication.test.ts;replication-multiinstance.test.ts;replication-graphql.test.ts;replication-websocket.test.ts;replication-webrtc.test.ts;encryption.test.ts;rx-state.test.ts (useSchemaValidator: true);rx-state.test.ts (useSchemaValidator: false);migration-schema.test.ts;attachments.test.ts;attachments-compression.test.ts (mode: deflate);attachments-compression.test.ts (mode: gzip);migration-storage.test.ts (prev-major to newest (dexie));migration-storage.test.ts (newest to newest);webmcp.test.ts;crdt.test.ts;population.test.js;leader-election.test.js;backup.test.ts;import-export.test.js;database-lifecycle.ts;plugin.test.js;last.test.ts (sqlite-node-native);
conformance block ticks: 62
  1428 passing (2m)
Node suite exit code: 0
Electron runtime evidence check exit code: 0
```


## mac

### Leg 3 — results.mac.json

| Environment | Value |
| --- | --- |
| os | darwin 27.0.0 arm64 |
| platform | mac |
| cpu | Apple M4 Pro |
| node | 24.14.0 |
| sqlite | 3.51.2 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| esbuild | 0.28.2 |
| premiumPatchMarkerCount | 47 |
| measuredAt | 2026-09-23T15:03:23.960Z |

All warmups and samples matched across both engines on content (SHA-256 of canonical revision-independent rows sorted by primary key); cells whose RETURNED order differed between engines carry orderMismatch, and each engine's unsortedSamples counts results that violate the query's normalized sort. Cold reads assert the exact seeded product.

#### small

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped | 5.96 / 6.30 | 16.73 / 17.07 | 0.36 |
| products-grid-pushed-10 | 5.94 / 6.48 | 0.12 / 0.15 | 49.03 |
| products-grid-pushed-50 | 5.88 / 6.45 | 0.56 / 0.58 | 10.59 |
| products-catalogue-blob | 5.05 / 5.15 | 23.08 / 24.43 | 0.22 |
| products-catalogue-projection — projection (condition ii) | 5.27 / 5.79 | 6.06 / 6.43 | 0.87 |
| products-findByIds-10 | 0.03 / 0.04 | 0.10 / 0.10 | 0.32 |
| products-findByIds-50 | 0.13 / 0.14 | 0.37 / 0.40 | 0.36 |
| products-remoteId-in-find | 8.30 / 8.72 | 0.90 / 0.91 | 9.26 |
| products-remoteId-in-count | 8.16 / 8.80 | 0.44 / 0.44 | 18.53 |
| seed-products | 17.41 / 17.82 | 42.64 / 44.39 | 0.41 |
| orders-default-find-10 | 12.63 / 13.43 | 0.93 / 1.09 | 13.54 |
| orders-default-find-50 | 12.37 / 13.37 | 4.44 / 4.50 | 2.79 |
| orders-default-count | 12.49 / 12.85 | 20.37 / 54.19 | 0.61 |
| orders-open-status | 6.99 / 7.52 | 18.17 / 18.76 | 0.38 |
| order-line-add | 2.24 / 2.38 | 0.22 / 0.25 | 10.24 |
| order-create | 0.05 / 0.11 | 0.10 / 0.13 | 0.54 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2758.653}.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2758.653}.

#### large

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped (returned order differed) | 123.21 / 139.12 ⚠ 3/8 unsorted | 202.84 / 204.03 | 0.61 |
| products-grid-pushed-10 | 218.26 / 234.23 | 0.15 / 0.16 | 1484.73 |
| products-grid-pushed-50 | 218.62 / 225.75 | 0.71 / 0.72 | 307.29 |
| products-catalogue-blob | 57.87 / 83.58 | 328.01 / 344.22 | 0.18 |
| products-catalogue-projection — projection (condition ii) | 58.30 / 83.35 | 64.34 / 66.72 | 0.91 |
| products-findByIds-10 | 0.03 / 0.03 | 0.11 / 0.12 | 0.29 |
| products-findByIds-50 | 0.14 / 0.16 | 0.46 / 0.50 | 0.31 |
| products-remoteId-in-find | 93.20 / 94.29 | 1.06 / 1.32 | 87.64 |
| products-remoteId-in-count | 96.82 / 123.48 | 0.57 / 0.62 | 168.89 |
| seed-products | 1154.77 / 1167.54 | 501.97 / 503.97 | 2.30 |
| orders-default-find-10 | 233.33 / 258.53 | 1.02 / 1.04 | 228.20 |
| orders-default-find-50 | 225.80 / 235.72 | 5.14 / 5.23 | 43.90 |
| orders-default-count | 228.97 / 236.06 | 231.92 / 234.20 | 0.99 |
| orders-open-status | 136.33 / 161.14 | 180.30 / 196.60 | 0.76 |
| order-line-add | 27.44 / 38.79 | 0.23 / 0.24 | 120.73 |
| order-create | 0.09 / 0.16 | 0.09 / 0.12 | 0.96 |
| cold-open-first-read | 138.01 / 138.05 | 2.88 / 2.90 | 48.00 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- filesystem-node disk-bytes after large seed: 151012993; files: 26.

- filesystem-node cold-open-first-read: 138.01 / 138.05 ms; N=3, fresh Node processes, warm OS page cache.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- sqlite-node disk-bytes after large seed: 201168360; files: 3.

- sqlite-node cold-open-first-read: 2.88 / 2.90 ms; N=3, fresh Node processes, warm OS page cache.

### Leg 2 — crash.mac.json

| Environment | Value |
| --- | --- |
| os | darwin 27.0.0 arm64 |
| platform | mac |
| cpu | Apple M4 Pro |
| node | 24.14.0 |
| sqlite | 3.51.2 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| esbuild | 0.28.2 |
| premiumPatchMarkerCount | 0 |
| measuredAt | 2026-09-23T14:57:20.351Z |

Complete: 30 trials requested per selected row.

| Row | Trials | ok | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present | In-flight absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| filesystem-node | 30 | 22 | 0 | 0 | 8 | 0 | 30 | 8 / 0 | 2 | 28 | 0 / 0 / 0 | 481.02 |
| sqlite-node | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 11 | 18 | 0 / 1 / 0 | 538.97 |


## windows

### Leg 3 — results.windows.json

| Environment | Value |
| --- | --- |
| os | win32 10.0.26100 x64 |
| platform | windows |
| cpu | AMD EPYC 9V74 80-Core Processor                 |
| node | 24.20.0 |
| sqlite | 3.53.4 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| esbuild | 0.28.2 |
| premiumPatchMarkerCount | 47 |
| measuredAt | 2026-09-23T15:02:59.633Z |

All warmups and samples matched across both engines on content (SHA-256 of canonical revision-independent rows sorted by primary key); cells whose RETURNED order differed between engines carry orderMismatch, and each engine's unsortedSamples counts results that violate the query's normalized sort. Cold reads assert the exact seeded product.

#### small

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped | 16.88 / 22.00 | 50.84 / 51.25 | 0.33 |
| products-grid-pushed-10 | 16.51 / 20.04 | 0.52 / 0.83 | 31.47 |
| products-grid-pushed-50 | 15.68 / 18.14 | 2.32 / 2.54 | 6.76 |
| products-catalogue-blob | 14.31 / 17.66 | 84.22 / 87.07 | 0.17 |
| products-catalogue-projection — projection (condition ii) | 14.02 / 16.39 | 21.08 / 23.59 | 0.67 |
| products-findByIds-10 | 0.11 / 0.13 | 0.48 / 0.53 | 0.22 |
| products-findByIds-50 | 0.35 / 0.53 | 1.67 / 1.97 | 0.21 |
| products-remoteId-in-find | 22.47 / 25.02 | 3.34 / 3.95 | 6.73 |
| products-remoteId-in-count | 21.37 / 23.32 | 2.16 / 2.37 | 9.89 |
| seed-products | 48.71 / 48.94 | 82.03 / 84.24 | 0.59 |
| orders-default-find-10 | 35.88 / 40.95 | 3.26 / 3.62 | 11.00 |
| orders-default-find-50 | 32.72 / 36.90 | 17.04 / 22.04 | 1.92 |
| orders-default-count | 33.02 / 40.86 | 78.42 / 81.32 | 0.42 |
| orders-open-status | 19.71 / 20.80 | 64.84 / 73.61 | 0.30 |
| order-line-add | 6.74 / 25.86 | 0.75 / 0.86 | 8.94 |
| order-create | 0.37 / 0.53 | 0.28 / 0.59 | 1.32 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2758.653}.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2758.653}.

#### large

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped (returned order differed) | 424.58 / 481.83 ⚠ 8/8 unsorted | 712.95 / 736.05 | 0.60 |
| products-grid-pushed-10 | 920.13 / 1031.01 | 0.72 / 6.93 | 1271.07 |
| products-grid-pushed-50 | 912.94 / 1011.06 | 3.18 / 3.42 | 286.82 |
| products-catalogue-blob | 157.78 / 159.87 | 1190.05 / 1237.84 | 0.13 |
| products-catalogue-projection — projection (condition ii) | 153.22 / 162.39 | 184.34 / 196.33 | 0.83 |
| products-findByIds-10 | 0.08 / 0.10 | 0.55 / 0.59 | 0.15 |
| products-findByIds-50 | 0.35 / 0.49 | 2.55 / 2.72 | 0.14 |
| products-remoteId-in-find | 248.01 / 379.27 | 4.89 / 5.58 | 50.72 |
| products-remoteId-in-count | 248.15 / 384.71 | 3.61 / 4.19 | 68.73 |
| seed-products | 3217.72 / 3293.56 | 1019.09 / 1053.48 | 3.16 |
| orders-default-find-10 | 684.99 / 857.80 | 4.13 / 5.72 | 165.83 |
| orders-default-find-50 | 685.54 / 713.89 | 19.18 / 19.49 | 35.74 |
| orders-default-count | 692.12 / 996.31 | 897.17 / 901.25 | 0.77 |
| orders-open-status | 578.64 / 599.18 | 452.56 / 545.06 | 1.28 |
| order-line-add | 58.51 / 211.03 | 0.86 / 1.08 | 67.73 |
| order-create | 0.36 / 0.50 | 0.27 / 0.34 | 1.33 |
| cold-open-first-read | 369.79 / 375.03 | 6.26 / 17.60 | 59.03 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- filesystem-node disk-bytes after large seed: 151012993; files: 26.

- filesystem-node cold-open-first-read: 369.79 / 375.03 ms; N=3, fresh Node processes, warm OS page cache.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- sqlite-node disk-bytes after large seed: 201164264; files: 3.

- sqlite-node cold-open-first-read: 6.26 / 17.60 ms; N=3, fresh Node processes, warm OS page cache.

### Leg 2 — crash.windows.json

| Environment | Value |
| --- | --- |
| os | win32 10.0.26100 x64 |
| platform | windows |
| cpu | AMD EPYC 9V74 80-Core Processor                 |
| node | 24.20.0 |
| sqlite | 3.53.4 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| esbuild | 0.28.2 |
| premiumPatchMarkerCount | 47 |
| measuredAt | 2026-09-23T15:06:08.811Z |

Complete: 30 trials requested per selected row.

| Row | Trials | ok | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present | In-flight absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| filesystem-node | 30 | 22 | 0 | 0 | 8 | 0 | 30 | 8 / 0 | 0 | 29 | 0 / 1 / 0 | 644.85 |
| sqlite-node | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 10 | 19 | 0 / 1 / 0 | 938.23 |


## Cross-platform summary

Lowest p50, descriptive only; Windows decides when Mac and Windows disagree (map ruling 2026-09-18).

| Scale / cell | Mac winner (source) | Windows winner (source) | straddles |
| --- | --- | --- | --- |
| small/products-grid-asShipped | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/products-grid-pushed-10 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/products-grid-pushed-50 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/products-catalogue-blob | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/products-catalogue-projection | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/products-findByIds-10 | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/products-findByIds-50 | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/products-remoteId-in-find | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/products-remoteId-in-count | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/seed-products | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/orders-default-find-10 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/orders-default-find-50 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/orders-default-count | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/orders-open-status | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| small/order-line-add | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| small/order-create | filesystem-node (results.mac.json) | sqlite-node (results.windows.json) | yes |
| large/products-grid-asShipped | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/products-grid-pushed-10 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/products-grid-pushed-50 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/products-catalogue-blob | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/products-catalogue-projection | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/products-findByIds-10 | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/products-findByIds-50 | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/products-remoteId-in-find | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/products-remoteId-in-count | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/seed-products | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/orders-default-find-10 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/orders-default-find-50 | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/orders-default-count | filesystem-node (results.mac.json) | filesystem-node (results.windows.json) | no |
| large/orders-open-status | filesystem-node (results.mac.json) | sqlite-node (results.windows.json) | yes |
| large/order-line-add | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
| large/order-create | filesystem-node (results.mac.json) | sqlite-node (results.windows.json) | yes |
| large/cold-open-first-read | sqlite-node (results.mac.json) | sqlite-node (results.windows.json) | no |
<!-- generated:end -->
