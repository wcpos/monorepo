# Research: POS startup memory spike

Status: investigation open; root cause unconfirmed. Captured 2026-09-16 local
time (Europe/Madrid; 2026-09-15 UTC) on the existing Chrome session at
`https://frikifunko.mx/pos/`, displaying WCPOS 1.10.17.

## Scope and separation from Logs

The owner reported memory jumping to approximately 3 GB immediately after a
refresh on POS, without opening Logs. This is separate from the reproduced
hidden-Logs pagination loop addressed by [PR #2079](https://github.com/wcpos/monorepo/pull/2079).
Neither investigation is a dependency of the other. The Logs fix must not be
presented as resolving this startup symptom.

## Observed evidence

| Measurement | Result | Interpretation limit |
| --- | --- | --- |
| Fresh POS DOM inspection | No mounted `screen-logs` | Hidden Logs cannot explain this captured fresh-load state |
| Startup trace main JS heap | Peak 434,753,400 bytes (~435 MB) | Not total renderer memory |
| Startup trace storage-worker JS heap | Peak 279,834,988 bytes (~280 MB) | Separate peak; do not add as a simultaneous total |
| Startup trace DOM nodes | Peak 1,165 | No reproduction of the earlier hundreds-of-thousands-of-nodes growth |
| Renderer OS RSS sampling | Peak 1,898 MiB; later 863 MiB | Not Chrome Task Manager's memory-footprint metric |
| Later main-thread heap snapshot | 188 MB | A retained-heap measurement after startup, not peak allocation |
| Later console inspection at 23:26:04 UTC | Used heap 177 MiB; allocated heap 179 MiB; 414 DOM elements; zero Logs screens | Separate from trace node counters and sampling time |
| Images in that later DOM inspection | 13 images; estimated RGBA storage ~3 MiB | Width × height × 4 estimate, not measured total image/cache memory |

The RSS observation covered approximately 23:19:04–23:19:50 UTC, sampling
renderer PID 44545 about every 0.5 seconds. It fell below 900 MiB without a
manual garbage-collection action during that interval. The heap snapshot was
taken later and must not be treated as an unperturbed startup measurement.
This run did **not** reproduce or explain the owner's full 3 GB reading.

## Observed work during startup, not proven memory causes

- CPU samples attribute roughly one second to FlexSearch's recursive removal
  path during persisted append-history replay (`add` → `update` → `remove`).
  The deployed bundle already contains the WCPOS FlexSearch churn patch.
- Console warnings report storage-index rebuilds for seven collections:
  `_rxdb_internal` (72 documents), `schedulerTaskStates` (14),
  `coverageRecords` (509), `coverageLanes` (30), `coverageCompactionLeases` (1),
  `queryTotalRequestStates` (9), and `engineKv` (8). Reasons were stale changelog
  operations. Counts alone do not establish bytes read or allocated.
- The later main heap contains about 44,187 log-shaped objects despite no Logs
  screen, with an aggregate retained-size display around 30 MB. This does not
  demonstrate a multi-gigabyte leak or identify their retaining owner.

## Evidence provenance

- Performance panel: Memory enabled, Record and reload; approximately 6.6 seconds.
- Local trace: `/tmp/frikifunko-startup-20260916.json.gz` (151,960 trace events).
  It is not committed or uploaded: traces can contain private store/session data,
  and this temporary local path is not durable evidence storage.
- Heap peaks above come from trace `UpdateCounters` events; CPU attribution comes
  from sampled profiles, checked against deployed bundle call frames.
- Deployed asset: `entry-fd7ffd6f6a91b99a0c8fb05d2bd82118.js` under
  `https://cdn.jsdelivr.net/gh/wcpos/web-bundle@1.10/build/_expo/static/js/web/`.
- No extension isolation or clean-browser comparison was performed. Other agents
  were using the laptop. The capture is not a controlled performance benchmark.

## Next investigation and completion criteria

1. Reproduce the reported peak while recording the same renderer's Task Manager
   footprint, JS heap, worker heap, DOM count, and timestamps. Verify process ID
   after reload; keep measurement types separate.
2. Capture allocation stacks across startup and inspect retainers at the peak.
   Distinguish temporary allocation pressure from retained growth and memory
   outside the JS heaps. Do not infer memory ownership from CPU samples alone.
3. Test search-history replay and storage recovery only if allocation evidence
   points there. Record collection/history sizes without publishing store data.
4. Before proposing a fix, establish a repeatable failing measurement. Compare
   old and changed code against the same local data and browser conditions.
5. Call this resolved only after the reported peak is reproduced, its allocation
   source is identified, and a targeted change is measured against that baseline.

## Behavior changes / regressions

None: this is an evidence record, not a runtime fix. No new production code,
dependencies, browser instrumentation, or storage changes are introduced.
No memory improvement, broad compatibility, or root-cause claim is made.
