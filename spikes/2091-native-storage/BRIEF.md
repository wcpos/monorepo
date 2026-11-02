# Spike 2091 — native storage: filesystem on the JS thread vs filesystem on the worklet vs premium SQLite over expo-sqlite, measured on device

Read this file, then carry out the task it describes. Ticket: wcpos/monorepo#2091 (wayfinder map
#2137, "Storage engine for 2.0"; web and desktop are decided, native is the last open target).
Everything you need is in this repo or on GitHub. Do not modify anything outside
`spikes/2091-native-storage/`. Do not run the repo's jest suites. Do not touch `apps/main`.

Prior accepted artefacts to copy the shape of (read them first; do not import from them — each spike
stays independently runnable):

- `spikes/2210-desktop-engine/` — the most recent port of the workload and the stop harness:
  `bench-node.mjs` (schemas, `fixtures(n)`, cells, sampling, the set-based cross-engine content check
  with the order judged against the normalized `q.query.sort`, the mismatch records), `engines.mjs`
  (`predicate()`/`translatable()` and the translated `query`/`count` wrapper for premium SQLite),
  `crash-child.mjs` (ownership replay, ledger scoring, repair counting, the outcome table),
  `crash-node.mjs` (the trial loop, the `launching → opening → scored` phases), `report.mjs`,
  `RESULTS.md`, `BRIEF.md`.
- `spikes/2143-storage-benchmark/bench-entry.mjs` — the origin of the fixtures. The fixture generator
  must stay **byte-identical** (seed 2143) so numbers compare across 2143, 2210 and this spike.
- The worklet storage library's benchmark app, `wcpos/rxdb-storage-worklet` on GitHub, directory
  `example/` — the only working Expo 57 app that hosts rxdb-premium's filesystem engine on a
  react-native-worklets runtime. Copy its `metro.config.js`, `babel.config.js`, `patches/`
  (metro, metro-runtime, react-native-worklets), `index.ts` polyfill order, `src/storage-runtime.ts`
  (the worklet row's construction), `src/lag-sampler.ts`, `src/conformance-smoke.ts` and `app.json`
  into this spike's app and adapt. Download the files with `gh api
  repos/wcpos/rxdb-storage-worklet/contents/<path> -H "Accept: application/vnd.github.raw"` or take a
  shallow checkout into `spikes/2091-native-storage/.deps/rxdb-storage-worklet` (gitignored). The
  three library packages come from npm: `@wcpos/rxdb-storage-worklet@0.1.1`, `@wcpos/worklet-opfs@0.1.1`,
  `@wcpos/react-native-worklet-fs@0.1.1` (not `workspace:*`).

## The question

For React Native, does premium SQLite over `expo-sqlite` clear the stability gate **and** win on
speed against the Expo Filesystem engine we ship today, measured on device? Three candidates, three
legs, one `RESULTS.md`. The harness decides nothing; the operator writes the answer paragraphs. The
decision criteria and the standing bar ("a second engine has to win clearly, not narrowly") are in
the ticket body; read it: `gh issue view 2091 -R wcpos/monorepo`.

The physical devices (an iPad and a Pixel) are the operator's. **You build and verify on the iOS
simulator and the Android emulator only.** Simulator numbers are not evidence and RESULTS must label
them so; the harness must be a one-command run per device so the operator's session is short.

## The three rows

All three open storage with `multiInstance: false`, a fresh `databaseName` per row per run, and data
under the app's document directory in `spike-2091/<leg>/<row>/<run>/`, one directory per row so rows
never share files. The same rxdb-premium build serves every row: the **patched** one. After the app's
npm install, replace `app/node_modules/rxdb-premium/dist` with a copy (`cp -RL`) of this worktree's
`node_modules/rxdb-premium/dist` — the repo's `scripts/patch-rxdb-premium-*.mjs` have been applied
there at install — and fail the install step unless `grep -rc __wcpos` across
`dist/esm/plugins/storage-abstract-filesystem/` totals **47** lines. Record the count in the
environment block. Same `rxdb` 17.4.0, same `rxjs`; one copy of each in the app's `node_modules`.

| Row | Construction | Notes |
|---|---|---|
| `expo-filesystem-js` (incumbent, control) | `getRxStorageExpoAsync()` from `rxdb-premium/plugins/storage-filesystem-expo`, on the JS thread | Exactly `packages/database/src/adapters/storage/index.ts` minus the `withTargetedOpfsRecovery` and probe wrappers: the raw engine is the control. Its `flush` is a no-op; the ticket says to score it that way. |
| `worklet-filesystem` (the stay-on-one-engine path) | `getRxStorageWorklet({ runtime, identifier, receiveGlobalName, scheduleOnRuntime, scheduleOnRN })` on the RN side over `exposeWorkletRxStorage({ storage: getRxStorageAbstractFilesystem({ name: 'worklet-filesystem', abstractFilesystem: createAbstractFilesystemAdapter(createWorkletOpfs({ rootDirectory })), abstractLock: createPromiseQueueLock(), inWorker: true, settings: { decoder } }) })` on a `createWorkletRuntime({ name: 'rxdb-filesystem' })` runtime with `installWorkletFs` and `installWorkletRuntimePolyfills` | Copy the library's `example/src/storage-runtime.ts` `worklet-filesystem` mode verbatim in shape. Timing on this row includes the runtime round trip: that is what ships. |
| `expo-sqlite` (candidate) | `getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })` from `rxdb-premium/plugins/storage-sqlite`, where `sqliteBasics` is rxdb's shipped `getSQLiteBasicsExpoSQLiteAsync(openDatabaseAsync)` (exported from the same plugin; `openDatabaseAsync` from `expo-sqlite`, SDK 57's `~57.0.1`) with `open` wrapped so that right after the database opens it runs `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL`, and `journalMode: 'WAL'` set (the shipped helper leaves it `''`). After the seed, run `ANALYZE` once. Wrap each instance's `query()` and `count()` exactly as `spikes/2210-desktop-engine/engines.mjs` does: one translated statement through `sqliteBasics.all()` when `predicate()` can translate the selector, premium otherwise. | The one adapter file is `sqlite-basics-expo.ts`: import the shipped factory, wrap `open`. Do not write a fresh `SQLiteBasics`. SQL executes on expo-sqlite's native thread; the JS thread marshals. rxdb#8635 reported a `console.dir` inside premium's `BEGIN` retry loop throwing on Hermes: read `sqlite-helpers.js` in the app's installed rxdb, note whether 17.4.0 still has it, and if a retry ever fires on device record it. |

**WAL proof (`expo-sqlite` row).** After the first storage instance of each leg is created, open the
same file a second time with a plain `openDatabaseAsync`, read `PRAGMA journal_mode`, and fail the run
loudly if it is not `wal`. Record it.

## Layout

```
spikes/2091-native-storage/
  BRIEF.md            this file
  RESULTS.md          prose above the generated markers, tables between them (see report.mjs)
  DEVICE-RUN.md       the operator's per-device checklist, exact commands, nothing to decide
  run.sh              install | prebuild | build <target> | bench | crash | smoke | report
  driver/driver.mjs   the Mac-side driver (HTTP server + device control + result files)
  report.mjs          results/*.json → the generated section of RESULTS.md
  results/            committed JSON per (leg, platform, device): results.<platform>.<device>.json,
                      crash.<platform>.<device>.json, smoke.<platform>.<device>.json
  app/                a standalone Expo 57 app: its own package.json + package-lock.json (npm, never
                      pnpm — the monorepo workspace must not see it), .gitignore for node_modules,
                      ios, android, .expo, *.log
  .deps/              gitignored
```

The app is not a workspace package. Install it with `npm ci` (or `npm install` the first time) from
inside `app/` — the directory has its own `package.json`, which is what keeps npm from walking up
into the pnpm root. Then decrypt premium: `RXDB_PREMIUM` is in this worktree's root `.env`; run
`node node_modules/rxdb-premium/scripts/postinstall.js` and `installer.js` as the library's
`example/README.md` shows, then the `cp -RL` above, then `npx patch-package`. Never print or commit
the token; never copy `.env` into `app/`.

Versions: `expo ~57.0.20`, `react-native 0.86.3`, `react 19.2.3`, `expo-sqlite ~57.0.1`,
`expo-file-system ~57.0.6`, `expo-crypto`, `react-native-worklets 0.11.4` (+ the library's patch),
`react-native-reanimated ~4.5.0`, `rxdb 17.4.0`, `rxdb-premium 17.4.0`, `rxjs 7.8.2`, `metro 0.84.5`
(+ patch), `patch-package`. `app.json`: name `wcpos-spike-2091`, slug `wcpos-spike-2091`, scheme
`spike2091`, iOS `bundleIdentifier` `com.wcpos.spike2091`, Android `package` `com.wcpos.spike2091`,
`newArchEnabled: true`, Hermes, no Sentry, no Expo Updates. **Release builds only**: the JS ships as
Hermes bytecode in the binary, no Metro at run time, so the numbers are production-shape (the
dev-client path serves source and inflates every number; a memory note in this repo's owner's notes
established that on 2026-09-08).

## Driver ↔ app protocol

`driver/driver.mjs` runs on the Mac, serves HTTP on port **48091** on all interfaces, and controls the
device with `xcrun simctl` / `xcrun devicectl` / `adb`. The app learns the driver's URL from its launch
URL (`spike2091://driver?url=http%3A%2F%2F<host>%3A48091`, read with `expo-linking`'s initial URL;
persist the last one and show it on screen as an editable field with a Connect button, for a manual
launch). The app then loops: `GET /job` → runs it → `POST /result`; `POST /event` streams
sub-results while a job runs. Jobs are JSON: `{ id, type, row, scale?, dir, db, ... }`; the driver
answers `204` when there is nothing to do and the app polls every 500 ms. The app shows the current
job, the last event and a large "IDLE / RUNNING / DONE" state so the operator can see it from across a
desk. No Maestro, no log scraping, no screenshots.

Device control, one module per platform, chosen by `--platform ios|android --device <udid|serial>`
(`--simulator` for the iOS simulator; `adb` serves emulator and device alike):

| Action | iOS simulator | iOS device | Android (device or emulator) |
|---|---|---|---|
| launch with URL | `xcrun simctl openurl <udid> <url>` after `xcrun simctl launch <udid> com.wcpos.spike2091` (record the pid it prints) | `xcrun devicectl device process launch --device <udid> --json-output <file> --payload-url <url> com.wcpos.spike2091` (pid from the JSON) | `adb -s <serial> shell am start -a android.intent.action.VIEW -d <url>`; pid via `adb shell pidof com.wcpos.spike2091` |
| stop (signal 9) | `kill -9 <pid>` (simulator app processes are host processes) | `xcrun devicectl device process signal --device <udid> --pid <pid> --signal SIGKILL` | `adb -s <serial> shell am force-stop com.wcpos.spike2091` — ActivityManager kills the process without lifecycle callbacks; say so in RESULTS |
| memory | not captured | not captured | `adb shell dumpsys meminfo com.wcpos.spike2091` → `TOTAL PSS` |

Verify the pid is gone after every stop before relaunching; a stop that did not land is a harness
failure (the run is incomplete), never a storage verdict.

## Leg 1 — semantics on device (`smoke` job)

The rxdb mocha conformance suite does not run inside React Native, and it has already passed
1428/1428 over premium's SQL layer on Node (spike 2210); what is untested is the **binding** and
premium's query layer **on this runtime**. So leg 1 is, per row, on device:

1. The library's eight-scenario conformance smoke (`example/src/conformance-smoke.ts`) ported to run
   against any of the three rows, unchanged in what it asserts.
2. Three named divergence probes, each a small fixture written through `bulkWrite` and a query whose
   expected answer is computed in JS with rxdb's own `getQueryMatcher` + `getSortComparator` against
   the same documents: (a) `$exists: false` / `$exists: true` on a field that is present with an
   explicit `null`; (b) `$in` and `$nin` on the same list where some documents lack the field; (c) a
   sort on a string field whose values mix case and accents, and a sort on a field that mixes
   numbers and strings (RxDB's sort contract under SQLite's BINARY collation and type ordering). The
   probe passes when the storage's ids-in-order equal the JS answer.
3. Every leg 3 cell's cross-row content check (below) — a content mismatch is a divergence too.

`smoke.<platform>.<device>.json`: per row, per scenario, pass/fail with the detail string. The count
of divergences is the number the ticket asks for; RESULTS states plainly that the mocha suite was not
run on device and why.

## Leg 2 — process stop, scored like 2144/2210 (`crash-write` and `crash-score` jobs)

`crash-write` job: opens one storage instance for the row (schema `{ id (primary, 64), tx (number),
payload (object) }`, index `['tx']`), seeds 2,000 rows untimed in two `bulkWrite`s of 1,000, posts
`{ type: 'seeded', wal }`, then streams transactions forever in the fixed pattern of sizes
`1, 1, 3, 1, 50, 1, 1, 1000` repeating, ~2,000 JSON bytes per row (the 2143 product fixture shape,
seeded PRNG), 20% of rows in each transaction updating an existing id (`previous` supplied) and the
rest inserting. Each transaction is one `bulkWrite`. Before the call it posts `{ type: 'started', tx,
n, ids }` **and awaits the driver's 200**; when the call resolves with no `error` entries it posts
`{ type: 'acked', tx }` and awaits the 200 before the next transaction. The app never writes a ledger
and never reads the database after a stop; the driver's record of what it received is the acked set.

Driver loop, per row and trial: fresh `dir`/`db`; launch the app with the job; after `seeded`, wait a
uniformly random 0–3,000 ms, stop the process; confirm it is gone; relaunch with a `crash-score` job
carrying the snapshot `{ acked, inflight }`; the app opens the storage (10-second budget for
`createStorageInstance` + the first `query`, retrying every 50 ms), scores, posts the result. Port
the scoring from `spikes/2210-desktop-engine/crash-child.mjs` — ownership replay, the ledger always
scored, repair lines counted (`/rebuilt|salvag|recover/i` from captured `console.*` during open and
first read), integrity: `expo-sqlite` row = `PRAGMA integrity_check` on a plain `openDatabaseAsync`
of the file must be exactly one row `ok`; filesystem rows = the engine's parse/salvage failure lines.
Outcome order, first failure wins: `open-failed`, `integrity-failed`, `lost`, `partial`, `ok`; record
in-flight presence, reopen-to-first-read ms, repairs, the ledger verdict. A scorer that dies before
it reports opening, or after it reports read, is a harness failure (the run is marked incomplete),
not a storage verdict — keep 2210's phase rule. Save the JSON after every trial. Default
`--trials 30` per row.

Bar (ticket): `expo-sqlite` loses nothing acked in any trial on either device. The filesystem rows'
losses, if any, are the expected shape (rxdb-premium-issues#28, spike 2210's Windows/Mac numbers).

## Leg 3 — speed (`bench` and `cold-open` jobs)

Port `spikes/2210-desktop-engine/bench-node.mjs` to the app: the same three schemas with the same
declared indexes, the same `fixtures(n)` (seed 2143, byte-identical), the same cells including
`products-catalogue-projection` (the `expo-sqlite` row issues 2210's `SELECT id, JSON_EXTRACT(...)`
statement through `sqliteBasics.all()`; the filesystem rows do the whole-document query plus a JS
map to the same four fields), the same sampling (one discarded warm-up; N = 7; N = 25 for
`order-line-add` and `order-create`; N = 3 for `seed-products` and cold open), the same two scales
(`small` 2,000 / `large` 20,000), `normalizeMangoQuery` + `prepareQuery`, and the same **cross-row
content check**: set-based on canonical `_rev`-independent content with SHA-256 from `expo-crypto`
(`digestStringAsync`), order judged against the normalized `q.query.sort`, mismatches recorded with
ids and differing documents exactly as 2210 does (`contentMismatch`, `orderMismatch`,
`unsortedSamples`, the `mismatch` record). A content mismatch is recorded, the run continues, and
`report.mjs` exits 1 on the Mac. Timing is `performance.now()` around the direct storage-instance
call. Rows in a fixed order, all cells for one row before the next, every instance closed between
rows. Cross-row comparison happens on the Mac in `report.mjs` from the posted signatures, since the
rows may run in separate app launches.

Native additions, per row:

- **`ingest-100`** — during the large seed, write products in `bulkWrite`s of exactly 100 and record
  every batch's ms; report p50 / p95 / max. (The `seed-products` cell keeps 2210's batch size for
  comparability; this is a second seed into a fresh instance, or the same seed timed per batch if
  2210's batches are already 100 — read it and say which.)
- **JS-thread lag** — the library's `lag-sampler.ts` (16 ms ticks, materialised missed ticks) armed
  during the large seed and during the seven `products-grid-asShipped` samples; report max lag ms
  and the count of ticks over 50 ms for each window. On a physical device only; on simulators say
  the sampler reads display-link cadence and the numbers are not meaningful.
- **JS heap** — `HermesInternal.getInstrumentedStats()` (`js_heapSize`, `js_allocatedBytes`, GC
  count) after the large seed and after the last cell; Android `TOTAL PSS` from the driver at the
  same two moments.
- **`cold-open-first-read`** — the driver stops the app and relaunches it with a `cold-open` job
  (`row, dir, db`) that times storage creation + `createStorageInstance` for products + the first
  `findDocumentsById([one id])` and posts the number. N = 3 per row, after the large seed. The OS page
  cache is warm either way; say so.
- **`disk-bytes`** — walk the row's data directory with `expo-file-system` (`Directory.list()`
  recursively) after the large seed: byte total and file count.

`bench` job fields: `row, scale, dir, db`. The driver runs `--rows` in order and `--scale
small|large|both` (default both); the app posts one `results` object per (row, scale) and the driver
assembles `results.<platform>.<device>.json` with the environment block: platform, device name and OS
version (`xcrun simctl`/`devicectl`/`adb shell getprop ro.product.model ro.build.version.release`),
`expo`, `react-native`, `expo-sqlite`, `sqlite_version()` (from the `expo-sqlite` row), `rxdb`,
`rxdb-premium`, the 47-marker count, `worklets` version, `measuredAt`, `simulator: true|false`.

## `report.mjs` and `RESULTS.md`

Copy 2210's `report.mjs` shape: per platform/device, a leg 3 table per scale with the three rows'
`p50 / p95` and two ratio columns (`expo-filesystem-js ÷ expo-sqlite`, `worklet-filesystem ÷
expo-sqlite`, omitted on a content mismatch), the lag/heap/ingest lines, the leg 2 table with the
2210 columns (`ok`, `open-failed`, `integrity-failed`, `lost`, `partial`, repaired on reopen, ledger
lost / partial, in-flight present / absent, median reopen ms), the leg 1 table (divergences per row),
and a cross-device summary (lowest p50 per cell, descriptive only; a simulator file is listed but
marked "simulator — not evidence"). `winner()` returns `not compared` on a content mismatch. Write
between `<!-- generated:start -->` / `<!-- generated:end -->` markers; the operator writes the prose
above them.

## `run.sh`

`run.sh install` (npm install in `app/`, premium decrypt, the patched-dist copy with the 47 check,
`patch-package`), `run.sh prebuild` (`npx expo prebuild --clean --no-install` then `pod install`
under `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`), `run.sh build ios-sim <udid>` (`xcodebuild … -configuration
Release -sdk iphonesimulator -destination 'id=<udid>'` and `xcrun simctl install`), `run.sh build
ios-device <udid>` (`xcodebuild … -configuration Release -destination 'id=<udid>'
-allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=G7L8G4KJ7A
CODE_SIGN_STYLE=Automatic build` then `xcrun devicectl device install app --device <udid> <path>`;
the Mac has one valid "Apple Development" identity; if signing needs a live Xcode Apple-ID session
the operator does that step, say so in DEVICE-RUN.md), `run.sh build android <serial>`
(`./gradlew assembleRelease` in `app/android` — the Expo template signs release with the debug
keystore, which is what we want — then `adb -s <serial> install -r`), `run.sh smoke|bench|crash
--platform … --device … [--simulator] [--rows …] [--scale …] [--trials N]` (each a thin call into
`driver/driver.mjs`), `run.sh report`. One native build at a time; one simulator or emulator booted
at a time; shut one down before booting the other.

## Your execution

1. Build the app and the driver. Install, prebuild, build for the **iOS simulator** ("iPad Pro
   13-inch (M5)" from `xcrun simctl list devices available`; boot it yourself) and run `smoke`, then
   `bench --scale small`, then `crash --trials 5`, all three rows. Then shut the simulator down, boot
   the **Android emulator** `Pixel_Tablet_API_35` (`~/Library/Android/sdk/emulator/emulator -avd
   Pixel_Tablet_API_35 -no-window -no-audio` is fine), build the release APK, and run the same three.
   Commit the six JSON files under `results/` with `simulator: true` in their environment blocks.
2. `run.sh report` must produce a RESULTS.md whose generated section renders all of it; the prose
   above the markers is a skeleton with the four answer headings left for the operator
   ("Leg 1 — semantics", "Leg 2 — stability", "Leg 3 — speed", "The answer") plus an "Environments"
   table you fill for the simulators.
3. Write `DEVICE-RUN.md`: the exact command sequence for the operator's iPad (USB, `xcrun devicectl
   list devices` for the udid; Wi-Fi shared with the Mac so the app can reach the driver at the Mac's
   LAN address) and Pixel (USB, `adb devices`), including the one-time signing step if it is needed,
   expected durations, and what to send back (the JSON files land in `results/` by themselves).
4. Do not run on physical devices. Do not dispatch any GitHub workflow. Do not spend an EAS build.

Constraints: no new environment variables beyond `RXDB_PREMIUM` (read, never printed) and the launch
URL; every threshold and count is a named constant with a comment saying why. TypeScript in `app/`,
plain `.mjs` for the driver and report. Stated floor ~2,600 lines across app, driver, report,
scripts and docs; the port of `bench-node.mjs` and `crash-child.mjs` is most of the app. Stop and
report if you pass 3× that. Stakes: this is the evidence a platform decision rests on — fixture
identity, scoring fidelity and honest labelling of simulator runs matter more than polish. When a
step cannot be completed (a build failing on this Mac, a signing prompt, a package that will not
resolve), record the exact command and error in RESULTS.md under "Blocked" and continue with what
does not depend on it.

When done, print: the six result file names, the divergence count per row per simulator, the leg 2
outcome counts per row, and every "Blocked" item.
