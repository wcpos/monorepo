# iPad device profile — expo-opfs whole-file copies on every write (2026-09-08)

Paul's production iPad (iPad Pro 12.9" 3rd gen, iPad8,5, iOS 26.6.1, ProMotion) on 1.10.8 was
"still really sluggish". The dev client (`com.wcpos.main.dev`, built locally from `main`
ff38d12417) was installed next to it over USB and driven by Metro with the storage probe on
(`EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1 npx expo start --no-dev --minify --clear`). Three instruments
ran at once: the probe rows (pulled off the device every 3 min), back-to-back 60 s Hermes CPU
profiles through Metro's inspector, and iOS's own CPU-usage diagnostics (`*.cpu_resource-*.ips`).

## Result

The busy minute (18:30:45–18:31:45, right after a fresh store login; the dev client got a CPU
warning for 18:29–18:32 and had crashed once already at ~18:25):

| instrument | reading |
|---|---|
| probe row 2 (`ipad-timing-rows-store-c42.txt`) | 23 stalls ≥ 1 s, longest 3.7 s, sampler starved to 141 ticks |
| Hermes profile (`hermes-profile-183103-busy-minute.txt`) | JS thread 95 % busy |
| iOS CPU report (`ios-cpu-report-183214-js-thread.ips`) | heaviest stack = `RCTJSThreadManager runRunLoop` (JS thread) |

Inclusive time in that profile: **61 %** inside expo-opfs `FileSystemWritableFileStream`
(`writeChunk` / `lazyInit` / `createWritable`), **18 %** under rxdb-premium
`cleanupDocumentJsonFile` (compaction), **7 %** building file paths through `whatwg-url` parsing
(`new File(path + '.swap.' + …)`), **5 %** in `" ".repeat()` padding. Native self time:
`create` 13.7 s, `writeBytes` 9.8 s, `delete` 5.0 s, `exists` 4.0 s, `open` 3.5 s in one minute.

**Mechanism.** The app uses `getRxStorageExpoAsync()` (`packages/database/src/adapters/storage/index.ts`),
whose writable is expo-opfs's `createWritable({ keepExistingData: true })`. In expo-opfs 1.0.9
(latest as of today) `FileSystemWritableFileStream` does, synchronously on the JS thread:

1. `lazyInit()` on first write: create a swap file, `readBytes` the **entire** existing file into
   JS, `writeBytes` it into the swap;
2. `close()`: delete the original, `readBytes` the **entire** swap, create the original,
   `writeBytes` it all back, delete the swap ("workaround for expo-file-system lack of synchronous
   move").

Four whole-file copies per writable. The abstract-filesystem engine opens a fresh writable for
nearly every write (`grep -c "getWritable()"`: bulk-write 4, cleanup 3, changelog 1, index-state 1,
attachments 1), and `cleanupDocumentJsonFile` opens **two per compacted document**, up to 50 per
pass. With a 700 KB `documents.json` that is hundreds of MB of byte copies per compaction pass;
it scales linearly with store size. expo-opfs is pure JS over expo-file-system on both platforms,
so Android pays the same (that is the "whole documents file rewrite through a .swap" seen with
`top -H` on the Pixel — see memory `native-slow-after-idle-is-the-coupons-refetch-cycle`).

**History.** April 2026: 581aa830bc switched to `getRxStorageExpoSync` (in-place positional
writes through the native handle, no stream lifecycle) to stop Android truncation (rxdb#8290);
5e691a9df4 reverted it as "too slow for reads" and instead patched expo-opfs `close()` to
`delete + File.move()` (atomic rename). July 2026: a544066025 moved native to the Async adapter on
the strength of 1.0.9's "atomic swap-file writes" and dropped the patch — but 1.0.9's `close()` is
the same read-and-rewrite sequence with an extra copy added on open.

## Secondary findings

- **Main-thread worklet every frame.** The CPU report before the crash
  (`ios-cpu-report-182436-main-thread-worklets.ips`, 67 % CPU over 135 s) has its heaviest stack on
  the main thread: `AnimationFrameQueue executeQueueForProMotion` → worklets
  `AnimationFrameBatchinator::flush` → `reanimated makeMaybeFlushUIUpdatesQueueFunction`, i.e. a
  Reanimated animation ticking at up to 120 Hz. The only repeating animation in the app is the
  `Loader` spinner (`packages/components/src/loader/index.tsx`, `withRepeat`), rendered by the
  list/grid footers while pages load. Symbolicate with
  `xcrun atos -o WCPOS.app/WCPOS.debug.dylib -arch arm64 -l <image base> <addr…>` (Debug builds put
  app code in `WCPOS.debug.dylib`, UUID from `dwarfdump --uuid`).
- **The production app had the same class of warning this morning**
  (`ios-cpu-report-115421-production-1.10.8.ips`, 1.10.8, 52 % over 175 s, JS thread) — not
  symbolicatable locally (needs the release dSYM, which Sentry has since #1914).
- **Probe `lag.blockedMs` is inflated on this iPad when idle.** The sampler rides `setInterval`,
  which on iOS fires from the display link; ProMotion slows the link when the screen is static, so
  row 4 reports 4.7 s "blocked" with zero stalls ≥ 50 ms. When the thread is truly busy the sampler
  starves (row 2: 141 samples) and the figure is real. Read the stall buckets and `maxMs`, and
  cross-check against the Hermes profile for the same minute. Same family as
  `simulator-lag-numbers-are-an-artefact`.
- The crash at ~18:25 left no crash report, only the CPU warnings — most likely a Jetsam kill while
  holding whole-file byte copies (`JetsamEvent-*.ips` are written late; re-pull).

## Recipe (all from the Mac, iPad on USB, no EAS build)

- Expo refuses `expo run:ios --device` with no signing identity in the keychain; Xcode's automatic
  signing mints one if the Apple ID session is valid (it had expired — sign in again under
  Xcode ▸ Settings ▸ Accounts). Build directly:
  `EAS_BUILD_PROFILE=development npx expo prebuild --platform ios --clean --no-install`, `pod install`
  (with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`), then
  `xcodebuild -workspace WCPOS.xcworkspace -scheme WCPOS -configuration Debug -destination 'id=<udid>' -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=G7L8G4KJ7A CODE_SIGN_STYLE=Automatic build`.
  `EAS_BUILD_PROFILE=development` is what selects the `com.wcpos.main.dev` bundle id; without it the
  prebuild is the production variant and would replace the App Store install.
- Install / launch: `xcrun devicectl device install app --device <coredevice id> <WCPOS.app>`;
  `xcrun devicectl device process launch --device <id> --payload-url "wcpos-dev://expo-development-client/?url=http%3A%2F%2F<mac lan ip>%3A8081" com.wcpos.main.dev`.
  The iPad reaches Metro over Wi-Fi; the first bundle is ~15 s.
- Pull the store off the device (`pull-rows.sh`): `xcrun devicectl device copy from --domain-type appDataContainer --domain-identifier com.wcpos.main.dev --source Documents/.expo-opfs …`;
  parse with `read-timing-rows.py`. The `rxdb-store_v7_<id>-logs-3` directory is per site: a
  different login is a different id.
- Hermes CPU profile (`cdp-profile.mjs <seconds> <prefix>`; `node cdp-profile.mjs report <prefix>`
  re-aggregates): `Tracing.start` with `categories: 'disabled-by-default-v8.cpu_profiler'` over
  Metro's `/inspector/debug` (needs `Origin` and a Chrome UA), symbolicated through `POST /symbolicate`
  (add 1 to the CDP line and column). Note the tracing agent's own chunk serialisation shows up on the
  JS thread at the end of each window.
- iOS CPU diagnostics: `xcrun devicectl device copy from --domain-type systemCrashLogs --source . --destination <dir>`.
- Instruments: `xctrace list devices` reported the iPad *offline* until devicectl had opened its
  tunnel and a launch had been done; `xctrace record --attach <pid>` then attached but the first
  3-minute capture was killed by the shell timeout (attach + finalise takes minutes) and left a
  52 KB trace with no template — give it a 10-minute wall timeout.

## Caveat: the Hermes sampling profiler is not free

The Instruments capture that finally attached (18:39–18:41, `timeprofile-3.trace`, 18,023 samples)
was taken while the CDP profile loop was still running, and it mostly measured the profiler: three
`hermes-sampling-profiler` threads held 42 % of samples, the JS thread's leaf frames were
`_sigtramp` / `sem_post` (the sampler interrupting it), and the main thread's app frames were
`jsinspector_modern` trace serialisation. So: (a) the CPU warning at 18:29–18:32 and the earlier
crash happened with the CDP profiler attached and are partly its doing; (b) the *proportions* inside
the Hermes profile (which JS functions own the time) stand, and the code path is deterministic, but
the *magnitude* on this iPad without a profiler is not measured here — the uncontaminated evidence
that the production JS thread saturates is the 11:54 production CPU report; (c) never run the CDP
sampler and Instruments at the same time, and take probe-row-only arms for before/after numbers.

## How #1885 (worklet storage host, `next`) relates

#1885 does not run expo-opfs at all: `@wcpos/worklet-opfs` 0.1.1 implements OPFS over
`react-native-worklet-fs` file descriptors, and its `AbstractSyncAccessHandle` / `AbstractWritable`
write **in place at offsets** through a sync access handle (`handle.write(data, { at })`,
`truncate(fd, size)`) — no swap file, no whole-file copies, the same model as the web OPFS worker.
So #1885 removes this cost by construction, not just by moving it to another thread; the
"worklet moves the rewrite off-thread but does not shrink it" note in memory was written for the
expo-opfs `.swap` rewrites and does not apply to its replacement. What #1885 still needs is the
on-device before/after on this iPad (probe rows only, no CDP sampler), and the atomicity question
the April commits were about (rxdb#8290) is answered differently there: one long-lived positional
handle per file, no delete/recreate window, crash consistency from the engine's changelog.

## Part 2 (same evening): the #1885 A/B on the iPad, and what the heap said

**Arms.** Baseline = `main` ff38d12417 dev client (expo-opfs), rows in
`baseline-main-rows-table.txt` (sampler attached 18:31–18:46). Arm = #1885 (`next-worklet-storage`
4a4e5106b1) **merged with `origin/main`** (measurement branch `measure/1885-plus-main`, local only —
the PR branch alone lacks main's coverage batching and unchanged-skip fixes and did 593 one-row
coverage round trips in its login minute), worklet host confirmed active (`.worklet-opfs` root),
Hermes sampler off except one 60 s window at 19:38, rows in `arm-1885-plus-main-rows-table.txt`.

| window | main baseline | #1885 + main |
|---|---|---|
| login minute 1 | 5.3 s max, 2 stalls ≥ 1 s | 7.6 s, 6 |
| login minute 2 | 3.7 s, 23 (sampler) | 3.3 s, 1 |
| cart edits, minute 3 | 2.5 s, 10 (sampler) | **38.9 s**, 5 |
| idle minutes 4–14 | three episodes 2.6–5.2 s, 7–16 stalls each (sampler) | nothing ≥ 410 ms for ten minutes |
| pick-up minute | 2.6–5.2 s | 6.6 s, 6 |

**Reading.** The worklet host removes the periodic idle-time episodes (where the expo-opfs copies
lived) and does nothing for the interaction minutes. The 38.9 s freeze happened during ~5 cart
actions that produced 147 `orders` writes, 77 `recordMutations`, 57 `orders-search` FlexSearch
writes and **153 `logs` writes** — the sync engine persists an info-level row for every
`queue.write.enqueued` / `queue.write.coalesce` (`write-plane.ts:170`, `write-intents.ts:453`),
so each cart write costs a second storage write for its own log line. Demoting those to `debug`
is a free win on both lanes. The worklets scheduler (`WorkletRuntime::schedule` → mutex-guarded
`AsyncQueueImpl::push`) cannot block the caller, so the freeze is JS work on the JS thread.

**Instruments on the pick-up window (19:36–19:39, `instruments-tp6-thread-summary.txt`).** JS thread
55 % of samples; its top leaf is `HadesGC::OldGen::search` (25 % of JS-thread samples) with card
scanning and weak-root marking behind it, plus `hermes::Module::resetForMoreCompilation` /
`VariableScope::assignIndexToVariables` (on-device compilation). `Runtime.getHeapUsage`: **393 MB used
of 428 MB**, 5,491 GCs, 52 s GC CPU in 22 minutes, 18.5 GB allocated. The storage worklet thread was
6 % (JSON string building); the main thread 27 % incl. `RCTRedBoxController` (the "lots of errors"
Paul saw were RedBox screens — not persisted, and Metro in CI mode forwards nothing; the persisted
error/warn rows were only the demo store's 403 `woocommerce_rest_cannot_delete`, a 404
`/payment-methods` `rest_no_route` (released plugin lacks the `next` route) and one `SYNC321`
"scope moved mid-query").

**Heap snapshot (`heap-snapshot-summary-1885-arm.txt`, 448 MB, 3.08 M nodes).**
- **219 MB is `CodeBlock` (47,443)** — Hermes-compiled function code. Expo's dev server passes
  `bytecode: false` unconditionally (`MetroBundlerDevServer.js`), so Metro serves 34 MB of JS
  *source* (`Content-Type: application/javascript`, starts `var __BUNDLE_START`) regardless of
  `transform.bytecode=1` in the URL, and the dev client compiles it on the device. A release build
  ships HBC and pays neither the 219 MB nor the compile time. **Every dev-client number in this
  folder is inflated by this**; the production 1.10.8 `cpu_resource` report (JS thread saturated,
  no profiler, no source compile) is the evidence that production is still slow, but the
  magnitudes here overstate it and the day's crash/Jetsam pressure is partly the harness.
- The other ~230 MB is the app's live graph and applies to production: 269 k `JSFunction` +
  317 k `Environment` (closures, 39 MB), 275 k `JSArray` + 474 k `ArrayStorageSmall` (62 MB),
  React: 42 k `FiberNode` + 95 k hook-state objects + 26 k elements; RxJS: 38.5 k
  `OperatorSubscriber`, 20.7 k `AnonymousSubject`, 13.5 k `Observable`, 8.5 k `Subscription`
  (~40 k live subscriptions); RxDB: 4.5 k `RxDocument`, 648 `RxQuery`, 1.7 k coverage-record
  objects, 8.4 k `{lwt}`; 5.5 k `{id, searchable}` FlexSearch entries. A 42 k-fiber tree and
  ~40 k live subscriptions are the next thing to look at for interaction-time cost.

**Harness traps found on the way.** (1) #1885 loads its worklet host through
`import('./worklet-host')`; under `--no-dev` Expo's async-require throws "Unable to determine the
production URL…" for lazy chunks, the import rejects and the app **silently falls back to JS-thread
storage** (it booted straight into the old `.expo-opfs` store; `LOCAL_DB_SETUP_FAILED` never reached
the persisted logs). `EXPO_NO_METRO_LAZY=1` on `expo start` fixes it — the native E2E harness runs
`--no-dev --minify` too, so it would test the fallback path unless it sets that. (2) A stale
`xctrace record` holds the device and makes every later attach fail with "Cannot find process";
`pkill -9 -f "xctrace record"` first. (3) `pull-rows-1885.sh` restricts itself to `.worklet-opfs`;
the old `.expo-opfs` root survives an install-over and re-prints the baseline rows otherwise.

## Fix directions (not done here)

1. Re-measure `getRxStorageExpoSync()` on this iPad with the same recipe — in-place positional
   writes, zero copies; the April "too slow for reads" verdict predates 1.0.9 and this probe.
2. Or patch expo-opfs again: `File.move()` on close (as 5e691a9df4 did) and a native copy on open —
   four copies → one.
3. Or stop the engine's writable churn (one long-lived writable per file) — rxdb-premium patch /
   upstream.
