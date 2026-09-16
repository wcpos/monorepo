# Research and fix: POS startup memory spike

Captured 2026-09-16 (Europe/Madrid) on the existing Chrome session at
`https://frikifunko.mx/pos/`, displaying WCPOS 1.10.17.
**Observed:** eager log retention is a substantial startup-memory contributor.
**Unverified:** this does not fully explain the owner's approximately 3 GB
Task Manager reading or establish that all memory issues are resolved.

## Separate from hidden Logs

[PR #2079](https://github.com/wcpos/monorepo/pull/2079) fixes the reproduced
hidden-Logs pagination loop. Fresh POS captures had no mounted `screen-logs`,
so that fix cannot explain this separate startup symptom. Neither fix depends
on the other. This PR changes the logger's background retention sweep, not UI
pagination, product tables, or search indexing.

## Observed causal comparison

Chrome DevTools Performance: Memory enabled, Record and reload, roughly 6–7
seconds per capture. Same production bundle, browser session, renderer PID
19849, and existing local database. Local Overrides changed only the retention
module; all compared runs used the override setup. No extension isolation was
performed, and other agents were using the laptop. This is a live causal
experiment, not a controlled benchmark. Values are decimal MB.

| Retention implementation                    | Main JS heap peak | Storage-worker JS heap peak |
| ------------------------------------------- | ----------------: | --------------------------: |
| A: original                                 |        434.634 MB |                  276.176 MB |
| B: temporarily skip sweep (diagnostic only) |        201.514 MB |                   88.149 MB |
| A2: original restored                       |        460.487 MB |                  319.731 MB |
| C: actual paged implementation from this PR |        223.305 MB |                  225.599 MB |

These are **separate peaks**, not simultaneous totals or Task Manager footprint.
A/B/A implicates the sweep rather than simply a warmer reload. C verifies the
actual fix, not just disabling retention. The original sweep scanned 46,144
logs totaling 26,219,709 accounted bytes. C completed 94 storage queries,
including the terminal empty query, reading 46,159 rows with a maximum response
of 500. Counts drift as the application writes logs. After C, console inspection
showed 119 MiB used main heap, 516 DOM elements, and zero Logs screens.

## Mechanism and bounded fix

**Observed in source:** startup binds the log database and runs retention. The
old sweep materializes the entire retained history through `find().exec()`,
creating RxDocuments and cached query results; expiry also uses an unbounded
query. Allocation sampling attributes substantial allocations to remote-storage
JSON parsing, worker messages, and RxDocument access during retention.

The fix queries raw storage in timestamp/logId keyset pages of 500 through
RxDB's prepared-query path. It retains only IDs and accounted sizes across
pages, and deletes in batches of 500. The direct timestamp lower bound lets the
existing timestamp index advance; the logId tie-breaker avoids skipping equal
timestamps. Legacy row accounting excludes the same internal fields as
`RxDocument.toJSON()`. No new dependency, schema, lock, or background service.

## Validation

- Real RxDB regression: before the fix, a 1,201-row history returned all 1,201
  rows in one storage response (failed the 500-row bound); after, it passes.
- Real RxDB policy cases were run against both implementations: equal-timestamp
  byte eviction, multi-page expiry with the exact 30-day boundary retained, and
  legacy UTF-8 byte accounting. These cases passed both; this is not a claim of
  broad compatibility beyond those inputs.
- Full utils suite: 22 suites / 263 tests pass; utils lint and typecheck pass.
- Full core suite: 317 suites / 2,671 tests pass with one worker. The first
  two-worker run lost one Jest worker to OOM; 316 suites passed.
- Independent correctness and scope reviews found no actionable findings.
- Live C used the actual TypeScript implementation transpiled into the deployed
  retention module, plus aggregate-only diagnostic counters. It completed with
  no retention error. Overrides were disabled and their configuration removed
  afterward; no server deployment was performed.

## Other observations and limits

The initial capture on the long-lived incident renderer had main heap peak
434,753,400 bytes, worker peak 279,834,988 bytes, and peak 1,165 DOM nodes.
OS RSS sampling peaked at 1,898 MiB and later fell to 863 MiB; RSS is not Chrome
Task Manager footprint. A later main heap snapshot was 188 MB and contained
about 44,187 log-shaped objects. None of these measurements alone proves a
multi-gigabyte retained leak. A fresh renderer subsequently showed a physical
footprint peak around 1.35 GB and settled around 350–450 MB.

CPU profiles also showed FlexSearch append-history replay, and startup warnings
reported index rebuilds for small internal collections. Those were not shown
to cause the full reported peak and were not changed by this PR. The original
3 GB fresh-load footprint was not reproduced under these captures. If it
recurs after shipping both fixes, capture that renderer's footprint and heap
allocation timeline together before attributing the remainder.

## Local evidence provenance

Raw artifacts stay local because they may contain private store/session data:
`/tmp/frikifunko-retention-{baseline-A,skipped-B,restored-A2,paged-C}.json.gz`,
`/tmp/frikifunko-startup-20260916.json.gz`, and
`/tmp/frikifunko-startup-allocations-20260916.heapprofile`.
Temporary paths are not durable evidence storage. Heap values were extracted
from trace `UpdateCounters` events by renderer-main/storage-worker thread.
Deployed asset: `entry-fd7ffd6f6a91b99a0c8fb05d2bd82118.js` under
`https://cdn.jsdelivr.net/gh/wcpos/web-bundle@1.10/build/_expo/static/js/web/`.
The captured bytes match the asset at web-bundle commit
`00196a3f070c1ef88ab5acfd3bc95871dee0b2ea` byte-for-byte (`cmp`, exit 0),
with SHA-256 `bd345f173f4f26ea93736021555d6c3e16610400cb463185e92174ce03bf915a`.
The displayed app version is not used to infer bundle provenance, and the
`@1.10` CDN release selector is not assumed immutable.

## Behavior changes / regressions

Reads and deletes are paged instead of materializing the whole history. The
30-day / 25-MiB oldest-first policy is unchanged in the compared tests. The
sweep remains non-transactional: concurrent writes can drift from its byte
snapshot, an accepted existing limitation. No broad cross-platform performance
claim, full 3 GB resolution claim, or release/deployment claim is made.
