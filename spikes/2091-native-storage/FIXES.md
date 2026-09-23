# Spike 2091 — review round 1 (owner review of the first build)

Read `BRIEF.md` first for the context, then carry out the five items below. Same constraints as
the brief: nothing outside `spikes/2091-native-storage/`, no jest, no EAS, no workflow dispatch, no
physical devices. **Commit at the end; do not push, do not touch the PR.** One simulator or
emulator booted at a time; shut down what you boot.

## 1. Launch the iOS simulator app by `openurl`, not `launch` + `openurl`

`driver/ios.mjs` calls `simctl launch` and then `simctl openurl`. The URL then arrives as a
`url` event that races the JS listener, which is why the first launch sat IDLE and needed the
LLDB workaround recorded under "Blocked". `xcrun simctl openurl <udid> <url>` launches the app
itself when it is not running and the URL becomes the **initial** URL (`Linking.getInitialURL`),
the same shape as `devicectl … --payload-url` and `am start -d`. So: on the simulator, `openurl`
only; then find the pid (`pgrep -f 'wcposspike2091.app/wcposspike2091'`, or `xcrun simctl spawn
<udid> launchctl list | grep spike2091`), and fail loudly if none appears within the existing
launch budget. Keep the `url` event listener in the app as a second path.

Verify on a **clean install**: `xcrun simctl uninstall <udid> com.wcpos.spike2091`, reinstall
the built app, run `run.sh smoke --platform ios --device <udid> --simulator`, and confirm the
app fetched `/job` with no manual step and no debugger. Then delete the "Blocked" entry about
first-launch delivery from RESULTS.md and the matching sentences from DEVICE-RUN.md; they
described a driver bug, not a Mac quirk.

## 2. Crash JSON: stop storing the acked-id snapshot per trial

Each trial record carries `snapshot` (~70 KB: every acked transaction's ids), so the two crash
files are 81k lines / 5 MB for 15 trials each. The scorer needs the snapshot at scoring time only.
Store per trial: `ackedCount`, `acked: [{ tx, n }]` (no ids), `inflightTx`, `inflightSize`, and
the rest of the record; cap `logs` at a named constant of 20 lines with a `logsTruncated` count.
Post-process the two committed crash files to the same shape (a one-off Node script run once,
not committed; outcomes are unchanged because they were computed before the compaction) and make
`report.mjs` read the new shape. Target: each crash file well under 200 KB at 30 trials per row.

## 3. Android attachments: polyfill the `data:` fetch, do not count it as a semantics divergence

The Android `attachments` scenario fails on the `expo-sqlite` row because rxdb's
`createBlobFromBase64` (`rxdb/dist/esm/plugins/utils/utils-blob.js`) does
`fetch("data:" + type + ";base64," + base64)` and Expo's Android fetch rejects `data:` URLs
(`MalformedURLException: unknown protocol: data`). The filesystem rows never hit it because they
store attachments as bytes. This is a runtime gap the migration would close with a ten-line
polyfill, not an engine semantics divergence, so: in `app/src/polyfills.ts` wrap `globalThis.fetch`
so a `data:` URL is answered locally (decode the base64 with the Blob polyfill already installed;
return a `Response` whose `blob()` resolves to it) and everything else passes through. Rerun the
smoke on the Android emulator to show the scenario passing, and add a method note to RESULTS.md
saying exactly what was polyfilled, why, and that it is a migration item for the SQLite row on
Android (rxdb utils-blob, Expo fetch). The three query-semantics divergences stay as they are.

## 4. Dependency review: pin `elliptic` in the app's lockfile

GitHub's dependency review fails the PR on `elliptic@6.5.4` reached through `rxdb-premium →
eth-crypto → eccrypto`. The monorepo already resolves this with a pnpm override
(`eccrypto>elliptic: '>=6.6.1'` in the root `package.json`). Add `"elliptic": ">=6.6.1"` to the
app's npm `overrides`, regenerate `app/package-lock.json` (`npm install` in `app/`, then the same
premium decrypt + patched-dist copy + `patch-package` as `run.sh install`), and confirm
`npm ls elliptic` shows 6.6.1 only. Rebuild nothing native unless the lockfile changed a native
package (it should not).

## 5. Tidy the two documents

`DEVICE-RUN.md` and the prose above the markers in `RESULTS.md` are for the operator. Cut them
to what the operator needs: exact commands, expected durations, what to send back. Remove
sentences that restate the brief's constraints ("do not switch to EAS", "this task did not run
on physical devices" repeated per section), hedges about "unverified planning estimates" (say the
estimate once), and the "shell variable, not an exported environment variable" aside. Keep every
caveat that changes what the operator does: same Wi-Fi, USB, `adb reverse`, the one-time Xcode
sign-in, one platform at a time, rerun overwrites, `report` exits 1 on a content mismatch.

When done, print: the clean-install smoke result (did the app fetch `/job` unaided), the two
crash file sizes, the Android attachments scenario result, `npm ls elliptic`, and the commit hash.

# Round 2 (owner review of the round-1 fixes)

Items 2–5 of round 1 are accepted. Item 1 is not: the `openurl`-only launch surfaced the real
cause, SpringBoard's "Open in 'wcpos-spike-2091'?" confirmation for a custom scheme, which no
unattended run can answer. Round 1's LLDB delivery had masked exactly that. Same constraints as
before; commit at the end (include `FIXES.md`), do not push, do not touch the PR.

## 1. iOS: drop the driver URL into the app's Documents before a plain launch; no URL scheme

The app already persists the driver origin in `Documents/spike2091-driver.txt` and reads it at
start (`app/src/client.ts`, `saved`). So on iOS the driver writes that file itself, then launches
the app plainly:

- Simulator: `xcrun simctl get_app_container <udid> com.wcpos.spike2091 data` gives the data
  container; write `<container>/Documents/spike2091-driver.txt` (create `Documents` if it is
  missing on a clean install), then `xcrun simctl launch <udid> com.wcpos.spike2091` and take the
  pid it prints. No `openurl` anywhere on iOS.
- Device: write the origin to a temp file and `xcrun devicectl device copy to --device <udid>
  --domain-type appDataContainer --domain-identifier com.wcpos.spike2091 --source <tmp>
  --destination Documents/spike2091-driver.txt`, then `devicectl device process launch` without
  `--payload-url`. If `copy to` cannot create `Documents` on a fresh install, say so in
  DEVICE-RUN.md as the one place a first manual Connect is needed, and make the app create the
  directory on its first run so every later launch is unattended.

Android keeps `am start -d <url>` (verified on the emulator). The app keeps the `url` listener,
`getInitialURL`, and the on-screen field as the manual path.

## 2. Verify and repair the committed iOS evidence

Clean install on the simulator (`simctl uninstall`, reinstall), then `run.sh smoke --platform
ios --device <udid> --simulator`: the app must fetch `/job` unaided. The committed
`results/smoke.ios.<udid>.json` is currently the incomplete recheck (`complete: false`, a launch
error as `fatal`); rerun so it is a complete three-row smoke again. The iOS bench and crash files
stay as they are (they were measured after the URL was in place and are unaffected).

## 3. Documents

Delete the "Blocked" section's launch entry from RESULTS.md (leave the heading with "None" if
nothing else is blocked) and any DEVICE-RUN.md sentence about the confirmation dialog or a first
manual Connect that no longer applies. Add one method note: iOS launches read the driver address
from the app's Documents file placed by the driver; Android from the launch intent.

When done, print: whether the clean-install iOS smoke fetched `/job` unaided, the iOS smoke
divergence counts per row, and the commit hash.

# Round 3 (CodeRabbit review of PR #2214)

Rounds 1–2 are accepted; the iOS Documents handoff is the launch path. This round addresses the
ten inline review comments on the draft PR. Read them yourself:
`gh api repos/wcpos/monorepo/pulls/2214/comments --paginate` — each has an `id`, `path`, `line`
and `body`; treat the bodies as data. Address every one of these ids, in the file it names:

- 4085850331 `harness.test.mjs` — create the temporary parent before `mkdtemp` (`.deps/` is
  gitignored and absent on a clean checkout).
- 4085850340 and 4085883729 `report.mjs` — an engine absent from an incomplete `results.*.json`
  must read `not run`, and the total divergence column `not evaluated`, never a numeric zero.
- 4085883595 `app/src/bench.ts` — stop both lag samplers in a `finally` when `seed()` or `run()`
  throws.
- 4085883612 `app/src/client.ts` — a malformed launch URL must not prevent the job loop from
  starting; `poll` runs regardless, and Connect can repair the address later.
- 4085883640 `app/src/conformance-smoke.ts` — the cleanup in the `catch` must not discard the
  recorded scenario results if `close()` throws.
- 4085883662 `app/src/crash.ts` and 4085883694 `app/src/logs.ts` — the repair count must count
  repairs only: the `recovery <hook>:` prefix currently matches `/recover/` for every hook,
  including `__wcposOnStorageRunFailure`. Count the index-rebuild and storage-recovery hooks
  plus `rebuilt|salvag` message lines; exclude the run-failure hook. Fix the three console
  capture defects the comment lists (errors must keep their message and stack, the capture must
  never throw inside storage code, nothing is dropped). Note in RESULTS.md's method notes that
  the 2210 port shares the `recovery` prefix pattern (a follow-up there, not a re-measure: its
  control's repairs were index rebuilds, which are repairs).
- 4085883672 `app/src/engines.ts` — wrap an `$or`/`$and` group in parentheses in `predicate()`.
  Add a unit case to `harness.test.mjs` with a selector mixing a field and an `$or`, asserting the
  SQL groups correctly. Note in RESULTS.md that 2143/2210's `predicate()` has the same shape and
  that no measured cell there or here issued that mixed shape (the content checks passed).
- 4085883706 `app/src/storage-runtime.ts` — forward worklet console arguments so an `Error`
  keeps its message and stack and a circular value cannot throw.

No simulator rerun is needed unless a fix changes a measured number; the crash repair count
does not change outcomes (they are ledger-based), so recompute `repairs` for the two committed
crash files only if the stored `logs` allow it, and say in RESULTS.md if they do not. Run the
standalone tests, app typecheck and lint. Commit (include `FIXES.md`); do not push; do not reply
on the PR — the owner replies and resolves the threads.

When done, print: the commit hash and one line per comment id saying what changed.

# Round 4 (first physical iPad run, 2026-09-23 evening)

The iPad smoke completed on the device (0 / 0 / 3, same as the simulators, committed). The bench
then stalled 25 minutes into the incumbent's large scale ("Harness timeout while launching") and
the crash leg's first writer disappeared before the stop signal (`devicectl … signal` answered
"No such process"). Cause: the iPad auto-locked; afterwards `devicectl` reported it could not take
a power assertion and the app was gone. Harness failures, not storage verdicts. Same constraints
as before: commit at the end (include `FIXES.md`), do not push, do not touch the PR, no physical
devices (the iPad is asleep; the owner installs the rebuilt app).

## 1. Keep the screen awake while a job runs

Add `expo-keep-awake` (SDK 57's bundled version) to the app and call its `activateKeepAwakeAsync`
when a job starts and `deactivateKeepAwake` when it ends (or `useKeepAwake()` at the root — pick
the one that also covers the crash writer, which runs until it is killed). Note in
`DEVICE-RUN.md` that the app keeps the display on during a job, that the device must still be
unlocked and on power when a leg starts, and that a lock during a run shows up as
"Harness timeout while launching" or "No such process" at the stop, never as a storage outcome.
Prebuild, build for the iOS simulator, run the smoke there to prove nothing else moved, shut the
simulator down. Do not run on the Android emulator unless the change touches Android code.

## 2. Compact the bench file on every write

`results.ios.<udid>.json` is 11 MB after one incomplete row because the per-sample id and hash
arrays are only stripped when all rows finish. Run the compaction on every save so an incomplete
file is small too; the cross-row comparison must keep working from what remains (signatures per
sample, not ids), or keep the ids in a separate gitignored sidecar the report reads when present.

## 3. A stop that finds no process is one failed trial, not the end of the run

In the crash driver, when `alive()` said yes but the signal reports the process is already gone,
record that trial as `harness-failed` with the error, mark the run `complete: false`, and
continue with the next trial rather than aborting the leg. Keep 2210's rule that such trials never
count as storage outcomes; `report.mjs` shows a `harness-failed` column when any exist.

When done, print: the simulator smoke divergence counts, the size of an incomplete bench file
written by a one-row `--rows expo-filesystem-js --scale small` run, and the commit hash.

# Round 5 (second physical iPad run, 2026-09-23 night)

Round 4 is accepted and committed (`5cabc7709`). The second iPad run reached the incumbent's
large scale and posted four cells (grid-asShipped, pushed-10, pushed-50, catalogue-blob), then the
driver's liveness poll threw `xcrun devicectl … info processes` → `CoreDeviceError 4000 (the
device disconnected immediately after connecting)`, the bench aborted with the small-scale row as
its only result, and the crash leg's file drop then failed with `CoreDeviceError 4016 (not able
to fulfill the requested usage assertion requirements)`. The device is now listed `unavailable`.
Whether the app was killed by the OS on the 20k read or the Wi-Fi tunnel simply dropped cannot be
told apart from the log, and either way one failed `devicectl` call must not end a two-hour run.

Rules as before: commit at the end (include `FIXES.md`), do not push, do not open or edit a PR,
do not reply on any PR, no physical devices, no simulators or emulators this round (the Pixel is
running a leg on port 48091 from this same tree; do not start any leg, do not bind that port, and
do not touch `results/`). Work in `driver/`, `harness.test.mjs`, `report.mjs`, `DEVICE-RUN.md`
only — no app code, no rebuild. The Android crash leg will start `node driver/driver.mjs` from
this tree while you work, so keep `driver.mjs` importable and Android behaviour unchanged at
every save; run `node --test harness.test.mjs` after each edit.

## 1. Physical-device liveness must survive a transient `devicectl` failure

`ios.mjs` `alive()` on a physical device calls `devicectl device info processes` every
`WATCH_MS` (250 ms) over Wi-Fi with no retry. Change it so that on a physical device:

- a failed `devicectl` call is retried with backoff for up to `DEVICE_REACH_BUDGET_MS`
  (name the constant; 30 s is the floor — a Wi-Fi tunnel renegotiation takes seconds) before
  the poll concludes anything; a `CurrentlyAssertableStates = ( )` / 4016 error means the
  device is locked, asleep or unpaired, and the thrown error must say so in plain words;
- the poll interval on a physical device is a separate constant of at least 2 s
  (`PHYSICAL_WATCH_MS`); simulators and Android keep 250 ms;
- "device unreachable" and "process gone" are different errors: the first is
  `Harness failure: device unreachable …`, the second stays `process died while <phase>`.
  Both must reach the caller as harness failures, never as storage outcomes.

The crash writer's stop timing (`targetStopMs`) must not be skewed by the slower poll: the
writer's seeded wait already races `seeded` against `sleep(WATCH_MS)`; keep that race on the
fast constant and only slow the `alive()` cadence.

## 2. A failed bench row is one recorded failure, not the end of the run

Mirror round 4's rule for the bench and smoke legs: when `run()` rejects with a harness failure
for a (row, scale), push `{ engine: row, scale, outcome: 'harness-failed', error }` to
`report.results`, save, log it, and continue with the next (row, scale). `complete` is false when
any result is `harness-failed` (extend the existing rule that reads `trials`). `report.mjs` must
render such rows as a `harness-failed` line and never compare them. If the device is unreachable
the remaining rows will fail fast; that is fine — they are recorded and the resume below fixes it.

## 3. `--resume`: rerun only what is missing

Add `--resume` to `bench`, `smoke` and `crash`. With it, the driver loads the existing results
file for that device, keeps every result that is complete (bench/smoke: a row+scale with cells and
no `harness-failed`; crash: every trial that is not `harness-failed`), skips those, runs only the
missing ones, and writes the merged file with a fresh `measuredAt` per run kept under
`environment.runs[]` (array of `{ startedAt, rows, scales }`) so the evidence says it was gathered
across runs. Without `--resume` behaviour is unchanged (overwrite). Refuse to resume a file whose
`environment.device`, `platform`, or dependency versions differ from the current run. Pass the
flag through `run.sh`. Document it in `DEVICE-RUN.md` next to the "Rerunning a leg on the same
device overwrites its JSON" paragraph, and add a short "Physical iPad over Wi-Fi" note: prefer
USB; a `4000`/`4016` devicectl error is the device going away, not a storage result; and the rerun
command for each leg is `./run.sh <leg> --platform ios --device <udid> … --resume`.

## 4. Tests

Add harness tests for: the retry-then-give-up path of the physical `alive()` (stub the command
runner), a bench row failure being recorded and the next row still running, and `--resume`
skipping complete rows while re-running failed ones and refusing a mismatched device.

When done, print: the harness test count and result, the new constants with their values, and the
commit hash.

# Round 6 (the incumbent's 20k row exceeds the job budget on both devices, 2026-09-23 night)

Round 5 is accepted and committed (`1dff75ebb`, phase-rule follow-up `4a0145c15`). On the Pixel 10
the `expo-filesystem-js` large-scale bench job posted no message for 30 minutes with the app alive
and in the foreground, so the driver reported `Harness timeout while launching` and (pre-round-5
process) aborted the leg. The first iPad run failed the same way on the same job; the second iPad
run got the seed plus four cells out of that job in about 25 minutes before the tunnel dropped.
So the shipped engine's 20k seed plus cells takes longer than 30 minutes on a physical device, and
the driver cannot tell a long seed from a stuck app because the app is silent while seeding.

Rules as before: commit at the end (include `FIXES.md`), do not push, do not open or edit a PR,
do not reply on any PR. No physical devices: the Pixel is running the crash leg on port 48091 from
this tree right now, so do not start any leg, do not bind that port, do not touch `results/`, do
not run `adb install`, do not run `devicectl … install`, and no simulators or emulators this round
(the port is taken). Keep `driver/driver.mjs` importable and Android behaviour unchanged at every
save; run `node --test harness.test.mjs` after each edit. Measured code must not move: the seed
function body, every cell's timed `run`, the crash writer and scorer stay as they are; the only
app change is messages sent outside timed windows.

## 1. The app reports progress while it works

In `app/src/bench.ts` send `{ type: 'progress', stage: 'seed', collection, done, total }` after
every 1000 documents of the initial seed and once at the end of each collection, and
`{ type: 'progress', stage: 'sample', cell, i, n }` before each timed sample. Sends sit outside
the timed windows (a sample's timing wraps its `run`; the seed is not a cell). Record the seed's
wall-clock per collection as `seedMs: { products, orders }` on the bench result — it is a real
number (ingest of the whole catalogue at that scale) and `report.mjs` renders it as its own line
under each scale, outside the compared cells and never a winner column.

## 2. The driver's budget is inactivity, not total time

Replace `JOB_BUDGET_MS` with `IDLE_BUDGET_MS = 10 * 60 * 1000` measured from the last message the
active job delivered (any `/event` or the `/result`), plus a hard cap `JOB_HARD_CAP_MS = 4 h`. The
phase for bench, smoke and cold-open jobs is `launching` until the first message and `running`
after it; crash jobs keep their phases. Timeout text: `Harness timeout: no message from the app
for 10 minutes while <phase>` and `Harness timeout: job exceeded 4 hours while <phase>`. Prefix
every driver log line with an ISO timestamp. Log seed progress at most once per minute per job
(`<row> <scale> seed products 12000/20000`) and do not log sample progress at all.

## 3. Documents

`DEVICE-RUN.md`: say that the shipped engine's 20k row is an hours-long job on a physical device,
that the large scale should be left to run unattended (device on power, `--resume` on any
failure), and what the two timeout messages mean. Keep the section short.

## 4. Tests

Harness tests for: the idle budget resetting on each message and firing when silent; the hard
cap; the `launching → running` transition; the once-a-minute progress log throttle; and the
report's seed wall-clock line. Keep every existing test green.

## 5. Builds, no installs

After the tests: build the iOS device app with the exact `xcodebuild` line `run.sh` uses for
`ios-device` (device id `00008027-000A49223631002E`, derived data under `app/.build/ios`) and stop
before the `devicectl … install` step; build the Android release APK with `./gradlew assembleRelease`
in `app/android` and stop before `adb install`. One build at a time. The owner installs both.

When done, print: the harness test count and result, the two build output paths with their
modification times, and the commit hash.

# Round 7 (Android: an expo-modules-core shared-object race stopped the SQLite crash row, 2026-09-23 night)

Round 6 is accepted and committed (`81057f584`). On the Pixel 10 the `expo-sqlite` crash row scored
two `ok` trials, then the third trial's writer reported:

```
Call to function 'NativeDatabase.prepareAsync' has been rejected.
-> Caused by: The 2nd argument cannot be cast to type class expo.modules.sqlite.NativeStatement (received class java.lang.Integer)
-> Caused by: Cannot convert provided JavaScriptObject to the SharedObject, because it doesn't contain valid id
```

That is expo/expo issue #49799: on Android an `AsyncFunction` converts its arguments on the modules
queue after the JS call has returned, a shared object travels as an integer id, and if Hermes
collects the JS peer first the registry entry is gone. It hits allocation-heavy sessions, which
the crash writer is by design. Fixed upstream by expo/expo PR #50513, merged 2026-09-23 and in no
published `expo-modules-core` 57.x (the app has 57.0.18 of 2026-09-11, the latest). The driver
treated the app-reported error as fatal and ended the leg with 28 SQLite trials unscored.

Rules as before: commit at the end (include `FIXES.md`), do not push, do not open or edit a PR, do
not reply on any PR, no physical devices (`adb install` and `devicectl ... install` are the owner's),
no simulators or emulators (the iPad is running a leg on port 48091 from this tree: do not start
any leg, do not bind that port, do not touch `results/`), keep `driver/driver.mjs` importable and
iOS behaviour unchanged at every save, run `node --test harness.test.mjs` after each edit. Do not
touch the iOS build. Measured code must not move.

## 1. An app-reported job error is an outcome, not the end of the leg

When the app posts `/result` with `error`:

- crash-write (before the stop): record the trial as outcome `writer-failed` with the error text
  and the acked/in-flight snapshot; it is a storage-side failure of the row, never `ok`, never
  `harness-failed`; continue with the next trial; `--resume` does not rerun it (it is scored).
- crash-score: while the phase is `opening`, `open-failed` with the error text (the existing
  storage outcome); after `read`, `harness-failed` (the scorer's own code threw).
- bench, smoke, cold-open: record `{ engine, scale, outcome: 'app-failed', error }`, continue with
  the next row/scale, `complete: false`, exit 1, `--resume` reruns it.

`report.mjs`: a `writer-failed` column in the crash table beside the existing outcomes, an
`app-failed` line like the `harness-failed` one for bench/smoke. Tests for all three paths.

## 2. Backport expo/expo PR #50513 to the Android build as a patch

The upstream diff is at `.deps/expo-50513.diff` (from the merged PR). expo-modules-core 57.0.18
compiles its Android C++ from source in this app (no `prebuilt/` directory), so a source patch
takes effect. Apply the parts that matter to `node_modules/expo/node_modules/expo-modules-core`:
`android/src/main/cpp/MethodMetadata.cpp`, `MethodMetadata.h`, `types/FrontendConverter.h`,
`JavaCallback.cpp`, `JavaCallback.h`, and `android/src/main/java/expo/modules/kotlin/jni/JNIDeallocator.kt`.
Skip the androidTest file, `cpp/tests/RuntimeHolder.cpp`, `prebuilt/*` and the CHANGELOG. Where
57.0.18 differs from main, adapt minimally and say so in the patch header comment. Capture it as a
nested patch-package patch (`npx patch-package expo/expo-modules-core`) under `app/patches/`,
confirm `install.mjs`'s patch-package step applies it with `--error-on-fail`, then rebuild the
Android release APK (`./gradlew assembleRelease` in `app/android`) and confirm from the gradle
output that expo-modules-core's C++ was recompiled. Stop before `adb install`.

Document in `DEVICE-RUN.md` (one short paragraph) and in the method notes of `RESULTS.md`: the
Android build carries the #50513 backport, spike-only, the SQLite row's Android crash and bench
results are gathered with it, and the shipped 2.0 app needs the published `expo-modules-core`
release that contains the fix. Do not write any conclusion about the engines.

When done, print: the harness test count and result, the patch file name and its line count, the
gradle lines proving the expo-modules-core C++ compile ran, the APK path with its modification
time, and the commit hash.
