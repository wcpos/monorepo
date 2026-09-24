# Spike 2091 — native storage

**Simulator/emulator checks are not evidence for the native storage decision.**
Run the physical-device checklist in [DEVICE-RUN.md](DEVICE-RUN.md), then fill these answers.

## Leg 1 — semantics

On both physical devices (iPad Pro 12.9 2018 on iPadOS 26.6.2, Pixel 10 on Android 17) the
eleven smoke scenarios pass 11/11 on the shipped filesystem engine and 11/11 on the worklet
engine, and premium SQLite diverges on the same three scenarios on each device, identically to
the simulator runs: `$exists: false` also matches an explicit `null`; `$nin` drops documents
that lack the field; a mixed-type sort orders `null` before missing. All three are SQL
translation semantics of the premium engine on every platform, not device behaviour, and each is
a query-shape migration item for 2.0, the same three that spike 2210 recorded for the desktop
lane, not an engine verdict. Android needed one runtime adaptation for attachments (RxDB's
`data:` URL fetch, polyfilled in the app), which is also a migration item. Cross-row content
equality on the timed cells is reported per file in the generated section below: on the iPad,
every compared cell across the three rows at 2k and the SQLite row at 20k matched on canonical
SHA-256 content, no cell was excluded for a mismatch, and no returned result violated its
query's own sort order. The Pixel comparison is stated in the generated section once its
remaining rows land.

## Leg 2 — stability

Thirty random signal-9 stops per row, scored as in spikes 2144 and 2210: a stop is `lost` when a
write the app had acknowledged is missing after reopen. Process termination, not power loss.

| Row | iPad Pro 12.9 (2018): lost / 30 | repairs on reopen | reopen p50 | Pixel 10: lost / 30 | repairs | reopen p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Shipped filesystem engine (JS) | 2 | 30 of 30 reopens rebuilt indexes (`stale-changelog-op`; 60 repair lines) | 2.2 s | 8 (19 acked rows missing) | 30 of 30 reopens rebuilt indexes (60 lines) | 1.8 s |
| Worklet filesystem | 4 | 30 of 30 reopens rebuilt indexes (60 lines) | 2.0 s | 3 | 30 of 30 reopens rebuilt indexes (60 lines) | 1.0 s |
| Premium SQLite (expo-sqlite, WAL) | 0 | 0 | 0.29 s | 0 of 2 scored; 28 to run on the patched build | 0 | _pending_ |

Integrity was `ok` in every trial on every row (filesystem rows: no parse or salvage failure
lines; SQLite: `PRAGMA integrity_check` on a fresh connection returned one `ok` row). The two
filesystem rows lose acknowledged writes on both devices, and every one of their reopens is a
repair (the changelog is discarded and indexes are rebuilt from `documents.json`), which is what
the 2 s reopen is. Premium SQLite lost nothing in 30 stops on the iPad and needed no repair.

On the Pixel, the SQLite row's third trial hit an Android platform bug, not a storage outcome:
expo-modules-core's shared-object garbage-collection race
([expo/expo #49799](https://github.com/expo/expo/issues/49799), fixed upstream in
[#50513](https://github.com/expo/expo/pull/50513) on 2026-09-23 and in no published 57.x). The
remaining 28 Pixel trials run on a build carrying that fix as a spike-only patch, and are labelled
so in the generated section. The shipped 2.0 app needs the `expo-modules-core` release that
contains the fix before premium SQLite ships on Android.

## Leg 3 — speed

Spike 2143's cell set, seven samples per cell (25 for the two order writes, three for the fresh
seed and the cold open), p50 in milliseconds. Release Hermes bytecode on the physical device; the
timing wraps the storage call, so worklet round trips and SQLite's JSI crossing are inside it.

**iPad Pro 12.9 (2018), 2k products / 2.8k orders** (all three rows complete):

| Cell | Shipped engine (JS) | Worklet filesystem | Premium SQLite |
| --- | --- | --- | --- |
| Products grid, as shipped | 421 | **169** | 345 |
| Products grid, pushed 10 / 50 | 464 / 459 | 55 / 61 | **1 / 3** |
| Whole-catalogue read | 628 | **138** | 202 |
| Catalogue projection | 598 | 135 | **30** |
| findByIds 10 / 50 | 3 / 16 | 3 / 6 | **1 / 2** |
| Remote-id find / count | 830 / 728 | 82 / 72 | **4 / 2** |
| Fresh seed of the catalogue | 663 | **522** | 623 |
| Orders default find 10 / 50 | 862 / 864 | 107 / 127 | **3 / 11** |
| Orders default count | 887 | 113 | **46** |
| Orders open-status | **466** | 566 | 725 |
| Order line add / order create | 318 / 1 | 22 / 2 | **4** / 2 |

SQLite is fastest on twelve of sixteen cells, most by one to two orders of magnitude. The
worklet beats it on the as-shipped grid query, the whole-catalogue read and the fresh seed, and
the shipped engine beats both on orders open-status. The three cells SQLite loses are the ones
that materialise the largest result sets into JavaScript; the pushed grid variant of the same
query is 1 ms, so the as-shipped grid loss is the query shape, not the engine.

**iPad, 20k products / 20k orders.** SQLite completed the row (seed 2.2 s for products and 2.4 s
for orders, 201 MB on disk in three files). Neither filesystem row completed: each went silent for
30 minutes inside the fresh-seed cell (the shipped engine on two separate attempts, after two and
a half hours of measured cells each time; the worklet once, after 32 minutes), so both rows are
recorded as failed and the nine cells each did complete are kept as partial. The fresh-seed cell
writes the 20,000-document catalogue into a fresh instance in one bulk write; the initial seed of
the same data in 1,000-document batches took the worklet about two minutes.

| Cell, 20k | Shipped engine (partial) | Worklet filesystem (partial) | Premium SQLite |
| --- | --- | --- | --- |
| Products grid, as shipped | 7,929 | 4,737 | **4,268** (samples rose 0.7 s → 11.9 s) |
| Products grid, pushed 10 / 50 | 41,260 / 40,239 | 4,105 / 3,945 | **1 / 17** |
| Whole-catalogue read (20,000 rows) | 20,680 | **22,259** | 30,399 (17 s – 102 s) |
| Catalogue projection | 73,834 | 92,940 | **4,237** |
| findByIds 10 / 50 | 19 / 23 | 2 / 34 | **1 / 3** |
| Remote-id find / count | 239,962 / 238,784 | 1,052 / 922 | **39 / 4** |
| Fresh seed of the catalogue | silent > 30 min | silent > 30 min | 5,800 |
| Orders default find 10 / 50 / count | — | — | 3 / 14 / 529 |
| Orders open-status (12,000 rows) | — | — | 48,310 (7 s – 182 s) |
| Order line add / order create | — | — | 6 / 3 |
| Cold open to first read | — | — | 19 |

At 20k the whole-catalogue read is the only cell a filesystem row wins, and the shipped engine's
20.7 s there is inside SQLite's sample spread. On the indexed cells (pushed grid, findByIds,
remote-id) SQLite is 11 to 4,100 times faster than the worklet and 8 to 60,000 times faster than
the shipped engine; the as-shipped grid, which materialises 15,337 documents, is within 2× across
all three rows, and the projection read is 17 to 22 times faster on SQLite.

Ingest of 100-document batches on SQLite at 20k: p50 140 ms, p95 331 ms, 29 s for the 200
batches.

**JS thread and heap.** Lag sampler over the grid window, physical iPad: at 2k the shipped
engine's worst tick was 531 ms with 176 ticks over 50 ms, the worklet's 113 ms with 13, and
SQLite's 656 ms with 146. At 20k SQLite's worst tick was 6.8 s with 2,099 ticks over 50 ms. JS
heap after the last cell: 88 / 54 / 55 MB at 2k; SQLite 501 MB at 20k (247 MB after the seed).
SQLite over expo-sqlite is asynchronous but its rows are parsed into documents on the JS thread,
so on the cells that return thousands of documents it blocks the UI as much as the shipped engine
does; only the worklet row keeps the JS thread clear, because its parsing runs off-thread.

**Pixel 10.** _Pending: 2k rows for the worklet and SQLite, and all 20k rows, run after the
device returns to adb; the shipped engine's 2k row is complete._

## The answer

_Operator: apply the stability gate and the “wins clearly, not narrowly” bar._

## Environments

| Target | OS | Evidence |
| --- | --- | --- |
| iPad Pro 12.9-inch (3rd generation, 2018, A12X, `iPad8,5`), physical, Wi-Fi via `devicectl` | iPadOS 26.6.2 | Release build; smoke, 30 stops per row, 2k and 20k bench for all three rows, cold open and ingest |
| Pixel 10, physical, USB via `adb` | Android 17 | Release build with the expo-modules-core backport; smoke, 30 stops per row (SQLite rerun on the patched build), 2k and 20k bench for all three rows |
| iPad Pro 13-inch (M5), simulator | iOS 26.5 | Harness verification only: clean-install release smoke, small bench, 5 stops per row. Not evidence |
| Pixel_Tablet_API_35 (`emulator-5554`), emulator | Android 15 / API 35 | Harness verification only: release smoke, small bench, 5 stops per row. Not evidence |

Library versions on every device: Expo 57.0.24, React Native 0.86.3, expo-sqlite 57.0.3 (SQLite
3.50.3), expo-file-system 57.0.7, expo-opfs 1.0.9, rxdb and rxdb-premium 17.4.0 (47 patch
markers), react-native-worklets 0.11.4, `@wcpos/rxdb-storage-worklet` 0.1.1.

## Method notes

- Device observations from the physical iPad Pro 12.9 (2018), as recorded in Round 8 of
  `FIXES.md`: `JetsamEvent-2026-09-23-213137.ips` reports `highwater`, with Spotlight the victim;
  the spike app had 124349 resident pages of 16 KB (about 1.9 GB) and was not killed.
  `wcposspike2091.diskwrites_resource` reports 1.07 GB of file-backed writes in 4104 seconds.
  These are device observations, not conclusions about the engines.

- The Android build carries the spike-only [expo/expo #50513](https://github.com/expo/expo/pull/50513)
  shared-object lifetime backport. Subsequent SQLite Android crash and bench results must be
  gathered with this patched APK; existing measurements have not been rerun here. The shipped
  2.0 app needs a published `expo-modules-core` release containing the fix, not this spike patch.

- Release Hermes bytecode, no Metro. All rows share the premium distribution with 47 patch markers.
- iOS launches read the driver address from `Documents/spike2091-driver.txt`, placed by the
  driver before a plain launch; Android reads it from the launch intent. Both paths are verified
  on the physical devices (every iPad launch in `results/` went through the file drop over Wi-Fi).
- Seed-thread lag is sampled only at 20k. The 2k rows' `lag.seed` field carries the placeholder
  string `simulator — not meaningful` on the physical devices too; read it as "not sampled at
  2k", not as a simulator label. The 2k `lag.grid` numbers are real.
- Sources: spikes 2143/2210 and `wcpos/rxdb-storage-worklet` commit `acbbc93d642511d1d37bb119abc805e085235f6c`.
- Expo control: shipped expo-opfs copy/move/recovery patch, but raw storage with no recovery/probe
  wrapper and a no-op flush. Its root directory is the only engine configuration change.
- Android SQLite migration item: RxDB `utils-blob.createBlobFromBase64` fetches a base64 `data:`
  URL, which Expo's Android fetch rejects. `app/src/polyfills.ts` decodes those URLs locally into
  the installed Blob polyfill and returns a Response whose `blob()` resolves to it; other
  requests pass through. This is runtime adaptation, not a query-semantics divergence.
- Seed batches are 1000; ingest-100 uses a second fresh instance. Timing includes native/worklet
  calls; SHA-256 comparisons are outside timings. Cold open ends at first read, with OS cache warm.
- Benchmark saves, including incomplete runs, retain timings, per-sample signatures, verdicts
  and mismatch diagnostics, not sample id/hash arrays. Crash records retain transaction counts/sizes
  and the first 20 log lines with a truncation count; full ID snapshots are used only while scoring. Existing scores are unchanged.
- Repair counts now include only index-rebuild/storage-recovery hooks and non-hook
  `rebuilt|salvag` messages, not the shared `recovery` prefix or run-failure hooks. They count
  log lines, not unique repair operations. Recomputed all 30 committed crash trials from
  their untruncated logs: counts and outcomes are unchanged (filesystem repair evidence is
  index rebuilds). The 2210 port shares the prefix issue; follow up there, without a re-measure:
  its control's recorded repairs were index rebuilds, which are repairs.
- SQL translation now groups `$or`/`$and` terms before combining sibling fields. The 2143/2210
  `predicate()` has the same ungrouped shape; no measured cell there or here issued a mixed
  field-plus-`$or` selector. Their recorded cross-row content checks passed; no timings were rerun.
- Installed RxDB's BEGIN retry helper has no `console.dir`; results record retry counts.
- Physical signing/USB controls and large-scale measurements remain for the operator.

## Behavior changes / regressions

Round 8: jobs now dim brightness to minimum before keeping the display awake and restore the
saved value on completion or error, outside measured work. A killed crash writer cannot run
cleanup. Physical-device dimming, restoration and battery endurance have not been verified here.

No shipping application code changed. This spike does not establish broad compatibility,
power-loss durability or physical-device performance improvements.

Observed: the updated Android release smoke passes all eight binding scenarios on every row,
including SQLite attachments. The three SQLite query divergences (explicit-null existence,
missing/null membership and mixed-type ordering) remain; filesystem rows have none.
Observed: after uninstall/reinstall, the iOS release smoke fetched `/job` unaided on all three
rows, without a manual connection or debugger. All eight binding scenarios pass on every row;
the same three SQLite query probes fail, with zero filesystem divergences. iOS now uses the
Documents-file handoff instead of a custom-scheme launch. Bench and crash evidence is unchanged.

Round 3 (standalone verification only): absent benchmark rows/cells and smoke-only totals no
longer imply zero divergences. Failed sampled operations stop their timers; malformed launch
URLs leave polling available for Connect; cleanup failures retain smoke results. Console capture
and worklet forwarding preserve error text/stacks and handle circular values, ignore passing
assertions, and classify recovery hooks separately from failures. These error paths were tested
under Node with native boundaries replaced, not rerun in a simulator or on a physical device.

Round 4: jobs now hold keep-awake until completion (or process termination for a crash writer).
Bench files are compact on every save; retained signatures still support cross-row comparison.
A vanished stop target is `harness-failed`, not a storage outcome; later trials continue and the
run remains incomplete. Observed: rebuilt iOS simulator smoke is again 0 / 0 / 3, with every
scenario name, pass flag and detail equal to the prior committed simulator smoke. The standalone
suite checks keep-awake success/error cleanup and a pending writer, partial-save comparison,
and continuation after a missing stop target. Physical-device auto-lock prevention is unverified.

## Blocked

None.

<!-- generated:start -->
The RxDB mocha suite was not run on device: it is not hosted by React Native. Leg 1 is the eight-scenario binding smoke, three divergence probes, and leg 3 content checks.

Android stops use ActivityManager `am force-stop` (no lifecycle callbacks), not a direct POSIX signal. Cold opens restart the app; OS page cache remains warm. Simulator timer samples reflect display-link cadence and are not meaningful JS-lag evidence.

## android/emulator-5554 — simulator — not evidence

| Environment | Value |
| --- | --- |
| platform | android |
| device | emulator-5554 |
| deviceName | sdk_gphone64_arm64 |
| os | 15 |
| emulator | true |
| simulator | true |
| expo | 57.0.24 |
| react-native | 0.86.3 |
| expo-sqlite | 57.0.3 |
| expo-file-system | 57.0.7 |
| expo-opfs | 1.0.9 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| rxjs | 7.8.2 |
| react-native-worklets | 0.11.4 |
| premiumMarkers | 47 |
| expoOpfsShippedPatch | true |
| beginRetryConsoleDir | false |
| measuredAt | 2026-09-23T18:11:31.728Z |
| sqlite | 3.50.3 |

### crash.android.emulator-5554.json

Run complete.

| Row | Trials | Acked tx / rows | ok | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 5 | 114 / 11772 | 4 | 0 | 0 | 1 | 0 | 5 | 1 / 0 | 0 / 5 | 0 / 0 / 0 | 1163.83 |
| worklet-filesystem | 5 | 228 / 26682 | 5 | 0 | 0 | 0 | 0 | 5 | 0 / 0 | 1 / 4 | 0 / 0 / 0 | 1198.26 |
| expo-sqlite | 5 | 251 / 28856 | 5 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 1 / 4 | 0 / 0 / 0 | 169.11 |

### results.android.emulator-5554.json

Run complete.

All available cross-row cells match on canonical revision-independent SHA-256 content; returned-order differences and normalized-sort violations recorded separately.

#### small

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | 180.68 / 201.04 | 86.02 / 114.44 | 34.11 / 50.36 | 5.30 | 2.52 |
| products-grid-pushed-10 | 162.19 / 208.10 | 26.46 / 31.05 | 1.09 / 1.53 | 149.46 | 24.38 |
| products-grid-pushed-50 | 175.48 / 204.92 | 28.40 / 83.42 | 1.83 / 2.20 | 95.76 | 15.50 |
| products-catalogue-blob | 177.65 / 287.77 | 80.76 / 135.88 | 69.93 / 84.28 | 2.54 | 1.15 |
| products-catalogue-projection | 177.20 / 313.95 | 126.40 / 164.08 | 12.53 / 13.42 | 14.15 | 10.09 |
| products-findByIds-10 | 1.46 / 2.17 | 2.27 / 2.70 | 0.95 / 1.09 | 1.54 | 2.40 |
| products-findByIds-50 | 6.89 / 7.34 | 4.14 / 6.65 | 1.73 / 9.73 | 3.99 | 2.40 |
| products-remoteId-in-find | 237.23 / 259.63 | 42.61 / 46.39 | 2.75 / 3.10 | 86.42 | 15.52 |
| products-remoteId-in-count | 235.30 / 252.26 | 35.46 / 38.19 | 1.20 / 1.29 | 195.82 | 29.51 |
| seed-products | 191.72 / 192.48 | 195.55 / 196.25 | 160.14 / 227.25 | 1.20 | 1.22 |
| orders-default-find-10 | 247.06 / 277.11 | 55.12 / 58.79 | 1.77 / 2.86 | 139.37 | 31.10 |
| orders-default-find-50 | 247.19 / 278.10 | 63.39 / 65.46 | 5.52 / 5.74 | 44.79 | 11.49 |
| orders-default-count | 247.47 / 267.03 | 53.41 / 57.62 | 18.25 / 18.95 | 13.56 | 2.93 |
| orders-open-status | 154.75 / 187.71 | 105.07 / 110.37 | 52.04 / 61.96 | 2.97 | 2.02 |
| order-line-add | 114.87 / 123.95 | 20.21 / 22.10 | 6.28 / 7.04 | 18.29 | 3.22 |
| order-create | 0.26 / 0.39 | 4.67 / 6.19 | 2.95 / 3.70 | 0.09 | 1.58 |

- expo-filesystem-js: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-filesystem-js lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- expo-filesystem-js heapAfterSeed: {"js_heapSize":33554432,"js_allocatedBytes":33571568,"gcCount":52,"raw":{"js_VMExperiments":0,"js_numGCs":52,"js_gcCPUTime":0.023618000000000004,"js_gcTime":0.024229751,"js_totalAllocatedBytes":158108392,"js_allocatedBytes":33571568,"js_heapSize":33554432,"js_mallocSizeEstimate":0,"js_vaSize":33554432,"js_externalBytes":21134587,"js_markStackOverflows":0}}

- expo-filesystem-js heapAfterLast: {"js_heapSize":125829120,"js_allocatedBytes":142337120,"gcCount":3745,"raw":{"js_VMExperiments":0,"js_numGCs":3745,"js_gcCPUTime":3.6887670000000052,"js_gcTime":3.7227449479999937,"js_totalAllocatedBytes":13589417152,"js_allocatedBytes":142337120,"js_heapSize":125829120,"js_mallocSizeEstimate":0,"js_vaSize":125829120,"js_externalBytes":115650779,"js_markStackOverflows":0}}

- expo-filesystem-js memory: {"after-seed":{"totalPssKiB":188475},"after-last":{"totalPssKiB":385396}}

- worklet-filesystem: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- worklet-filesystem lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- worklet-filesystem heapAfterSeed: {"js_heapSize":29360128,"js_allocatedBytes":21884592,"gcCount":33,"raw":{"js_VMExperiments":0,"js_numGCs":33,"js_gcCPUTime":0.015868999999999998,"js_gcTime":0.01620708,"js_totalAllocatedBytes":66324248,"js_allocatedBytes":21884592,"js_heapSize":29360128,"js_mallocSizeEstimate":0,"js_vaSize":29360128,"js_externalBytes":14572427,"js_markStackOverflows":0}}

- worklet-filesystem heapAfterLast: {"js_heapSize":62914560,"js_allocatedBytes":42224976,"gcCount":992,"raw":{"js_VMExperiments":0,"js_numGCs":992,"js_gcCPUTime":1.8019449999999981,"js_gcTime":1.8294103049999981,"js_totalAllocatedBytes":3389834304,"js_allocatedBytes":42224976,"js_heapSize":62914560,"js_mallocSizeEstimate":0,"js_vaSize":62914560,"js_externalBytes":6512757,"js_markStackOverflows":0}}

- worklet-filesystem memory: {"after-seed":{"totalPssKiB":220420},"after-last":{"totalPssKiB":205934}}

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-sqlite lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- expo-sqlite heapAfterSeed: {"js_heapSize":29360128,"js_allocatedBytes":25241880,"gcCount":16,"raw":{"js_VMExperiments":0,"js_numGCs":16,"js_gcCPUTime":0.009418,"js_gcTime":0.010035955,"js_totalAllocatedBytes":56966592,"js_allocatedBytes":25241880,"js_heapSize":29360128,"js_mallocSizeEstimate":0,"js_vaSize":29360128,"js_externalBytes":138300,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":71303168,"js_allocatedBytes":42216360,"gcCount":881,"raw":{"js_VMExperiments":0,"js_numGCs":881,"js_gcCPUTime":3.0690740000000027,"js_gcTime":3.1009407110000016,"js_totalAllocatedBytes":3331115576,"js_allocatedBytes":42216360,"js_heapSize":71303168,"js_mallocSizeEstimate":0,"js_vaSize":71303168,"js_externalBytes":6532519,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":{"totalPssKiB":131639},"after-last":{"totalPssKiB":175744}}

### smoke.android.emulator-5554.json

Run complete.

| Row | Scenarios | Smoke/probe divergences | Leg 3 content mismatches | Total divergences |
| --- | --- | --- | --- | --- |
| expo-filesystem-js | 11 | 0 | 0 | 0 |
| worklet-filesystem | 11 | 0 | 0 | 0 |
| expo-sqlite | 11 | 3 | 0 | 3 |

- expo-sqlite / exists-explicit-null: {"query":{"selector":{"value":{"$exists":false}}},"expected":["p1"],"actual":["p0","p1"],"pass":false}; {"query":{"selector":{"value":{"$exists":true}}},"expected":["p0","p2","p3","p4","p5","p6","p7"],"actual":["p2","p3","p4","p5","p6","p7"],"pass":false}

- expo-sqlite / in-nin-missing: {"query":{"selector":{"value":{"$in":["blue",2]}}},"expected":["p2","p4"],"actual":["p2","p4"],"pass":true}; {"query":{"selector":{"value":{"$nin":["blue",2]}}},"expected":["p0","p1","p3","p5","p6","p7"],"actual":["p3","p5","p6","p7"],"pass":false}

- expo-sqlite / sort-case-accents-mixed-types: {"query":{"selector":{},"sort":[{"name":"asc"}]},"expected":["p1","p4","p0","p3","p5","p6","p7","p2"],"actual":["p1","p4","p0","p3","p5","p6","p7","p2"],"pass":true}; {"query":{"selector":{},"sort":[{"value":"asc"}]},"expected":["p1","p0","p4","p6","p7","p5","p2","p3"],"actual":["p0","p1","p4","p6","p7","p5","p2","p3"],"pass":false}

## ios/DDC18EF3-759A-494B-A0B1-E5139EA0A74F — simulator — not evidence

| Environment | Value |
| --- | --- |
| platform | ios |
| device | DDC18EF3-759A-494B-A0B1-E5139EA0A74F |
| deviceName | iPad Pro 13-inch (M5) |
| os | iOS-26-5 |
| simulator | true |
| expo | 57.0.24 |
| react-native | 0.86.3 |
| expo-sqlite | 57.0.3 |
| expo-file-system | 57.0.7 |
| expo-opfs | 1.0.9 |
| rxdb | 17.4.0 |
| rxdb-premium | 17.4.0 |
| rxjs | 7.8.2 |
| react-native-worklets | 0.11.4 |
| premiumMarkers | 47 |
| expoOpfsShippedPatch | true |
| beginRetryConsoleDir | false |
| measuredAt | 2026-09-23T18:05:26.559Z |
| sqlite | 3.50.3 |

### crash.ios.DDC18EF3-759A-494B-A0B1-E5139EA0A74F.json

Run complete.

| Row | Trials | Acked tx / rows | ok | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 5 | 187 / 21344 | 5 | 0 | 0 | 0 | 0 | 4 | 0 / 0 | 0 / 4 | 0 / 1 / 0 | 2942.28 |
| worklet-filesystem | 5 | 216 / 26568 | 4 | 0 | 0 | 1 | 0 | 5 | 1 / 0 | 2 / 3 | 0 / 0 / 0 | 1012.62 |
| expo-sqlite | 5 | 201 / 23456 | 5 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 1 / 2 | 0 / 2 / 0 | 114.70 |

### results.ios.DDC18EF3-759A-494B-A0B1-E5139EA0A74F.json

Run complete.

All available cross-row cells match on canonical revision-independent SHA-256 content; returned-order differences and normalized-sort violations recorded separately.

#### small

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | 232.56 / 327.29 | 90.30 / 106.14 | 32.08 / 72.00 | 7.25 | 2.82 |
| products-grid-pushed-10 | 268.99 / 384.61 | 25.87 / 28.86 | 0.40 / 0.45 | 671.57 | 64.60 |
| products-grid-pushed-50 | 343.90 / 380.69 | 28.61 / 31.59 | 0.97 / 1.25 | 354.96 | 29.53 |
| products-catalogue-blob | 234.38 / 260.91 | 88.53 / 164.79 | 150.85 / 205.54 | 1.55 | 0.59 |
| products-catalogue-projection | 562.72 / 673.55 | 156.96 / 280.31 | 11.13 / 22.63 | 50.56 | 14.10 |
| products-findByIds-10 | 1.11 / 3.00 | 0.67 / 0.69 | 0.33 / 0.55 | 3.40 | 2.06 |
| products-findByIds-50 | 6.24 / 8.38 | 2.43 / 3.59 | 0.88 / 9.50 | 7.06 | 2.75 |
| products-remoteId-in-find | 454.31 / 576.98 | 41.09 / 69.47 | 1.87 / 5.42 | 243.52 | 22.03 |
| products-remoteId-in-count | 444.40 / 464.01 | 34.29 / 35.49 | 0.73 / 0.81 | 605.04 | 46.68 |
| seed-products | 227.36 / 254.94 | 437.97 / 583.21 | 114.08 / 181.88 | 1.99 | 3.84 |
| orders-default-find-10 | 418.53 / 1142.95 | 52.02 / 54.04 | 1.15 / 1.21 | 362.69 | 45.08 |
| orders-default-find-50 | 408.28 / 1136.09 | 58.38 / 76.33 | 5.01 / 11.36 | 81.43 | 11.64 |
| orders-default-count | 452.50 / 1148.13 | 50.66 / 53.10 | 20.35 / 20.63 | 22.23 | 2.49 |
| orders-open-status | 245.79 / 860.62 | 274.11 / 662.24 | 136.33 / 527.83 | 1.80 | 2.01 |
| order-line-add | 201.09 / 290.53 | 11.19 / 11.55 | 1.37 / 2.82 | 147.18 | 8.19 |
| order-create | 5.38 / 19.75 | 0.89 / 1.07 | 0.68 / 2.00 | 7.96 | 1.31 |

- expo-filesystem-js: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-filesystem-js lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- expo-filesystem-js heapAfterSeed: {"js_heapSize":41943040,"js_allocatedBytes":34235672,"gcCount":66,"raw":{"js_VMExperiments":0,"js_numGCs":66,"js_gcCPUTime":0.021207999999999994,"js_gcTime":0.020667295,"js_totalAllocatedBytes":227454176,"js_allocatedBytes":34235672,"js_heapSize":41943040,"js_mallocSizeEstimate":0,"js_vaSize":41943040,"js_externalBytes":23035141,"js_markStackOverflows":0}}

- expo-filesystem-js heapAfterLast: {"js_heapSize":163577856,"js_allocatedBytes":203135880,"gcCount":5202,"raw":{"js_VMExperiments":0,"js_numGCs":5202,"js_gcCPUTime":30.220126999999835,"js_gcTime":30.200501958000007,"js_totalAllocatedBytes":21196090880,"js_allocatedBytes":203135880,"js_heapSize":163577856,"js_mallocSizeEstimate":0,"js_vaSize":163577856,"js_externalBytes":97570841,"js_markStackOverflows":0}}

- expo-filesystem-js memory: {"after-seed":null,"after-last":null}

- worklet-filesystem: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- worklet-filesystem lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- worklet-filesystem heapAfterSeed: {"js_heapSize":46137344,"js_allocatedBytes":36156224,"gcCount":41,"raw":{"js_VMExperiments":0,"js_numGCs":41,"js_gcCPUTime":0.017062000000000004,"js_gcTime":0.016624788,"js_totalAllocatedBytes":106371168,"js_allocatedBytes":36156224,"js_heapSize":46137344,"js_mallocSizeEstimate":0,"js_vaSize":46137344,"js_externalBytes":20149457,"js_markStackOverflows":0}}

- worklet-filesystem heapAfterLast: {"js_heapSize":96468992,"js_allocatedBytes":58267544,"gcCount":1705,"raw":{"js_VMExperiments":0,"js_numGCs":1705,"js_gcCPUTime":10.956096000000006,"js_gcTime":10.948349185000005,"js_totalAllocatedBytes":6187769064,"js_allocatedBytes":58267544,"js_heapSize":96468992,"js_mallocSizeEstimate":0,"js_vaSize":96468992,"js_externalBytes":6512757,"js_markStackOverflows":0}}

- worklet-filesystem memory: {"after-seed":null,"after-last":null}

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-sqlite lag: {"seed":"simulator — not meaningful","grid":"simulator — not meaningful"}

- expo-sqlite heapAfterSeed: {"js_heapSize":41943040,"js_allocatedBytes":29567384,"gcCount":23,"raw":{"js_VMExperiments":0,"js_numGCs":23,"js_gcCPUTime":0.009657000000000004,"js_gcTime":0.009429624999999999,"js_totalAllocatedBytes":81913520,"js_allocatedBytes":29567384,"js_heapSize":41943040,"js_mallocSizeEstimate":0,"js_vaSize":41943040,"js_externalBytes":69150,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":104857600,"js_allocatedBytes":77663576,"gcCount":1690,"raw":{"js_VMExperiments":0,"js_numGCs":1690,"js_gcCPUTime":14.171561,"js_gcTime":14.164883080000015,"js_totalAllocatedBytes":6032900592,"js_allocatedBytes":77663576,"js_heapSize":104857600,"js_mallocSizeEstimate":0,"js_vaSize":104857600,"js_externalBytes":13026465,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":null,"after-last":null}

### smoke.ios.DDC18EF3-759A-494B-A0B1-E5139EA0A74F.json

Run complete.

| Row | Scenarios | Smoke/probe divergences | Leg 3 content mismatches | Total divergences |
| --- | --- | --- | --- | --- |
| expo-filesystem-js | 11 | 0 | 0 | 0 |
| worklet-filesystem | 11 | 0 | 0 | 0 |
| expo-sqlite | 11 | 3 | 0 | 3 |

- expo-sqlite / exists-explicit-null: {"query":{"selector":{"value":{"$exists":false}}},"expected":["p1"],"actual":["p0","p1"],"pass":false}; {"query":{"selector":{"value":{"$exists":true}}},"expected":["p0","p2","p3","p4","p5","p6","p7"],"actual":["p2","p3","p4","p5","p6","p7"],"pass":false}

- expo-sqlite / in-nin-missing: {"query":{"selector":{"value":{"$in":["blue",2]}}},"expected":["p2","p4"],"actual":["p2","p4"],"pass":true}; {"query":{"selector":{"value":{"$nin":["blue",2]}}},"expected":["p0","p1","p3","p5","p6","p7"],"actual":["p3","p5","p6","p7"],"pass":false}

- expo-sqlite / sort-case-accents-mixed-types: {"query":{"selector":{},"sort":[{"name":"asc"}]},"expected":["p1","p4","p0","p3","p5","p6","p7","p2"],"actual":["p1","p4","p0","p3","p5","p6","p7","p2"],"pass":true}; {"query":{"selector":{},"sort":[{"value":"asc"}]},"expected":["p1","p0","p4","p6","p7","p5","p2","p3"],"actual":["p0","p1","p4","p6","p7","p5","p2","p3"],"pass":false}

## Cross-device summary

Lowest p50, descriptive only. Simulator files are listed for harness verification, not the platform decision.

| Scale / cell | android/emulator-5554 — simulator — not evidence | ios/DDC18EF3-759A-494B-A0B1-E5139EA0A74F — simulator — not evidence |
| --- | --- | --- |
| small/products-grid-asShipped | expo-sqlite | expo-sqlite |
| small/products-grid-pushed-10 | expo-sqlite | expo-sqlite |
| small/products-grid-pushed-50 | expo-sqlite | expo-sqlite |
| small/products-catalogue-blob | expo-sqlite | worklet-filesystem |
| small/products-catalogue-projection | expo-sqlite | expo-sqlite |
| small/products-findByIds-10 | expo-sqlite | expo-sqlite |
| small/products-findByIds-50 | expo-sqlite | expo-sqlite |
| small/products-remoteId-in-find | expo-sqlite | expo-sqlite |
| small/products-remoteId-in-count | expo-sqlite | expo-sqlite |
| small/seed-products | expo-sqlite | expo-sqlite |
| small/orders-default-find-10 | expo-sqlite | expo-sqlite |
| small/orders-default-find-50 | expo-sqlite | expo-sqlite |
| small/orders-default-count | expo-sqlite | expo-sqlite |
| small/orders-open-status | expo-sqlite | expo-sqlite |
| small/order-line-add | expo-sqlite | expo-sqlite |
| small/order-create | expo-filesystem-js | expo-sqlite |
<!-- generated:end -->
