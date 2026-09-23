# Spike 2210 — desktop engine verification

Desktop's decision is already SQLite (#2149); this evidence gates migration (#2150), not that
choice. Nothing here ships. The harness decides nothing; the operator writes the answers below.

## Environments

- Mac: TODO — OS, CPU, Node, SQLite, rxdb, rxdb-premium, measuredAt, premium patch marker count.
- Windows: TODO — OS, CPU, Node, SQLite, rxdb, rxdb-premium, measuredAt, premium patch marker count.
- Leg 1: TODO — Electron 43.4.0's actual Node and SQLite versions from the runtime evidence line.

## Answers — operator only

1. **Leg 1:** TODO — did premium's shipped `getSQLiteBasicsNodeNative` pass rxdb conformance on
   Electron 43.4.0's Node? Is `better-sqlite3` needed? A suite failure selects the fallback; missing
   Electron runtime evidence is not a qualifying run. A grep-limited pass is not a full-suite pass.
2. **Leg 2:** TODO — acknowledged losses per engine per platform; incomplete/unscorable trials.
3. **Leg 3:** TODO — winners and ratios for each cell family on each platform, whole-document read
   versus projection (condition ii), fresh-process cold open, and disk bytes/file counts.
4. **Gate:** TODO — does SQLite clear stability and win clearly on desktop speed? State what these
   numbers do not decide. Windows decides any Mac/Windows speed disagreement.

## Methods / accepted limits

- Engines run directly in plain Node, not through worker RPC, Electron UI or storage IPC. Only
  process-stop coordination uses IPC; the parent's received messages are the acknowledgment record.
- `filesystem-node` uses the raw installed premium engine and the verbatim Electron task-queue lock;
  no targeted recovery wrapper. The requested patch marker metric is `grep -c __wcpos` on premium's
  `storage-abstract-filesystem/index.js` (matching lines, not all patch files).
- `sqlite-node` uses premium's shipped native basics with only an open wrapper setting
  `synchronous=NORMAL`; premium retains WAL. A separate read-only connection proves effective WAL.
- Query/count translation and its supported-selector guard are copied from 2143. Each supported
  query/count uses one `sqliteBasics.all()` statement; unsupported selectors use premium unchanged.
  `ANALYZE` runs once after initial seeding, outside timed cells.
- Schemas, fixtures (seed 2143), indexes, workload cells and sample counts match 2143. Timing is now
  around direct storage calls; therefore this is not a controlled comparison of RPC overhead.
  Every measured warmup/sample is SHA-256 checked across engines, ignoring `_rev` and object key
  order. Projection maps the filesystem whole-document query to the same four SQLite columns.
- N=7 normally, N=25 order writes, N=3 seed and cold open; each discards one warmup. Cold open uses
  a fresh process each time but the OS page cache stays warm. Startup/module loading is outside
  the timer; storage construction, instance creation and first read are inside.
- Disk bytes/file count are captured immediately after the initial large seed, before extra timed
  seed databases. No physical-device throughput or power-loss durability claim is made.
- Crash stream sizes repeat 1,1,3,1,50,1,1,1000. `floor(n/5)` updates seed IDs; sizes 1 and 3 cannot
  represent 20% updates. Seeds are two 1,000-row writes; no child ledger file exists. A fresh scorer
  replays parent-recorded ownership, including actual in-flight replacements, before checking
  partial/orphan rows. Recovery/salvage signals are recorded, not suppressed or repaired.
- Only the specified 50 ms / 10 s reopen retry is used. Unscorable stops are `open-failed`; launch
  failures are incomplete runs. Three-trial smoke runs are not durability measurements.

## Operator commands (from repository root)

Run one task at a time on the 24 GB Mac. The full conformance suite has a **40-minute operator
ceiling**: stop it if exceeded and record the incomplete result. Do not edit upstream tests.

```sh
bash spikes/2210-desktop-engine/conformance/run-conformance.sh
```

Installs pinned dependencies in `.deps/` and `conformance/.rxdb-src/`; writes
`conformance/node.log` and tracked `conformance/node-conformance-summary.log`. It runs Mocha
with Electron's binary and `ELECTRON_RUN_AS_NODE=1`, never `npm run test:node:custom`.
Optional `MOCHA_GREP='...'` narrows the suite for diagnosis, not final evidence.

```sh
bash spikes/2210-desktop-engine/run.sh --legs 2,3 --trials 30 --scale both
```

Builds `.build/{bench-node,crash-node,crash-child}.js`, `.build/package.json` and
`.build/versions.json`; runs leg 3 then leg 2; writes `results.mac.json`, `crash.mac.json` (saved
per trial) and regenerates this file's marked section. All data lives under `.data/<leg>/<row>/<run>/`.
Leg 1 is never run by this command. `--build-only` just rebuilds; `--legs 2` or `--legs 3` selects one.

After the operator commits/pushes and the workflow is dispatchable:

```sh
gh workflow run spike-2210-desktop-engine.yml --ref research/2210-desktop-engine
gh run list --workflow spike-2210-desktop-engine.yml --limit 5
# Replace RUN_ID with the run above:
gh run download RUN_ID --name spike-2210-results-windows --dir spikes/2210-desktop-engine
node spikes/2210-desktop-engine/report.mjs
```

The Ubuntu job uploads `spike-2210-bundles`; Windows needs only Node 24, runs full legs 3 then 2,
then uploads `results.windows.json` and `crash.windows.json` as `spike-2210-results-windows`.
Before the workflow exists on the default branch, follow its comment about a temporary branch push
trigger instead of dispatch. The download writes the Windows JSON here; the report merges every
`results.*.json` and `crash.*.json` present. Remove smoke JSON and avoid duplicate reruns before
reporting; separate input files stay separate, never silently pooled. Fill the four answers last.

## Builder verification

Observed on 2026-09-23 (builder only, not full measurement): macOS `darwin 27.0.0 arm64`,
Apple M4 Pro, Node `24.14.0`, SQLite `3.51.2`, rxdb/rxdb-premium `17.4.0`, esbuild `0.28.2`.
Requested premium `index.js` marker count: **0**. Other installed filesystem modules do contain
`__wcpos` patches; this specific count is not a whole-plugin patch audit. No dependency was modified.

- PASS — `bash spikes/2210-desktop-engine/run.sh --build-only` (exit 0). Bundle sizes:
  `.build/bench-node.js` **1,300,343**, `.build/crash-node.js` **1,288,683**,
  `.build/crash-child.js` **1,307,533** bytes. Tree-shaking is disabled so the coordination-only
  driver also retains its imported engine modules and meets the brief's >10 KB artifact check.
- PASS — `node --check` on all seven `.mjs` files; `bash -n` on both shell runners.
- PASS — `node spikes/2210-desktop-engine/report.mjs` with no result JSON files (exit 0).
- PASS — bundled leg 3 `--scale small` for both rows: all **16** cells' warmup/sample signatures
  matched, including projection; effective `journal_mode=wal` printed. Schema/fixture/canonicalizer,
  storage-lock, selector-guard and query/count-wrapper copies also passed byte-for-byte source checks.
- PASS (execution, not an engine gate) — bundled leg 2 `--trials 3` completed all six trials.
  Final outcomes: filesystem-node **integrity-failed, integrity-failed, integrity-failed** (observed
  index-rebuild recovery signals); sqlite-node **ok, ok, ok**, integrity `ok` and WAL `wal` each time,
  with in-flight presence **absent, present, present**. Integrity precedence means the control's
  acknowledged losses were not evaluated in those trials.
- Smoke JSON files were deleted; their timings are intentionally not promoted into the tables.
  Two bounded review rounds corrected cold-open verification overhead and retry cleanup. No tests,
  lint, full suite, full legs, Windows dispatch, commits or dependency installation were performed.
- Not evaluated: full conformance, large-scale cells, cold-child execution, Windows execution,
  transient-open retry behavior under a failing engine, and broad compatibility/performance claims.

## Behavior changes / regressions

No application code changed. New harness only; full conformance, Mac measurements and Windows
execution remain unverified until the operator runs them. No broad engine compatibility claim.

<!-- generated:start -->
## Leg 1

```text
# Node conformance summary (rxdb 17.4.0, DEFAULT_STORAGE=custom)
spike-2210 runtime: electron=43.4.0 node=24.18.1 sqlite=3.53.1 journal_mode=wal
spike-2210 runtime: electron=43.4.0 node=24.18.1 sqlite=3.53.1 journal_mode=wal
init.test.ts;util.test.js;vector-distance.test.ts;custom-index.test.ts;query-planner.test.js;doc-cache.test.ts;internal-indexes.test.js;rx-storage-implementations.test.ts (implementation: sqlite-node-native);rx-storage-query-correctness.test.ts;rx-storage-helper.test.ts;instance-of-check.test.js;rx-schema.test.ts;bug-report.test.js;rx-database.test.ts;rx-document.test.js;rx-collection.test.ts;validate.test.js (ajv) ;validate.test.js (z-schema) ;validate.test.js (custom formats) ;rx-query.test.ts;cross-instance.test.js;local-documents.test.ts;change-event-buffer.test.js;reactive-query.test.js;key-compression.test.js;event-reduce.test.js;cache-replacement-policy.test.js;query-builder.test.js;idle-queue.test.js;reactivity.test.ts;reactive-collection.test.js;reactive-document.test.js;cleanup.test.js;hooks.test.js;rx-pipeline.test.js;orm.test.js;replication-protocol.test.ts (implementation: sqlite-node-native);replication.test.ts;replication-multiinstance.test.ts;replication-graphql.test.ts;replication-websocket.test.ts;replication-webrtc.test.ts;encryption.test.ts;rx-state.test.ts (useSchemaValidator: true);rx-state.test.ts (useSchemaValidator: false);migration-schema.test.ts;attachments.test.ts;attachments-compression.test.ts (mode: deflate);attachments-compression.test.ts (mode: gzip);migration-storage.test.ts (prev-major to newest (dexie));migration-storage.test.ts (newest to newest);webmcp.test.ts;crdt.test.ts;population.test.js;leader-election.test.js;backup.test.ts;import-export.test.js;database-lifecycle.ts;plugin.test.js;
conformance block ticks: 62
  1411 passing (2m)
  1 failing
Node suite exit code: 1
Electron runtime evidence check exit code: 0
First failure (verbatim from the bail log):
  1 failing

  1) plugin.test.js
       full.node.ts
         full.node.ts should run without errors:
     Error: could not run full.node.js.
                    # Error: Error: spawn mocha ENOENT
                    # Output: 
                    # ErrOut: 
                    
      at Context.<anonymous> (file:///Users/kilbot/Projects/monorepo-v2-worktrees/research-2210-desktop-engine/spikes/2210-desktop-engine/conformance/.rxdb-src/test/unit/plugin.test.ts:67:23)
      at processTicksAndRejections (node:internal/process/task_queues:104:5)
     Caused by: Error: spawn mocha ENOENT
      at Process.ChildProcess._handle.onexit (node:internal/child_process:287:19)
      at onErrorNT (node:internal/child_process:508:16)
      at processTicksAndRejections (node:internal/process/task_queues:90:21)




Node suite exit code: 1
Leg 1 failed: select better-sqlite3 per the brief.
```

**Leg 1 failed: selects better-sqlite3 per the brief.**


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
| premiumPatchMarkerCount | 0 |
| measuredAt | 2026-09-23T14:56:18.980Z |

All warmups and samples matched across both engines on content (SHA-256 of canonical revision-independent rows sorted by primary key); cells whose RETURNED order differed between engines carry orderMismatch, and each engine's unsortedSamples counts results not in primary-key order. Cold reads assert the exact seeded product.

#### small

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped | 6.10 / 6.53 | 16.85 / 19.85 | 0.36 |
| products-grid-pushed-10 | 5.94 / 6.72 ⚠ 8/8 unsorted | 0.12 / 0.14 ⚠ 8/8 unsorted | 48.77 |
| products-grid-pushed-50 | 5.88 / 6.54 ⚠ 8/8 unsorted | 0.55 / 0.58 ⚠ 8/8 unsorted | 10.71 |
| products-catalogue-blob | 5.08 / 6.29 ⚠ 8/8 unsorted | 24.05 / 28.24 ⚠ 8/8 unsorted | 0.21 |
| products-catalogue-projection — projection (condition ii) | 5.02 / 5.93 | 5.98 / 6.05 | 0.84 |
| products-findByIds-10 | 0.03 / 0.04 | 0.10 / 0.11 | 0.32 |
| products-findByIds-50 | 0.13 / 0.14 | 0.37 / 0.48 | 0.34 |
| products-remoteId-in-find | 8.14 / 8.77 | 0.91 / 1.00 | 8.95 |
| products-remoteId-in-count | 8.34 / 8.68 | 0.44 / 0.44 | 19.06 |
| seed-products | 17.68 / 20.05 | 42.54 / 43.27 | 0.42 |
| orders-default-find-10 | 13.15 / 16.76 ⚠ 8/8 unsorted | 0.91 / 0.93 ⚠ 8/8 unsorted | 14.43 |
| orders-default-find-50 | 12.81 / 14.12 ⚠ 8/8 unsorted | 4.53 / 4.62 ⚠ 8/8 unsorted | 2.83 |
| orders-default-count | 12.76 / 13.44 | 20.47 / 20.96 | 0.62 |
| orders-open-status | 7.11 / 7.26 | 18.95 / 21.32 | 0.38 |
| order-line-add | 2.38 / 3.47 | 0.22 / 0.25 | 10.69 |
| order-create | 0.05 / 0.11 | 0.10 / 0.13 | 0.53 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2758.653}.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2758.653}.

#### large

| Cell (p50 / p95 ms) | filesystem-node | sqlite-node | filesystem-node ÷ sqlite-node (p50) |
| --- | --- | --- | --- |
| products-grid-asShipped (returned order differed) | 124.79 / 139.13 ⚠ 5/8 unsorted | 199.63 / 201.02 | 0.63 |
| products-grid-pushed-10 | 216.19 / 224.83 ⚠ 8/8 unsorted | 0.15 / 0.17 ⚠ 8/8 unsorted | 1468.18 |
| products-grid-pushed-50 | 219.77 / 240.71 ⚠ 8/8 unsorted | 0.72 / 0.85 ⚠ 8/8 unsorted | 306.29 |
| products-catalogue-blob | 59.27 / 88.07 ⚠ 8/8 unsorted | 328.33 / 338.70 ⚠ 8/8 unsorted | 0.18 |
| products-catalogue-projection — projection (condition ii) | 60.09 / 94.98 | 64.39 / 65.33 | 0.93 |
| products-findByIds-10 | 0.03 / 0.04 | 0.11 / 0.13 | 0.30 |
| products-findByIds-50 | 0.13 / 0.18 | 0.45 / 0.49 | 0.29 |
| products-remoteId-in-find | 97.21 / 117.85 | 1.08 / 1.09 | 89.98 |
| products-remoteId-in-count | 98.19 / 117.72 | 0.57 / 0.58 | 171.44 |
| seed-products | 1134.90 / 1136.92 | 513.89 / 537.00 | 2.21 |
| orders-default-find-10 | 232.48 / 236.28 ⚠ 8/8 unsorted | 1.05 / 1.07 ⚠ 8/8 unsorted | 221.76 |
| orders-default-find-50 | 229.66 / 238.45 ⚠ 8/8 unsorted | 5.35 / 7.30 ⚠ 8/8 unsorted | 42.97 |
| orders-default-count | 227.20 / 242.60 | 236.03 / 252.80 | 0.96 |
| orders-open-status | 139.39 / 183.74 | 179.47 / 196.31 | 0.78 |
| order-line-add | 27.81 / 36.34 | 0.23 / 0.27 | 119.62 |
| order-create | 0.10 / 0.25 | 0.09 / 0.12 | 1.11 |
| cold-open-first-read | 139.88 / 155.01 | 2.78 / 2.88 | 50.23 |

- filesystem-node: WAL proof not applicable; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- filesystem-node disk-bytes after large seed: 151012993; files: 26.

- filesystem-node cold-open-first-read: 139.88 / 155.01 ms; N=3, fresh Node processes, warm OS page cache.

- sqlite-node: WAL proof wal; mean seed JSON bytes {"products":2000,"orders":2714.56025}.

- sqlite-node disk-bytes after large seed: 201168360; files: 3.

- sqlite-node cold-open-first-read: 2.78 / 2.88 ms; N=3, fresh Node processes, warm OS page cache.

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


## Cross-platform summary

Lowest p50, descriptive only; Windows decides when Mac and Windows disagree (map ruling 2026-09-18).

| Scale / cell | Mac winner (source) | Windows winner (source) | straddles |
| --- | --- | --- | --- |
| small/products-grid-asShipped | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/products-grid-pushed-10 | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/products-grid-pushed-50 | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/products-catalogue-blob | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/products-catalogue-projection | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/products-findByIds-10 | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/products-findByIds-50 | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/products-remoteId-in-find | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/products-remoteId-in-count | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/seed-products | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/orders-default-find-10 | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/orders-default-find-50 | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/orders-default-count | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/orders-open-status | filesystem-node (results.mac.json) | not measured | not evaluated |
| small/order-line-add | sqlite-node (results.mac.json) | not measured | not evaluated |
| small/order-create | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-grid-asShipped | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-grid-pushed-10 | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/products-grid-pushed-50 | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/products-catalogue-blob | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-catalogue-projection | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-findByIds-10 | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-findByIds-50 | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/products-remoteId-in-find | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/products-remoteId-in-count | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/seed-products | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/orders-default-find-10 | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/orders-default-find-50 | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/orders-default-count | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/orders-open-status | filesystem-node (results.mac.json) | not measured | not evaluated |
| large/order-line-add | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/order-create | sqlite-node (results.mac.json) | not measured | not evaluated |
| large/cold-open-first-read | sqlite-node (results.mac.json) | not measured | not evaluated |
<!-- generated:end -->
