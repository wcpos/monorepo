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
query's own sort order. On the Pixel every available cross-row cell matched as well: the three
rows at 2k, and the worklet and SQLite rows against each other at 20k (the shipped engine's nine
partial 20k cells are reported but never compared on either device).

## Leg 2 — stability

Thirty random signal-9 stops per row, scored as in spikes 2144 and 2210: a stop is `lost` when a
write the app had acknowledged is missing after reopen. Process termination, not power loss.

| Row | iPad Pro 12.9 (2018): lost / 30 | repairs on reopen | reopen p50 | Pixel 10: lost / 30 | repairs | reopen p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Shipped filesystem engine (JS) | 2 | 30 of 30 reopens rebuilt indexes (`stale-changelog-op`; 60 repair lines) | 2.2 s | 8 (19 acked rows missing) | 30 of 30 reopens rebuilt indexes (60 lines) | 1.8 s |
| Worklet filesystem | 4 | 30 of 30 reopens rebuilt indexes (60 lines) | 2.0 s | 3 | 30 of 30 reopens rebuilt indexes (60 lines) | 1.0 s |
| Premium SQLite (expo-sqlite, WAL) | 0 | 0 | 0.29 s | 0 (2 on the unpatched build, 28 on the backport) | 0 | 0.21 s |

Integrity was `ok` in every trial on every row (filesystem rows: no parse or salvage failure
lines; SQLite: `PRAGMA integrity_check` on a fresh connection returned one `ok` row). The two
filesystem rows lose acknowledged writes on both devices, and every one of their reopens is a
repair (the changelog is discarded and indexes are rebuilt from `documents.json`), which is what
the 1 to 2 s reopen is. Premium SQLite lost nothing in 30 stops on either device and needed no
repair; its reopen is the WAL replay, 0.2 to 0.3 s.

On the Pixel, the SQLite row's third trial hit an Android platform bug, not a storage outcome:
expo-modules-core's shared-object garbage-collection race
([expo/expo #49799](https://github.com/expo/expo/issues/49799), fixed upstream in
[#50513](https://github.com/expo/expo/pull/50513) on 2026-09-23 and in no published 57.x). The
remaining 28 Pixel trials ran on a build carrying that fix as a spike-only patch (all 28 `ok`,
no repair); the crash file's `environment.runs` records the two runs. The shipped 2.0 app needs the
`expo-modules-core` release that contains the fix before premium SQLite ships on Android.

## Leg 3 — speed

Spike 2143's cell set, seven samples per cell (25 for the two order writes, three for the fresh
seed and the cold open), p50 in milliseconds. Release Hermes bytecode on the physical device; the
timing wraps the storage call, so worklet round trips and SQLite's JSI crossing are inside it.

**iPad Pro 12.9 (2018), 2k products / 2k orders** (all three rows complete):

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

SQLite is fastest on eleven of sixteen cells, most by one to two orders of magnitude. The
worklet beats it on the as-shipped grid query, the whole-catalogue read and the fresh seed, and
the shipped engine beats both on orders open-status and on order create (1 ms against 2). Three
of the five cells SQLite loses are the ones that materialise the largest result sets into
JavaScript; the pushed grid variant of the same query is 1 ms, so the as-shipped grid loss is the
query shape, not the engine. The other two are a single-document write and the fresh seed, where
the filesystem rows' append-only write is genuinely cheaper.

**iPad, 20k products / 20k orders.** SQLite completed the row (seed 2.2 s for products and 2.4 s
for orders, 201 MB on disk in three files). Neither filesystem row completed: each went silent for
30 minutes inside the fresh-seed cell (the shipped engine on two separate attempts, after two and
a half hours of measured cells each time; the worklet once, after 32 minutes), so both rows are
recorded as failed and the nine cells each did complete are kept as partial. The fresh-seed cell
seeds the 20,000-document catalogue into a fresh instance in the same 1,000-document batches as
the initial seed, then reads all 20,000 documents back, hashes them against the fixture and
removes the instance; none of those steps posts a progress event, so the silence says only that
one sample did not finish inside 30 minutes, not which step stalled. The initial seed of the same
data took the worklet about two minutes on this device.

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

**Pixel 10, 2k products / 2k orders** (all three rows complete):

| Cell | Shipped engine (JS) | Worklet filesystem | Premium SQLite |
| --- | --- | --- | --- |
| Products grid, as shipped | 296 | 238 | **142** |
| Products grid, pushed 10 / 50 | 249 / 286 | 91 / 85 | **5 / 22** |
| Whole-catalogue read | 260 | 185 | **182** |
| Catalogue projection | 274 | 197 | **54** |
| findByIds 10 / 50 | **5** / 16 | 10 / 25 | 7 / 16 |
| Remote-id find / count | 296 / 297 | 102 / 90 | **32 / 15** |
| Fresh seed of the catalogue | **357** | 365 | 389 |
| Orders default find 10 / 50 | 442 / 467 | 150 / 169 | **21 / 39** |
| Orders default count | 421 | 145 | **71** |
| Orders open-status | 314 | 226 | **150** |
| Order line add / order create | 283 / **1** | 63 / 12 | **30** / 23 |

The Pixel is faster than the 2018 iPad on every row, and the gaps narrow: SQLite is fastest on
thirteen of sixteen cells (the whole-catalogue read and findByIds 50 by a few hundredths of a
millisecond), and the shipped engine keeps only the three cells that touch ten documents by
primary key (findByIds 10), write one document (order create) or write the catalogue once (fresh
seed).

**Pixel 10, 20k products / 20k orders.** The worklet and SQLite rows completed. The shipped
engine went silent for 30 minutes inside the fresh-seed cell, as on the iPad, and keeps its nine
measured cells as partial. The same engine on the worklet took 7.6 s for the same cell on this
device, so the silence is specific to running it on the JS thread at this scale; which step of
the sample stalls (the batched writes, the 20,000-document verification read, or the instance
removal) was not instrumented.

| Cell, 20k | Shipped engine (partial) | Worklet filesystem | Premium SQLite |
| --- | --- | --- | --- |
| Products grid, as shipped | 5,749 | 1,934 | **880** |
| Products grid, pushed 10 / 50 | 10,660 / 10,776 | 1,447 / 1,454 | **11 / 19** |
| Whole-catalogue read (20,000 rows) | 8,036 | 4,827 | **2,369** (1.8 s – 7.6 s) |
| Catalogue projection | 8,443 | 3,587 | **335** |
| findByIds 10 / 50 | 9 / 32 | 10 / 26 | **4 / 13** |
| Remote-id find / count | 10,655 / 9,918 | 702 / 616 | **21 / 12** |
| Fresh seed of the catalogue | silent > 30 min | 7,553 | **3,544** |
| Orders default find 10 / 50 / count | — | 969 / 957 / 1,001 | **18 / 40 / 363** |
| Orders open-status (12,000 rows) | — | **2,206** | 2,916 |
| Order line add / order create | — | 210 / **12** | **30** / 18 |
| Cold open to first read | — | 982 | **37** |
| Ingest per 100 documents, p50 / p95 | — | 195 / 345 | **51 / 140** |

At 20k on the Pixel SQLite is fastest on fifteen of seventeen cells; the worklet keeps the
open-status read (12,000 documents materialised) and order create. Against the shipped engine's
nine cells SQLite is 2 to 970 times faster; against the worklet 2 to 130 times on the indexed
cells and 2 to 27 times on the whole-catalogue, projection and cold-open reads.

**JS thread, heap and disk on the Pixel.** Worst grid tick at 2k: shipped 320 ms (107 ticks over
50 ms), worklet 112 ms (13), SQLite 66 ms (1). At 20k: worklet 3.8 s (458 ticks), SQLite 1.0 s
(264 ticks); the seed window was under 130 ms on both. JS heap after the last cell: 106 / 38 /
43 MB at 2k; 351 MB (worklet) and 348 MB (SQLite) at 20k. Process PSS after the last 20k cell:
1.25 GB worklet, 926 MB SQLite. Disk at 20k: worklet 152 MB in 26 files, SQLite 201 MB in three
files (WAL). The worklet's JS-thread advantage at 2k disappears at 20k on this device: its own
grid cell materialises the same 15,337 documents on the JS thread once the worklet returns them.

## The answer

**Premium SQLite over `expo-sqlite` is the native engine for 2.0.** It is the only row that clears
the stability gate, and on the queries the till runs it beats both filesystem rows by one to four
orders of magnitude at 20k on both devices. It does not win every cell: the reads that materialise
thousands of documents are where a filesystem row can still tie or win, and those are the query
shapes 2.0 retires whatever the engine.

**Stability gate.** SQLite lost nothing in 30 signal-9 stops on the iPad and 0 in 30 on
the Pixel, with no repair on any reopen and a clean `PRAGMA integrity_check` every time. Both
filesystem rows lose acknowledged writes on both devices (shipped engine 2 and 8 of 30, worklet 4
and 3 of 30) and rebuilt their indexes on every one of the 120 reopens measured. The gate is
failed, so neither is a candidate at any speed; hosting the filesystem engine on a worklet moves
the thread, not the durability.

**Speed against the shipped engine.** Not narrow. At 20k the shipped engine could not finish its
row on either device (silent past the 30-minute budget in the fresh-seed cell, three attempts),
so it has nine cells at that scale. On those nine, SQLite is 2 to 970 times faster on the Pixel
and 2 to 60,000 times faster on the iPad; the pushed grid the till actually issues is 11 ms
against 10,660 ms on the Pixel and 1 ms against 41,260 ms on the iPad. The one cell the shipped
engine wins anywhere is the iPad's whole-catalogue read (20.7 s against 30.4 s, inside SQLite's
sample spread); on the Pixel SQLite wins that cell too (2.4 s against 8.0 s).

**Speed against the worklet.** At 2k the worklet keeps four cells on the iPad (as-shipped grid,
whole-catalogue read, fresh seed, open-status) and none outright on the Pixel. At 20k it completed
its row only on the Pixel, where SQLite is 2 to 130 times faster on the indexed and orders cells,
2 to 27 times faster on the catalogue, projection and cold-open reads, and loses only open-status
(2.9 s against 2.2 s for 12,000 documents) and order create. On the iPad the worklet's nine 20k
cells lose to SQLite by 11 to 4,100 times except the whole-catalogue read (22.3 s against 30.4 s).
The worklet's real advantage is the JS thread at small scale (113 ms worst tick against SQLite's
656 ms on the iPad at 2k); at 20k that advantage is gone on the Pixel (3.8 s against 1.0 s),
because the worklet still hands 15,337 parsed documents to the JS thread, and on the iPad SQLite's
as-shipped grid held the thread for 6.8 s. That is the cost of the query shape, not the engine.

**What this decides and what it does not.** The engine is decided. Three query shapes must not
survive into 2.0 on any engine, because at 20k they either block the JS thread or read the whole
catalogue: the as-shipped products grid (15,337 documents returned without a limit; the pushed
variant of the same selector is 1 to 11 ms), the open-status orders read (12,000 documents for a
count), and the whole-catalogue read (the substring search index's input, 2.4 to 30 s). The Leg 1
migration items (`$exists: false` against explicit null, `$nin` and missing fields, mixed-type
sort order) are query-layer and shared with web and desktop. Two Android conditions ride with the
decision: a published `expo-modules-core` carrying expo/expo #50513 before SQLite ships there
(the spike measured on a backport; without it the shared-object race rejects `prepareAsync`
within minutes), and the `data:` URL fetch polyfill for premium's base64 attachment path.
Hosting SQLite's document parsing off the JS thread is a separate question the map does not yet
hold; the numbers say it is worth asking only after the three query shapes are gone.

**Footprint at 20k.** SQLite 201 MB on disk in three files on both devices (WAL); JS heap after
the last cell 348 MB on the Pixel and 501 MB on the iPad, against the worklet's 351 MB and 152 MB
in 26 files on the Pixel. Cold open to first read: 19 ms on the iPad, 37 ms on the Pixel, against
982 ms for the worklet. Ingest of 100-document batches: 51 ms p50 on the Pixel, 140 ms on the iPad.

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
- Cold-open samples on the Pixel rows run after 07:30Z on 2026-09-24 (worklet 20k, SQLite 2k and
  20k) were taken while the driver swallowed a failed post-job stop (fixed in round 12). They are
  consistent with fresh processes (the worklet's 982 ms cold first read against its 10 ms warm
  findByIds; SQLite's 37 ms against 4 ms; `am force-stop` never left the app alive in any of
  the 90 confirmed crash-leg stops on the same device), but that is consistency, not proof.
- Physical signing/USB controls and large-scale measurements remain for the operator.

## Behavior changes / regressions

Round 8: jobs now dim brightness to minimum before keeping the display awake and restore the
saved value on completion or error, outside measured work. A killed crash writer cannot run
cleanup. Verified on the physical iPad: with the screen dimmed and the iPad on a wall charger,
every remaining leg ran to its end without a power event (the two earlier battery-flat stops were
at full brightness on the Mac's USB port). Round 11: the Android activity shows over the lock
screen and turns the screen on, and the driver stops a timed-out app before the next launch;
verified by the resumed Pixel rows launching from a locked, dozing phone.

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
and continuation after a missing stop target. Keep-awake held both physical devices through
every job; the only lock seen was on the Pixel between rows, after a job's app had been stopped.

## Blocked

None.

<!-- generated:start -->
The RxDB mocha suite was not run on device: it is not hosted by React Native. Leg 1 is the eight-scenario binding smoke, three divergence probes, and leg 3 content checks.

Android stops use ActivityManager `am force-stop` (no lifecycle callbacks), not a direct POSIX signal. Cold opens restart the app; OS page cache remains warm. Simulator timer samples reflect display-link cadence and are not meaningful JS-lag evidence.

## android/5C270DLCR0020Q

| Environment | Value |
| --- | --- |
| platform | android |
| device | 5C270DLCR0020Q |
| deviceName | Pixel 10 |
| os | 17 |
| emulator | false |
| simulator | false |
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
| measuredAt | 2026-09-24T07:52:57.867Z |
| runs | [{"startedAt":"2026-09-23T21:18:15.970Z","rows":["expo-filesystem-js","worklet-filesystem","expo-sqlite"],"scales":[]},{"startedAt":"2026-09-24T07:52:57.867Z","rows":["expo-filesystem-js","worklet-filesystem","expo-sqlite"],"scales":[]}] |
| sqlite | 3.50.3 |

### crash.android.5C270DLCR0020Q.json

Run complete.

| Row | Trials | Acked tx / rows | ok | writer-failed | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 30 | 503 / 52581 | 22 | 0 | 0 | 0 | 8 | 0 | 30 | 8 / 0 | 0 / 19 | 0 / 11 / 0 | 1766.88 |
| worklet-filesystem | 30 | 678 / 73903 | 27 | 0 | 0 | 0 | 3 | 0 | 30 | 3 / 0 | 3 / 22 | 0 / 5 / 0 | 1036.43 |
| expo-sqlite | 30 | 778 / 81614 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 3 / 22 | 0 / 5 / 0 | 211.70 |

### results.android.5C270DLCR0020Q.json

**Incomplete:** interrupted

- expo-filesystem-js large: harness-failed — Error: Harness timeout: no message from the app for 30 minutes while running     at jobTimeout (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/control.mjs:63:12)     at waitResult (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:121:23)     at process.processTicksAndRejections (node:internal/process/task_queues:104:5)     at async run (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:130:18)     at async file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:197:26

#### expo-filesystem-js large — partial (row failed)

Measured before the failure; not compared. — means samples/timings were not posted.

| Cell | Samples | p50 ms | p95 ms |
| --- | --- | --- | --- |
| products-grid-asShipped | 7 | 5748.72 | 7116.59 |
| products-grid-pushed-10 | 7 | 10660.07 | 11312.36 |
| products-grid-pushed-50 | 7 | 10776.09 | 11390.92 |
| products-catalogue-blob | 7 | 8036.19 | 10651.50 |
| products-catalogue-projection | 7 | 8443.27 | 10810.64 |
| products-findByIds-10 | 7 | 8.93 | 11.30 |
| products-findByIds-50 | 7 | 32.40 | 36.60 |
| products-remoteId-in-find | 7 | 10655.42 | 11599.70 |
| products-remoteId-in-count | 7 | 9917.93 | 10484.53 |

All available cross-row cells match on canonical revision-independent SHA-256 content; returned-order differences and normalized-sort violations recorded separately.

#### small

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | 295.83 / 336.31 | 238.38 / 272.06 | 142.46 / 145.81 | 2.08 | 1.67 |
| products-grid-pushed-10 | 248.56 / 347.68 | 90.72 / 98.39 | 4.61 / 8.02 | 53.95 | 19.69 |
| products-grid-pushed-50 | 286.26 / 324.20 | 85.29 / 109.40 | 21.57 / 23.58 | 13.27 | 3.95 |
| products-catalogue-blob | 260.00 / 337.36 | 185.27 / 217.52 | 181.80 / 216.95 | 1.43 | 1.02 |
| products-catalogue-projection | 274.19 / 368.44 | 196.97 / 246.38 | 54.21 / 68.72 | 5.06 | 3.63 |
| products-findByIds-10 | 5.21 / 11.99 | 9.69 / 12.47 | 7.10 / 10.93 | 0.73 | 1.36 |
| products-findByIds-50 | 15.75 / 29.78 | 25.03 / 28.84 | 15.68 / 19.73 | 1.00 | 1.60 |
| products-remoteId-in-find | 296.31 / 384.55 | 102.32 / 123.66 | 31.87 / 40.33 | 9.30 | 3.21 |
| products-remoteId-in-count | 296.89 / 351.08 | 89.66 / 127.63 | 15.05 / 27.01 | 19.72 | 5.96 |
| seed-products | 357.19 / 364.30 | 365.28 / 430.69 | 389.47 / 460.81 | 0.92 | 0.94 |
| orders-default-find-10 | 442.11 / 503.48 | 150.13 / 195.61 | 20.98 / 22.92 | 21.08 | 7.16 |
| orders-default-find-50 | 466.84 / 603.50 | 169.08 / 179.02 | 38.62 / 53.61 | 12.09 | 4.38 |
| orders-default-count | 420.52 / 532.91 | 144.67 / 162.26 | 71.30 / 73.78 | 5.90 | 2.03 |
| orders-open-status | 314.22 / 346.64 | 226.29 / 244.50 | 150.31 / 174.25 | 2.09 | 1.51 |
| order-line-add | 283.43 / 321.06 | 63.11 / 75.76 | 29.90 / 45.39 | 9.48 | 2.11 |
| order-create | 0.59 / 1.65 | 12.46 / 22.26 | 22.53 / 29.89 | 0.03 | 0.55 |

- expo-filesystem-js: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-filesystem-js lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":320.37315198779106,"ticksOver50Ms":107}}

- expo-filesystem-js heapAfterSeed: {"js_heapSize":33554432,"js_allocatedBytes":33707208,"gcCount":53,"raw":{"js_VMExperiments":0,"js_numGCs":53,"js_gcCPUTime":0.04221600000000002,"js_gcTime":0.04170997700000001,"js_totalAllocatedBytes":158118000,"js_allocatedBytes":33707208,"js_heapSize":33554432,"js_mallocSizeEstimate":0,"js_vaSize":33554432,"js_externalBytes":23021481,"js_markStackOverflows":0}}

- expo-filesystem-js heapAfterLast: {"js_heapSize":134217728,"js_allocatedBytes":111380344,"gcCount":3841,"raw":{"js_VMExperiments":0,"js_numGCs":3841,"js_gcCPUTime":4.190036999999989,"js_gcTime":4.19400720200001,"js_totalAllocatedBytes":13590713128,"js_allocatedBytes":111380344,"js_heapSize":134217728,"js_mallocSizeEstimate":0,"js_vaSize":134217728,"js_externalBytes":87383198,"js_markStackOverflows":0}}

- expo-filesystem-js memory: {"after-seed":{"totalPssKiB":272861},"after-last":{"totalPssKiB":435273}}

- worklet-filesystem seed wall-clock ms: products 424.54; orders 591.70 (whole collection, including progress delivery; not compared).

- worklet-filesystem: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- worklet-filesystem lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":112.112733989954,"ticksOver50Ms":13}}

- worklet-filesystem heapAfterSeed: {"js_heapSize":29360128,"js_allocatedBytes":21958256,"gcCount":33,"raw":{"js_VMExperiments":0,"js_numGCs":33,"js_gcCPUTime":0.03530899999999999,"js_gcTime":0.038160311,"js_totalAllocatedBytes":66534848,"js_allocatedBytes":21958256,"js_heapSize":29360128,"js_mallocSizeEstimate":0,"js_vaSize":29360128,"js_externalBytes":14572931,"js_markStackOverflows":0}}

- worklet-filesystem heapAfterLast: {"js_heapSize":62914560,"js_allocatedBytes":39595088,"gcCount":991,"raw":{"js_VMExperiments":0,"js_numGCs":991,"js_gcCPUTime":1.5302600000000015,"js_gcTime":1.5380723949999993,"js_totalAllocatedBytes":3394208072,"js_allocatedBytes":39595088,"js_heapSize":62914560,"js_mallocSizeEstimate":0,"js_vaSize":62914560,"js_externalBytes":6528520,"js_markStackOverflows":0}}

- worklet-filesystem memory: {"after-seed":{"totalPssKiB":288466},"after-last":{"totalPssKiB":402529}}

- expo-sqlite seed wall-clock ms: products 188.76; orders 250.07 (whole collection, including progress delivery; not compared).

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-sqlite lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":65.53513100743294,"ticksOver50Ms":1}}

- expo-sqlite heapAfterSeed: {"js_heapSize":29360128,"js_allocatedBytes":25391808,"gcCount":16,"raw":{"js_VMExperiments":0,"js_numGCs":16,"js_gcCPUTime":0.023857,"js_gcTime":0.024277135000000002,"js_totalAllocatedBytes":57146560,"js_allocatedBytes":25391808,"js_heapSize":29360128,"js_mallocSizeEstimate":0,"js_vaSize":29360128,"js_externalBytes":138804,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":71303168,"js_allocatedBytes":44640144,"gcCount":885,"raw":{"js_VMExperiments":0,"js_numGCs":885,"js_gcCPUTime":2.7520980000000024,"js_gcTime":2.769868174,"js_totalAllocatedBytes":3335418816,"js_allocatedBytes":44640144,"js_heapSize":71303168,"js_mallocSizeEstimate":0,"js_vaSize":71303168,"js_externalBytes":13043074,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":{"totalPssKiB":206249},"after-last":{"totalPssKiB":341432}}

#### large

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | — | 1933.98 / 5636.01 | 879.96 / 1738.53 | — | — |
| products-grid-pushed-10 | — | 1447.29 / 1555.24 | 10.88 / 11.22 | — | — |
| products-grid-pushed-50 | — | 1453.88 / 1813.80 | 19.39 / 62.67 | — | — |
| products-catalogue-blob | — | 4827.22 / 6545.52 | 2369.17 / 7609.10 | — | — |
| products-catalogue-projection | — | 3586.57 / 6610.46 | 335.17 / 420.43 | — | — |
| products-findByIds-10 | — | 10.35 / 16.64 | 4.11 / 5.55 | — | — |
| products-findByIds-50 | — | 26.43 / 32.15 | 13.48 / 22.90 | — | — |
| products-remoteId-in-find | — | 702.45 / 852.90 | 21.09 / 27.71 | — | — |
| products-remoteId-in-count | — | 616.04 / 659.97 | 11.74 / 17.57 | — | — |
| seed-products | — | 7553.38 / 7637.42 | 3543.66 / 3868.19 | — | — |
| orders-default-find-10 | — | 969.06 / 1149.93 | 17.68 / 25.69 | — | — |
| orders-default-find-50 | — | 956.93 / 1029.45 | 39.85 / 47.39 | — | — |
| orders-default-count | — | 1000.63 / 1037.63 | 362.64 / 373.84 | — | — |
| orders-open-status | — | 2205.71 / 2287.66 | 2915.95 / 4955.92 | — | — |
| order-line-add | — | 209.80 / 224.00 | 29.89 / 50.25 | — | — |
| order-create | — | 12.12 / 17.51 | 17.51 / 39.13 | — | — |
| cold-open-first-read | — | 982.26 / 1102.80 | 37.44 / 48.52 | — | — |

- worklet-filesystem seed wall-clock ms: products 6230.52; orders 6548.93 (whole collection, including progress delivery; not compared).

- worklet-filesystem: WAL n/a; seed bytes {"products":2000,"orders":2714.56025}; BEGIN retries 0.

- worklet-filesystem disk: {"bytes":151917487,"files":26}

- worklet-filesystem lag: {"seed":{"maxLagMs":129.58118000626564,"ticksOver50Ms":163},"grid":{"maxLagMs":3796.11362400651,"ticksOver50Ms":458}}

- worklet-filesystem heapAfterSeed: {"js_heapSize":205520896,"js_allocatedBytes":170656136,"gcCount":266,"raw":{"js_VMExperiments":0,"js_numGCs":266,"js_gcCPUTime":0.3263740000000001,"js_gcTime":0.32953976800000045,"js_totalAllocatedBytes":634746704,"js_allocatedBytes":170656136,"js_heapSize":205520896,"js_mallocSizeEstimate":0,"js_vaSize":205520896,"js_externalBytes":54193770,"js_markStackOverflows":0}}

- worklet-filesystem heapAfterLast: {"js_heapSize":574619648,"js_allocatedBytes":367858400,"gcCount":9806,"raw":{"js_VMExperiments":0,"js_numGCs":9806,"js_gcCPUTime":144.0244689999993,"js_gcTime":144.47840251999924,"js_totalAllocatedBytes":32231469504,"js_allocatedBytes":367858400,"js_heapSize":574619648,"js_mallocSizeEstimate":0,"js_vaSize":574619648,"js_externalBytes":64311614,"js_markStackOverflows":0}}

- worklet-filesystem memory: {"after-seed":{"totalPssKiB":754832},"after-last":{"totalPssKiB":1251582}}

- worklet-filesystem ingest-100 p50 / p95 / max ms: 195.05 / 345.35 / 401.08; 200 batches in a second fresh seed (original seed uses 1000).

- expo-sqlite seed wall-clock ms: products 3552.50; orders 3822.14 (whole collection, including progress delivery; not compared).

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2714.56025}; BEGIN retries 0.

- expo-sqlite disk: {"bytes":201160168,"files":3}

- expo-sqlite lag: {"seed":{"maxLagMs":106.73435500264168,"ticksOver50Ms":30},"grid":{"maxLagMs":1015.7846629917622,"ticksOver50Ms":264}}

- expo-sqlite heapAfterSeed: {"js_heapSize":251658240,"js_allocatedBytes":240151536,"gcCount":139,"raw":{"js_VMExperiments":0,"js_numGCs":139,"js_gcCPUTime":0.272817,"js_gcTime":0.27444307300000015,"js_totalAllocatedBytes":536072584,"js_allocatedBytes":240151536,"js_heapSize":251658240,"js_mallocSizeEstimate":0,"js_vaSize":251658240,"js_externalBytes":1664822,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":645922816,"js_allocatedBytes":364651160,"gcCount":9377,"raw":{"js_VMExperiments":0,"js_numGCs":9377,"js_gcCPUTime":151.24025999999958,"js_gcTime":151.85879905399955,"js_totalAllocatedBytes":31604972040,"js_allocatedBytes":364651160,"js_heapSize":645922816,"js_mallocSizeEstimate":0,"js_vaSize":645922816,"js_externalBytes":21055,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":{"totalPssKiB":488432},"after-last":{"totalPssKiB":926029}}

- expo-sqlite ingest-100 p50 / p95 / max ms: 51.19 / 139.81 / 157.27; 200 batches in a second fresh seed (original seed uses 1000).

### smoke.android.5C270DLCR0020Q.json

Run complete.

| Row | Scenarios | Smoke/probe divergences | Leg 3 content mismatches | Total divergences |
| --- | --- | --- | --- | --- |
| expo-filesystem-js | 11 | 0 | not run | not evaluated |
| worklet-filesystem | 11 | 0 | not run | not evaluated |
| expo-sqlite | 11 | 3 | not run | not evaluated |

- expo-sqlite / exists-explicit-null: {"query":{"selector":{"value":{"$exists":false}}},"expected":["p1"],"actual":["p0","p1"],"pass":false}; {"query":{"selector":{"value":{"$exists":true}}},"expected":["p0","p2","p3","p4","p5","p6","p7"],"actual":["p2","p3","p4","p5","p6","p7"],"pass":false}

- expo-sqlite / in-nin-missing: {"query":{"selector":{"value":{"$in":["blue",2]}}},"expected":["p2","p4"],"actual":["p2","p4"],"pass":true}; {"query":{"selector":{"value":{"$nin":["blue",2]}}},"expected":["p0","p1","p3","p5","p6","p7"],"actual":["p3","p5","p6","p7"],"pass":false}

- expo-sqlite / sort-case-accents-mixed-types: {"query":{"selector":{},"sort":[{"name":"asc"}]},"expected":["p1","p4","p0","p3","p5","p6","p7","p2"],"actual":["p1","p4","p0","p3","p5","p6","p7","p2"],"pass":true}; {"query":{"selector":{},"sort":[{"value":"asc"}]},"expected":["p1","p0","p4","p6","p7","p5","p2","p3"],"actual":["p0","p1","p4","p6","p7","p5","p2","p3"],"pass":false}

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

| Row | Trials | Acked tx / rows | ok | writer-failed | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 5 | 114 / 11772 | 4 | 0 | 0 | 0 | 1 | 0 | 5 | 1 / 0 | 0 / 5 | 0 / 0 / 0 | 1163.83 |
| worklet-filesystem | 5 | 228 / 26682 | 5 | 0 | 0 | 0 | 0 | 0 | 5 | 0 / 0 | 1 / 4 | 0 / 0 / 0 | 1198.26 |
| expo-sqlite | 5 | 251 / 28856 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 1 / 4 | 0 / 0 / 0 | 169.11 |

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

## ios/00008027-000A49223631002E

| Environment | Value |
| --- | --- |
| platform | ios |
| device | 00008027-000A49223631002E |
| deviceName | iPad |
| os | 26.6.2 |
| hardware | {"cpuType":{"name":"arm64e","subType":-2147483646,"type":16777228},"deviceType":"iPad","ecid":2895161054003246,"hardwareModel":"J320AP","internalStorageCapacity":256000000000,"isProductionFused":true,"marketingName":"iPad Pro (12.9-inch) (3rd generation)","platform":"iOS","productType":"iPad8,5","reality":"physical","serialNumber":"DLXY9127K7RG","supportedCPUTypes":[{"name":"arm64e","subType":-2147483646,"type":16777228},{"name":"arm64","subType":0,"type":16777228}],"supportedDeviceFamilies":[1,2],"thinningProductType":"iPad8,5","udid":"00008027-000A49223631002E"} |
| simulator | false |
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
| measuredAt | 2026-09-24T03:23:06.519Z |
| runs | [{"startedAt":"2026-09-23T20:46:22.250Z","rows":["expo-filesystem-js","worklet-filesystem","expo-sqlite"],"scales":[]},{"startedAt":"2026-09-23T22:51:41.008Z","rows":["expo-filesystem-js","worklet-filesystem","expo-sqlite"],"scales":[]},{"startedAt":"2026-09-24T03:23:06.519Z","rows":["expo-filesystem-js","worklet-filesystem","expo-sqlite"],"scales":[]}] |
| sqlite | 3.50.3 |

### crash.ios.00008027-000A49223631002E.json

Run complete.

| Row | Trials | Acked tx / rows | ok | writer-failed | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 30 | 405 / 40878 | 28 | 0 | 0 | 0 | 2 | 0 | 30 | 2 / 0 | 0 / 26 | 0 / 4 / 0 | 2183.97 |
| worklet-filesystem | 30 | 1116 / 130146 | 26 | 0 | 0 | 0 | 4 | 0 | 30 | 4 / 0 | 2 / 24 | 0 / 4 / 0 | 1969.51 |
| expo-sqlite | 30 | 1406 / 168134 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 4 / 23 | 0 / 3 / 0 | 281.36 |

### results.ios.00008027-000A49223631002E.json

**Incomplete:** interrupted

- expo-filesystem-js large: harness-failed — Error: Harness timeout: no message from the app for 30 minutes while running     at jobTimeout (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/control.mjs:63:12)     at waitResult (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:121:23)     at async run (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:130:18)     at async file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:197:26

#### expo-filesystem-js large — partial (row failed)

Measured before the failure; not compared. — means samples/timings were not posted.

| Cell | Samples | p50 ms | p95 ms |
| --- | --- | --- | --- |
| products-grid-asShipped | 7 | 7928.68 | 10553.01 |
| products-grid-pushed-10 | 7 | 41259.62 | 43830.83 |
| products-grid-pushed-50 | 7 | 40238.75 | 42846.89 |
| products-catalogue-blob | 7 | 20680.05 | 112078.17 |
| products-catalogue-projection | 7 | 73834.43 | 379132.79 |
| products-findByIds-10 | 7 | 19.41 | 33.61 |
| products-findByIds-50 | 7 | 23.21 | 33.52 |
| products-remoteId-in-find | 7 | 239961.63 | 248011.46 |
| products-remoteId-in-count | 7 | 238783.64 | 243929.77 |

- worklet-filesystem large: harness-failed — Error: Harness timeout: no message from the app for 30 minutes while running     at jobTimeout (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/control.mjs:63:12)     at waitResult (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:121:23)     at async run (file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:130:18)     at async file:///Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-2091-native-storage/spikes/2091-native-storage/driver/driver.mjs:197:26

#### worklet-filesystem large — partial (row failed)

Measured before the failure; not compared. — means samples/timings were not posted.

| Cell | Samples | p50 ms | p95 ms |
| --- | --- | --- | --- |
| products-grid-asShipped | 7 | 4736.52 | 9729.64 |
| products-grid-pushed-10 | 7 | 4104.96 | 5484.29 |
| products-grid-pushed-50 | 7 | 3944.78 | 4591.81 |
| products-catalogue-blob | 7 | 22258.63 | 117854.45 |
| products-catalogue-projection | 7 | 92939.52 | 133048.64 |
| products-findByIds-10 | 7 | 2.45 | 4.51 |
| products-findByIds-50 | 7 | 33.60 | 118.04 |
| products-remoteId-in-find | 7 | 1052.33 | 1290.36 |
| products-remoteId-in-count | 7 | 922.04 | 1646.70 |

All available cross-row cells match on canonical revision-independent SHA-256 content; returned-order differences and normalized-sort violations recorded separately.

#### small

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | 421.49 / 547.07 | 169.00 / 224.68 | 345.13 / 707.55 | 1.22 | 0.49 |
| products-grid-pushed-10 | 463.63 / 615.32 | 54.84 / 61.27 | 1.03 / 1.11 | 449.07 | 53.12 |
| products-grid-pushed-50 | 458.90 / 602.68 | 61.02 / 70.57 | 2.71 / 6.02 | 169.43 | 22.53 |
| products-catalogue-blob | 627.76 / 683.71 | 137.90 / 289.96 | 202.43 / 546.29 | 3.10 | 0.68 |
| products-catalogue-projection | 598.35 / 1010.58 | 134.58 / 169.79 | 30.20 / 35.44 | 19.81 | 4.46 |
| products-findByIds-10 | 3.25 / 7.90 | 3.15 / 4.51 | 1.04 / 1.12 | 3.11 | 3.02 |
| products-findByIds-50 | 15.80 / 16.16 | 5.76 / 18.38 | 2.39 / 4.02 | 6.60 | 2.41 |
| products-remoteId-in-find | 829.67 / 927.24 | 82.44 / 158.93 | 4.50 / 5.82 | 184.53 | 18.34 |
| products-remoteId-in-count | 728.25 / 771.11 | 72.12 / 78.87 | 2.21 / 2.30 | 329.02 | 32.58 |
| seed-products | 663.16 / 1367.43 | 522.11 / 599.73 | 622.97 / 744.20 | 1.06 | 0.84 |
| orders-default-find-10 | 861.60 / 2452.10 | 106.57 / 111.03 | 3.10 / 4.68 | 277.95 | 34.38 |
| orders-default-find-50 | 863.80 / 2523.73 | 127.01 / 188.19 | 11.47 / 17.60 | 75.32 | 11.07 |
| orders-default-count | 886.91 / 1969.39 | 113.35 / 171.85 | 45.57 / 59.72 | 19.46 | 2.49 |
| orders-open-status | 465.76 / 1344.48 | 565.85 / 683.38 | 725.39 / 1183.51 | 0.64 | 0.78 |
| order-line-add | 317.87 / 568.67 | 22.38 / 29.19 | 4.31 / 11.91 | 73.73 | 5.19 |
| order-create | 0.86 / 1.04 | 1.97 / 3.48 | 2.20 / 9.21 | 0.39 | 0.89 |

- expo-filesystem-js: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-filesystem-js lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":531.1364579999354,"ticksOver50Ms":176}}

- expo-filesystem-js heapAfterSeed: {"js_heapSize":41943040,"js_allocatedBytes":34254424,"gcCount":63,"raw":{"js_VMExperiments":0,"js_numGCs":63,"js_gcCPUTime":0.026951,"js_gcTime":0.03712075100000002,"js_totalAllocatedBytes":211943720,"js_allocatedBytes":34254424,"js_heapSize":41943040,"js_mallocSizeEstimate":0,"js_vaSize":41943040,"js_externalBytes":23013465,"js_markStackOverflows":0}}

- expo-filesystem-js heapAfterLast: {"js_heapSize":150994944,"js_allocatedBytes":92714672,"gcCount":5330,"raw":{"js_VMExperiments":0,"js_numGCs":5330,"js_gcCPUTime":53.642323000000005,"js_gcTime":53.895759704999975,"js_totalAllocatedBytes":21115873568,"js_allocatedBytes":92714672,"js_heapSize":150994944,"js_mallocSizeEstimate":0,"js_vaSize":150994944,"js_externalBytes":62775443,"js_markStackOverflows":0}}

- expo-filesystem-js memory: {"after-seed":null,"after-last":null}

- worklet-filesystem seed wall-clock ms: products 623.73; orders 1306.90 (whole collection, including progress delivery; not compared).

- worklet-filesystem: WAL n/a; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- worklet-filesystem lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":112.7357919998467,"ticksOver50Ms":13}}

- worklet-filesystem heapAfterSeed: {"js_heapSize":675282944,"js_allocatedBytes":569798016,"gcCount":6141,"raw":{"js_VMExperiments":0,"js_numGCs":6141,"js_gcCPUTime":35.014762000000076,"js_gcTime":626.2869453209993,"js_totalAllocatedBytes":37133694880,"js_allocatedBytes":569798016,"js_heapSize":675282944,"js_mallocSizeEstimate":0,"js_vaSize":675282944,"js_externalBytes":344554459,"js_markStackOverflows":0}}

- worklet-filesystem heapAfterLast: {"js_heapSize":805306368,"js_allocatedBytes":56841128,"gcCount":7818,"raw":{"js_VMExperiments":0,"js_numGCs":7818,"js_gcCPUTime":48.82299600000051,"js_gcTime":640.176819195999,"js_totalAllocatedBytes":43221239800,"js_allocatedBytes":56841128,"js_heapSize":805306368,"js_mallocSizeEstimate":0,"js_vaSize":805306368,"js_externalBytes":6375,"js_markStackOverflows":0}}

- worklet-filesystem memory: {"after-seed":null,"after-last":null}

- expo-sqlite seed wall-clock ms: products 439.81; orders 282.15 (whole collection, including progress delivery; not compared).

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2758.653}; BEGIN retries 0.

- expo-sqlite lag: {"seed":"simulator — not meaningful","grid":{"maxLagMs":655.8358749998733,"ticksOver50Ms":146}}

- expo-sqlite heapAfterSeed: {"js_heapSize":671088640,"js_allocatedBytes":591075288,"gcCount":18595,"raw":{"js_VMExperiments":0,"js_numGCs":18595,"js_gcCPUTime":-1719.0282700000012,"js_gcTime":2581.603709299005,"js_totalAllocatedBytes":31175183248,"js_allocatedBytes":591075288,"js_heapSize":671088640,"js_mallocSizeEstimate":0,"js_vaSize":671088640,"js_externalBytes":159008991,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":679477248,"js_allocatedBytes":57594552,"gcCount":21004,"raw":{"js_VMExperiments":0,"js_numGCs":21004,"js_gcCPUTime":-1671.9481389999266,"js_gcTime":2629.906469387003,"js_totalAllocatedBytes":37132404168,"js_allocatedBytes":57594552,"js_heapSize":679477248,"js_mallocSizeEstimate":0,"js_vaSize":679477248,"js_externalBytes":6523779,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":null,"after-last":null}

#### large

| Cell — p50 / p95 ms | expo-filesystem-js | worklet-filesystem | expo-sqlite | expo-filesystem-js ÷ expo-sqlite | worklet-filesystem ÷ expo-sqlite |
| --- | --- | --- | --- | --- | --- |
| products-grid-asShipped | — | — | 4268.27 / 11904.03 | — | — |
| products-grid-pushed-10 | — | — | 1.15 / 13.53 | — | — |
| products-grid-pushed-50 | — | — | 17.34 / 36.99 | — | — |
| products-catalogue-blob | — | — | 30398.85 / 102456.16 | — | — |
| products-catalogue-projection | — | — | 4236.56 / 5511.52 | — | — |
| products-findByIds-10 | — | — | 1.14 / 1.96 | — | — |
| products-findByIds-50 | — | — | 2.85 / 3.79 | — | — |
| products-remoteId-in-find | — | — | 39.01 / 40.92 | — | — |
| products-remoteId-in-count | — | — | 3.58 / 5.04 | — | — |
| seed-products | — | — | 5800.43 / 15894.05 | — | — |
| orders-default-find-10 | — | — | 3.37 / 66.31 | — | — |
| orders-default-find-50 | — | — | 13.74 / 52.42 | — | — |
| orders-default-count | — | — | 529.17 / 554.13 | — | — |
| orders-open-status | — | — | 48310.02 / 181612.76 | — | — |
| order-line-add | — | — | 6.39 / 113.77 | — | — |
| order-create | — | — | 3.23 / 98.18 | — | — |
| cold-open-first-read | — | — | 19.49 / 21.81 | — | — |

- expo-sqlite seed wall-clock ms: products 2205.85; orders 2406.86 (whole collection, including progress delivery; not compared).

- expo-sqlite: WAL wal; seed bytes {"products":2000,"orders":2714.56025}; BEGIN retries 0.

- expo-sqlite disk: {"bytes":201160168,"files":3}

- expo-sqlite lag: {"seed":{"maxLagMs":41.88462499901652,"ticksOver50Ms":0},"grid":{"maxLagMs":6848.100708000362,"ticksOver50Ms":2099}}

- expo-sqlite heapAfterSeed: {"js_heapSize":314572800,"js_allocatedBytes":258529712,"gcCount":196,"raw":{"js_VMExperiments":0,"js_numGCs":196,"js_gcCPUTime":0.168083,"js_gcTime":0.20400466999999994,"js_totalAllocatedBytes":766491264,"js_allocatedBytes":258529712,"js_heapSize":314572800,"js_mallocSizeEstimate":0,"js_vaSize":314572800,"js_externalBytes":831323,"js_markStackOverflows":0}}

- expo-sqlite heapAfterLast: {"js_heapSize":910163968,"js_allocatedBytes":525024656,"gcCount":40257,"raw":{"js_VMExperiments":0,"js_numGCs":40257,"js_gcCPUTime":45.50122199992356,"js_gcTime":4349.027564798007,"js_totalAllocatedBytes":57204930720,"js_allocatedBytes":525024656,"js_heapSize":910163968,"js_mallocSizeEstimate":0,"js_vaSize":910163968,"js_externalBytes":15701,"js_markStackOverflows":0}}

- expo-sqlite memory: {"after-seed":null,"after-last":null}

- expo-sqlite ingest-100 p50 / p95 / max ms: 138.38 / 330.40 / 353.61; 200 batches in a second fresh seed (original seed uses 1000).

### smoke.ios.00008027-000A49223631002E.json

Run complete.

| Row | Scenarios | Smoke/probe divergences | Leg 3 content mismatches | Total divergences |
| --- | --- | --- | --- | --- |
| expo-filesystem-js | 11 | 0 | not run | not evaluated |
| worklet-filesystem | 11 | 0 | not run | not evaluated |
| expo-sqlite | 11 | 3 | not run | not evaluated |

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

| Row | Trials | Acked tx / rows | ok | writer-failed | open-failed | integrity-failed | lost | partial | Repaired on reopen | Ledger lost / partial | In-flight present / absent | In-flight partial / none / unknown | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expo-filesystem-js | 5 | 187 / 21344 | 5 | 0 | 0 | 0 | 0 | 0 | 4 | 0 / 0 | 0 / 4 | 0 / 1 / 0 | 2942.28 |
| worklet-filesystem | 5 | 216 / 26568 | 4 | 0 | 0 | 0 | 1 | 0 | 5 | 1 / 0 | 2 / 3 | 0 / 0 / 0 | 1012.62 |
| expo-sqlite | 5 | 201 / 23456 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 1 / 2 | 0 / 2 / 0 | 114.70 |

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

| Scale / cell | android/5C270DLCR0020Q | android/emulator-5554 — simulator — not evidence | ios/00008027-000A49223631002E | ios/DDC18EF3-759A-494B-A0B1-E5139EA0A74F — simulator — not evidence |
| --- | --- | --- | --- | --- |
| small/products-grid-asShipped | expo-sqlite | expo-sqlite | worklet-filesystem | expo-sqlite |
| small/products-grid-pushed-10 | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-grid-pushed-50 | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-catalogue-blob | expo-sqlite | expo-sqlite | worklet-filesystem | worklet-filesystem |
| small/products-catalogue-projection | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-findByIds-10 | expo-filesystem-js | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-findByIds-50 | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-remoteId-in-find | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/products-remoteId-in-count | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/seed-products | expo-filesystem-js | expo-sqlite | worklet-filesystem | expo-sqlite |
| small/orders-default-find-10 | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/orders-default-find-50 | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/orders-default-count | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/orders-open-status | expo-sqlite | expo-sqlite | expo-filesystem-js | expo-sqlite |
| small/order-line-add | expo-sqlite | expo-sqlite | expo-sqlite | expo-sqlite |
| small/order-create | expo-filesystem-js | expo-filesystem-js | expo-filesystem-js | expo-sqlite |
| large/products-grid-asShipped | not compared | not compared | not compared | not compared |
| large/products-grid-pushed-10 | not compared | not compared | not compared | not compared |
| large/products-grid-pushed-50 | not compared | not compared | not compared | not compared |
| large/products-catalogue-blob | not compared | not compared | not compared | not compared |
| large/products-catalogue-projection | not compared | not compared | not compared | not compared |
| large/products-findByIds-10 | not compared | not compared | not compared | not compared |
| large/products-findByIds-50 | not compared | not compared | not compared | not compared |
| large/products-remoteId-in-find | not compared | not compared | not compared | not compared |
| large/products-remoteId-in-count | not compared | not compared | not compared | not compared |
| large/seed-products | not compared | not compared | not compared | not compared |
| large/orders-default-find-10 | not compared | not compared | not compared | not compared |
| large/orders-default-find-50 | not compared | not compared | not compared | not compared |
| large/orders-default-count | not compared | not compared | not compared | not compared |
| large/orders-open-status | not compared | not compared | not compared | not compared |
| large/order-line-add | not compared | not compared | not compared | not compared |
| large/order-create | not compared | not compared | not compared | not compared |
| large/cold-open-first-read | not compared | not compared | not compared | not compared |
<!-- generated:end -->
