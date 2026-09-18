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

<!-- generated:start -->
<!-- measuredAt:[] -->
No results yet — filled by `node report.mjs` after browser runs.
<!-- generated:end -->
