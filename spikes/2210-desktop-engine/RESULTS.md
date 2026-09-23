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

Not run. Operator must run the Electron-Node suite.


## Cross-platform summary

Lowest p50, descriptive only; Windows decides when Mac and Windows disagree (map ruling 2026-09-18).

| Scale / cell | Mac winner (source) | Windows winner (source) | straddles |
| --- | --- | --- | --- |

No measurements yet — filled by `node report.mjs` after operator runs.
<!-- generated:end -->
