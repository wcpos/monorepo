# Spike 2143 — storage benchmark

**Unmeasured.** This harness does not select an engine. Browser runs belong to the operator.

## Environment placeholders

| Browser | Version | OS | CPU | rxdb / premium / SQLite wasm / esbuild | measuredAt |
|---|---|---|---|---|---|
| chrome (Mac) | TODO | TODO | TODO | TODO | TODO |
| firefox (Mac) | TODO | TODO | TODO | TODO | TODO |
| webkit (Mac) | TODO | TODO | TODO | TODO | TODO |
| windows-chrome | TODO | TODO | TODO | TODO | TODO |

The generated section records actual runtime and build versions for each result file.

## Operator answers

1. TODO: Which engine wins each cell family, and by how much, in each browser?
2. TODO: Does the Mac bracket straddle? What does the Windows run say?
3. TODO: What do the numbers decide and not decide? Discuss wasm bytes and worker/open/first-read cost, and the serial three-write cart-line addition. Speed alone does not establish durability, migration safety, or production readiness.

## Method and limitations

- Page-visible elapsed times include worker RPC; no worker-side timing is reported. One discarded warm-up precedes each cell; N=7 normally, N=25 for writes, N=3 for full product seeds and cold reads. p50/p95 use nearest rank; max and raw samples are retained. With N=3 or 7, p95 is max.
- Engines run in fixed order: shipped OPFS, SQLite SAH pool, premium IndexedDB. Each engine/scale uses a fresh isolated browser context and database name. Small runs before large. Closing instances and terminating workers separates runs; cold reads reload the page in the same context.
- SQLite uses exclusive locking before WAL, a 64-handle SAH pool, and base64 attachments. The copied 2145 adapter fails if WAL is refused. Its adapter log prefix still says `spike-2138` because the file is copied verbatim.
- SQLite `query`/`count` are wrapped to execute one fully translated SQL statement for supported selectors: the in-harness equivalent of 2145's proposed premium patch, **not** premium's shipped fallback or its queryModifier-only path. Unsupported selectors retain premium behavior. This is a candidate measurement, not a change to the app or premium package.
- Premium IndexedDB uses its defaults, including **hardcoded relaxed transaction durability**. It is not raw IndexedDB; no raw IndexedDB anchor is measured.
- Product nested indexes are declared on `payload.status` and `payload.name`; no promoted mirrors are used. Browser acceptance is unverified until the operator runs. Products retain the promoted top-level schema fields; remoteId is a non-null string here because every fixture has one and it is indexed.
- `products-grid-asShipped` returns the complete matching set. `products-grid-pushed-10/50` are **hypothetical** query-layer improvements. No-sort finds still receive RxDB's deterministic normalized sort. Counts use RxDB's skip-sort normalization (which supplies primary-key order internally).
- Names, status/type/stock distributions, sample IDs and orders are deterministic. JSON is ASCII, so string length equals UTF-8 bytes; measured mean document bytes are recorded. Read checks compare canonical full document content, ignoring revisions; finds preserve primary-key order, ID-fetch reads compare unordered sets. SHA-256 signatures are checked for every warm-up and sample across all three engines. Writes additionally read back and check intended order/mutation content outside the timer. A mismatch aborts without writing new results.
- Timed product resyncs each use a fresh auxiliary database; creation, read-back verification and removal are outside the timer. The original seeded database remains for queries and cold reads. `storage-estimate` is collected immediately after the original large seed, before auxiliary seeds and write sampling, so they do not inflate it. It is origin-wide browser-reported usage, potentially rounded/delayed, not precise filesystem allocation; the SQLite pool's reserved files are included.
- Cold reads exclude navigation and the already-loaded page harness, but include worker creation, storage open and the first product read. Reload is not an OS-cache purge. Routing disables HTTP cache; requested worker/wasm bytes are served from disk-loaded buffers and recorded per sample, without realistic download latency. Bundle disk bytes are not compressed network transfer sizes.
- Root `package.json` has no Playwright entry in this checkout. Windows pins the installed version matching `apps/template-studio/package.json` instead. No browser download is requested; Windows uses preinstalled Chrome.
- Only successful complete three-engine runs produce result files. Missing browser columns mean unmeasured, not a tie. Bracket winners use p50 only; they are descriptive, not significance-tested.

## Operator commands (from repository root)

```bash
# Build and run all three Mac browsers sequentially, then generate RESULTS.md.
bash spikes/2143-storage-benchmark/run.sh

# Or build once and run browsers individually.
bash spikes/2143-storage-benchmark/run.sh --build-only
node spikes/2143-storage-benchmark/bench.mjs --browser chrome --scale both
node spikes/2143-storage-benchmark/bench.mjs --browser firefox --scale both
node spikes/2143-storage-benchmark/bench.mjs --browser webkit --scale both
node spikes/2143-storage-benchmark/report.mjs
```

Build outputs: `.build/{bench.js,worker-sqlite.js,worker-indexeddb.js,opfs.worker.js,sqlite3.wasm,versions.json}`. The OPFS worker is copied verbatim. Browser commands write `results.chrome.json`, `results.firefox.json`, and `results.webkit.json` beside this file. `--out <file>` overrides that destination; `--bundles <dir>` overrides `.build/`; `--scale small|large|both` defaults to both. `run.sh --browser chrome` builds, runs only Chrome and regenerates the report. Single-scale runs replace their output file rather than merging it.

After the operator commits/pushes the harness and the workflow exists on the repository default branch (a prerequisite for manual dispatch), dispatch **Spike 2143 storage benchmark** for the desired branch with `gh workflow run spike-2143-benchmark.yml --ref <branch>`. Its Windows job writes artifact `spike-2143-results-windows`. Download `results.windows-chrome.json` into this directory alongside the Mac results, then run:

```bash
node spikes/2143-storage-benchmark/report.mjs
```

This replaces only the generated section and marks the prose stale when the recorded measuredAt set changes. Review/update the TODO answers and environment placeholders, remove the stale warning after review, then commit the results. `report.mjs` reads every `results.*.json` in this directory; the filename supplies its bracket column, including `windows-chrome`.

> **STALE: measuredAt set changed. Operator must revisit the answer paragraphs above.**

<!-- generated:start -->
<!-- measuredAt:[["chrome","2026-09-18T08:55:12.718Z"]] -->
## chrome
Browser: 154.0.8037.44; OS: darwin 25.6.0 arm64; CPU: Apple M4 Pro; Node: v24.14.0; measuredAt: 2026-09-18T08:55:12.718Z.
Versions: {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","@sqlite.org/sqlite-wasm":"3.53.4-build1"}.
Bundle bytes on disk: {"bench.js":84076,"opfs.worker.js":123743,"worker-sqlite.js":728509,"worker-indexeddb.js":221672,"sqlite3.wasm":868907}.
All warmups and samples matched across all three engines (SHA-256 of canonical revision-independent content).

### small
| Cell (p50 / p95 ms) | opfs-shipped | sqlite-sahpool | indexeddb-premium |
|---|---|---|---|
| products-grid-asShipped | 12.61 / 19.51 | 14.98 / 15.31 | 25.11 / 27.57 |
| products-grid-pushed-10 | 4.68 / 5.99 | 0.17 / 0.28 | 2.88 / 4.87 |
| products-grid-pushed-50 | 4.48 / 4.58 | 0.56 / 0.78 | 3.18 / 3.42 |
| products-catalogue-blob | 8.96 / 11.42 | 21.94 / 23.42 | 25.01 / 26.90 |
| products-findByIds-10 | 1.08 / 1.34 | 0.90 / 0.98 | 0.27 / 0.33 |
| products-findByIds-50 | 2.93 / 4.09 | 1.29 / 1.44 | 0.77 / 0.86 |
| products-remoteId-in-find | 6.96 / 7.38 | 1.00 / 1.10 | 20.22 / 20.63 |
| products-remoteId-in-count | 6.03 / 6.31 | 0.25 / 0.34 | 19.91 / 21.44 |
| seed-products | 35.42 / 40.57 | 217.61 / 220.59 | 64.39 / 65.91 |
| orders-default-find-10 | 8.13 / 9.30 | 1.13 / 1.32 | 23.83 / 25.38 |
| orders-default-find-50 | 8.07 / 8.57 | 4.86 / 5.07 | 24.76 / 25.75 |
| orders-default-count | 7.75 / 7.84 | 164.61 / 177.59 | 23.97 / 25.05 |
| orders-open-status | 17.31 / 18.86 | 120.01 / 123.80 | 26.13 / 27.18 |
| order-line-add | 3.25 / 4.94 | 6.82 / 10.85 | 0.59 / 0.75 |
| order-create | 0.51 / 0.75 | 3.25 / 4.13 | 0.24 / 0.36 |

Maxima and samples (ms); rows are documents returned by the timed method, not verification reads:
| Engine / cell | N | max | rows per sample |
|---|---:|---:|---|
| opfs-shipped / products-grid-asShipped | 7 | 19.51 | 1557, 1557, 1557, 1557, 1557, 1557, 1557 |
| opfs-shipped / products-grid-pushed-10 | 7 | 5.99 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / products-grid-pushed-50 | 7 | 4.58 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / products-catalogue-blob | 7 | 11.42 | 2000, 2000, 2000, 2000, 2000, 2000, 2000 |
| opfs-shipped / products-findByIds-10 | 7 | 1.34 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / products-findByIds-50 | 7 | 4.09 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / products-remoteId-in-find | 7 | 7.38 | 100, 100, 100, 100, 100, 100, 100 |
| opfs-shipped / products-remoteId-in-count | 7 | 6.31 | —, —, —, —, —, —, — |
| opfs-shipped / seed-products | 3 | 40.57 | —, —, — |
| opfs-shipped / orders-default-find-10 | 7 | 9.30 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / orders-default-find-50 | 7 | 8.57 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / orders-default-count | 7 | 7.84 | —, —, —, —, —, —, — |
| opfs-shipped / orders-open-status | 7 | 18.86 | 1200, 1200, 1200, 1200, 1200, 1200, 1200 |
| opfs-shipped / order-line-add | 25 | 4.98 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| opfs-shipped / order-create | 25 | 0.75 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| sqlite-sahpool / products-grid-asShipped | 7 | 15.31 | 1557, 1557, 1557, 1557, 1557, 1557, 1557 |
| sqlite-sahpool / products-grid-pushed-10 | 7 | 0.28 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / products-grid-pushed-50 | 7 | 0.78 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / products-catalogue-blob | 7 | 23.42 | 2000, 2000, 2000, 2000, 2000, 2000, 2000 |
| sqlite-sahpool / products-findByIds-10 | 7 | 0.98 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / products-findByIds-50 | 7 | 1.44 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / products-remoteId-in-find | 7 | 1.10 | 100, 100, 100, 100, 100, 100, 100 |
| sqlite-sahpool / products-remoteId-in-count | 7 | 0.34 | —, —, —, —, —, —, — |
| sqlite-sahpool / seed-products | 3 | 220.59 | —, —, — |
| sqlite-sahpool / orders-default-find-10 | 7 | 1.32 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / orders-default-find-50 | 7 | 5.07 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / orders-default-count | 7 | 177.59 | —, —, —, —, —, —, — |
| sqlite-sahpool / orders-open-status | 7 | 123.80 | 1200, 1200, 1200, 1200, 1200, 1200, 1200 |
| sqlite-sahpool / order-line-add | 25 | 212.97 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| sqlite-sahpool / order-create | 25 | 5.66 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| indexeddb-premium / products-grid-asShipped | 7 | 27.57 | 1557, 1557, 1557, 1557, 1557, 1557, 1557 |
| indexeddb-premium / products-grid-pushed-10 | 7 | 4.87 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / products-grid-pushed-50 | 7 | 3.42 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / products-catalogue-blob | 7 | 26.90 | 2000, 2000, 2000, 2000, 2000, 2000, 2000 |
| indexeddb-premium / products-findByIds-10 | 7 | 0.33 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / products-findByIds-50 | 7 | 0.86 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / products-remoteId-in-find | 7 | 20.63 | 100, 100, 100, 100, 100, 100, 100 |
| indexeddb-premium / products-remoteId-in-count | 7 | 21.44 | —, —, —, —, —, —, — |
| indexeddb-premium / seed-products | 3 | 65.91 | —, —, — |
| indexeddb-premium / orders-default-find-10 | 7 | 25.38 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / orders-default-find-50 | 7 | 25.75 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / orders-default-count | 7 | 25.05 | —, —, —, —, —, —, — |
| indexeddb-premium / orders-open-status | 7 | 27.18 | 1200, 1200, 1200, 1200, 1200, 1200, 1200 |
| indexeddb-premium / order-line-add | 25 | 1.83 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| indexeddb-premium / order-create | 25 | 0.40 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
- opfs-shipped: mean seed JSON bytes {"products":2000,"orders":2758.653}; storage-estimate after initial large seed: not collected bytes.
- sqlite-sahpool: mean seed JSON bytes {"products":2000,"orders":2758.653}; storage-estimate after initial large seed: not collected bytes.
- indexeddb-premium: mean seed JSON bytes {"products":2000,"orders":2758.653}; storage-estimate after initial large seed: not collected bytes.

### large
| Cell (p50 / p95 ms) | opfs-shipped | sqlite-sahpool | indexeddb-premium |
|---|---|---|---|
| products-grid-asShipped | 155.97 / 172.18 | 560.04 / 574.14 | 268.55 / 270.31 |
| products-grid-pushed-10 | 620.75 / 646.45 | 0.24 / 0.37 | 3.06 / 4.32 |
| products-grid-pushed-50 | 648.66 / 698.10 | 0.63 / 0.71 | 3.33 / 3.44 |
| products-catalogue-blob | 94.81 / 104.48 | 2241.56 / 2458.97 | 255.93 / 270.19 |
| products-findByIds-10 | 0.77 / 1.01 | 2144.86 / 2150.77 | 0.35 / 0.57 |
| products-findByIds-50 | 3.06 / 4.03 | 2118.40 / 2146.82 | 1.15 / 1.75 |
| products-remoteId-in-find | 97.15 / 108.95 | 1.10 / 1.26 | 211.46 / 212.43 |
| products-remoteId-in-count | 98.89 / 105.07 | 0.37 / 0.71 | 209.43 / 211.70 |
| seed-products | 1078.29 / 1101.17 | 3594.84 / 3621.44 | 1200.24 / 1257.26 |
| orders-default-find-10 | 134.94 / 146.34 | 1.15 / 1.33 | 280.56 / 399.15 |
| orders-default-find-50 | 137.03 / 152.08 | 4.93 / 5.15 | 285.94 / 325.43 |
| orders-default-count | 134.09 / 144.06 | 1594.78 / 1617.25 | 267.42 / 274.45 |
| orders-open-status | 227.42 / 238.81 | 1905.01 / 1918.69 | 316.25 / 327.03 |
| order-line-add | 19.90 / 24.09 | 6.89 / 8.64 | 0.74 / 1.35 |
| order-create | 0.59 / 0.75 | 3.48 / 5.15 | 0.32 / 0.63 |
| cold-open-first-read | 121.11 / 121.67 | 75.04 / 78.06 | 8.50 / 9.62 |

Maxima and samples (ms); rows are documents returned by the timed method, not verification reads:
| Engine / cell | N | max | rows per sample |
|---|---:|---:|---|
| opfs-shipped / products-grid-asShipped | 7 | 172.18 | 15337, 15337, 15337, 15337, 15337, 15337, 15337 |
| opfs-shipped / products-grid-pushed-10 | 7 | 646.45 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / products-grid-pushed-50 | 7 | 698.10 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / products-catalogue-blob | 7 | 104.48 | 20000, 20000, 20000, 20000, 20000, 20000, 20000 |
| opfs-shipped / products-findByIds-10 | 7 | 1.01 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / products-findByIds-50 | 7 | 4.03 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / products-remoteId-in-find | 7 | 108.95 | 100, 100, 100, 100, 100, 100, 100 |
| opfs-shipped / products-remoteId-in-count | 7 | 105.07 | —, —, —, —, —, —, — |
| opfs-shipped / seed-products | 3 | 1101.17 | —, —, — |
| opfs-shipped / orders-default-find-10 | 7 | 146.34 | 10, 10, 10, 10, 10, 10, 10 |
| opfs-shipped / orders-default-find-50 | 7 | 152.08 | 50, 50, 50, 50, 50, 50, 50 |
| opfs-shipped / orders-default-count | 7 | 144.06 | —, —, —, —, —, —, — |
| opfs-shipped / orders-open-status | 7 | 238.81 | 12000, 12000, 12000, 12000, 12000, 12000, 12000 |
| opfs-shipped / order-line-add | 25 | 29.32 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| opfs-shipped / order-create | 25 | 0.85 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| opfs-shipped / cold-open-first-read | 3 | 121.67 | 1, 1, 1 |
| sqlite-sahpool / products-grid-asShipped | 7 | 574.14 | 15337, 15337, 15337, 15337, 15337, 15337, 15337 |
| sqlite-sahpool / products-grid-pushed-10 | 7 | 0.37 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / products-grid-pushed-50 | 7 | 0.71 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / products-catalogue-blob | 7 | 2458.97 | 20000, 20000, 20000, 20000, 20000, 20000, 20000 |
| sqlite-sahpool / products-findByIds-10 | 7 | 2150.77 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / products-findByIds-50 | 7 | 2146.82 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / products-remoteId-in-find | 7 | 1.26 | 100, 100, 100, 100, 100, 100, 100 |
| sqlite-sahpool / products-remoteId-in-count | 7 | 0.71 | —, —, —, —, —, —, — |
| sqlite-sahpool / seed-products | 3 | 3621.44 | —, —, — |
| sqlite-sahpool / orders-default-find-10 | 7 | 1.33 | 10, 10, 10, 10, 10, 10, 10 |
| sqlite-sahpool / orders-default-find-50 | 7 | 5.15 | 50, 50, 50, 50, 50, 50, 50 |
| sqlite-sahpool / orders-default-count | 7 | 1617.25 | —, —, —, —, —, —, — |
| sqlite-sahpool / orders-open-status | 7 | 1918.69 | 12000, 12000, 12000, 12000, 12000, 12000, 12000 |
| sqlite-sahpool / order-line-add | 25 | 218.37 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| sqlite-sahpool / order-create | 25 | 5.31 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| sqlite-sahpool / cold-open-first-read | 3 | 78.06 | 1, 1, 1 |
| indexeddb-premium / products-grid-asShipped | 7 | 270.31 | 15337, 15337, 15337, 15337, 15337, 15337, 15337 |
| indexeddb-premium / products-grid-pushed-10 | 7 | 4.32 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / products-grid-pushed-50 | 7 | 3.44 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / products-catalogue-blob | 7 | 270.19 | 20000, 20000, 20000, 20000, 20000, 20000, 20000 |
| indexeddb-premium / products-findByIds-10 | 7 | 0.57 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / products-findByIds-50 | 7 | 1.75 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / products-remoteId-in-find | 7 | 212.43 | 100, 100, 100, 100, 100, 100, 100 |
| indexeddb-premium / products-remoteId-in-count | 7 | 211.70 | —, —, —, —, —, —, — |
| indexeddb-premium / seed-products | 3 | 1257.26 | —, —, — |
| indexeddb-premium / orders-default-find-10 | 7 | 399.15 | 10, 10, 10, 10, 10, 10, 10 |
| indexeddb-premium / orders-default-find-50 | 7 | 325.43 | 50, 50, 50, 50, 50, 50, 50 |
| indexeddb-premium / orders-default-count | 7 | 274.45 | —, —, —, —, —, —, — |
| indexeddb-premium / orders-open-status | 7 | 327.03 | 12000, 12000, 12000, 12000, 12000, 12000, 12000 |
| indexeddb-premium / order-line-add | 25 | 17.09 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| indexeddb-premium / order-create | 25 | 0.68 | —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, —, — |
| indexeddb-premium / cold-open-first-read | 3 | 9.62 | 1, 1, 1 |
- opfs-shipped: mean seed JSON bytes {"products":2000,"orders":2714.56025}; storage-estimate after initial large seed: 151018316 bytes.
  - Cold sample 1 fetched: [{"file":"opfs.worker.js","bytes":123743}].
  - Cold sample 2 fetched: [{"file":"opfs.worker.js","bytes":123743}].
  - Cold sample 3 fetched: [{"file":"opfs.worker.js","bytes":123743}].
- sqlite-sahpool: mean seed JSON bytes {"products":2000,"orders":2714.56025}; storage-estimate after initial large seed: 201195176 bytes.
  - Cold sample 1 fetched: [{"file":"worker-sqlite.js","bytes":728509},{"file":"sqlite3.wasm","bytes":868907}].
  - Cold sample 2 fetched: [{"file":"worker-sqlite.js","bytes":728509},{"file":"sqlite3.wasm","bytes":868907}].
  - Cold sample 3 fetched: [{"file":"worker-sqlite.js","bytes":728509},{"file":"sqlite3.wasm","bytes":868907}].
- indexeddb-premium: mean seed JSON bytes {"products":2000,"orders":2714.56025}; storage-estimate after initial large seed: 152788992 bytes.
  - Cold sample 1 fetched: [{"file":"worker-indexeddb.js","bytes":221672}].
  - Cold sample 2 fetched: [{"file":"worker-indexeddb.js","bytes":221672}].
  - Cold sample 3 fetched: [{"file":"worker-indexeddb.js","bytes":221672}].

## Bracket (lowest p50; descriptive, not significance-tested)
| Scale / cell | chrome | straddles |
|---|---|---|
| small/products-grid-asShipped | opfs-shipped | no |
| small/products-grid-pushed-10 | sqlite-sahpool | no |
| small/products-grid-pushed-50 | sqlite-sahpool | no |
| small/products-catalogue-blob | opfs-shipped | no |
| small/products-findByIds-10 | indexeddb-premium | no |
| small/products-findByIds-50 | indexeddb-premium | no |
| small/products-remoteId-in-find | sqlite-sahpool | no |
| small/products-remoteId-in-count | sqlite-sahpool | no |
| small/seed-products | opfs-shipped | no |
| small/orders-default-find-10 | sqlite-sahpool | no |
| small/orders-default-find-50 | sqlite-sahpool | no |
| small/orders-default-count | opfs-shipped | no |
| small/orders-open-status | opfs-shipped | no |
| small/order-line-add | indexeddb-premium | no |
| small/order-create | indexeddb-premium | no |
| large/products-grid-asShipped | opfs-shipped | no |
| large/products-grid-pushed-10 | sqlite-sahpool | no |
| large/products-grid-pushed-50 | sqlite-sahpool | no |
| large/products-catalogue-blob | opfs-shipped | no |
| large/products-findByIds-10 | indexeddb-premium | no |
| large/products-findByIds-50 | indexeddb-premium | no |
| large/products-remoteId-in-find | sqlite-sahpool | no |
| large/products-remoteId-in-count | sqlite-sahpool | no |
| large/seed-products | opfs-shipped | no |
| large/orders-default-find-10 | sqlite-sahpool | no |
| large/orders-default-find-50 | sqlite-sahpool | no |
| large/orders-default-count | opfs-shipped | no |
| large/orders-open-status | opfs-shipped | no |
| large/order-line-add | indexeddb-premium | no |
| large/order-create | indexeddb-premium | no |
| large/cold-open-first-read | indexeddb-premium | no |
<!-- generated:end -->
