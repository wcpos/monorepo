# Physical-device run — operator checklist

Use an unlocked iPad and Pixel. Run one platform at a time, with other simulators,
emulators and benchmarks stopped. Keep the device powered and the release app foregrounded;
do not interact during measurement. The app keeps the display on during a job, including the
crash writer until it is stopped. The device must still be unlocked and on power when each leg
starts. No Metro server is needed.

Allow 5–15 minutes for install/prebuild, 5–20 minutes for each first native build, and
hours per device for all three legs (estimates).

## Once, on the Mac

The worktree root `.env` must contain `RXDB_PREMIUM`; do not copy it into the app.
Root dependencies and premium patches must already be installed: the app installer copies
`node_modules/rxdb-premium/dist` from the worktree root. From the worktree root:

```sh
cd spikes/2091-native-storage
./run.sh install
./run.sh prebuild
```

The app uses npm, not pnpm. Installation applies patches and requires 47 premium marker lines.

## iPad — USB + same Wi-Fi as the Mac

1. Connect by USB, unlock, accept the trust request and enable Developer Mode if requested.

   ```sh
   xcrun devicectl list devices
   printf 'Paste the iPad UDID: '; read -r IPAD
   ./run.sh build ios-device "$IPAD"
   ```

   Signing uses team `G7L8G4KJ7A` with automatic provisioning/device registration. If Xcode
   reports a missing Apple-ID session or profile, sign in to the team's Apple ID in Xcode,
   complete provisioning, and rerun the build. Save the exact error if this fails.

2. Keep Mac and iPad on the same Wi-Fi, without client isolation or a VPN route between them.
   Before each plain launch, the driver copies its address to the app's
   `Documents/spike2091-driver.txt`; no URL scheme is used for iOS launches.
   Allow the app's local-network and Mac's Node incoming-network prompts. The driver prints
   its Mac address. If unreachable, enter `http://<Mac's Wi-Fi address>:48091` in the app's
   Driver URL field and tap **Connect** while the driver runs, for diagnosis only. Each
   relaunch restores the automatic address: correct the Mac LAN route before a full run.

3. Run:

   ```sh
   ./run.sh smoke --platform ios --device "$IPAD" &&
   ./run.sh bench --platform ios --device "$IPAD" --scale both &&
   ./run.sh crash --platform ios --device "$IPAD" --trials 30
   ```

## Pixel — USB

The Android build carries the spike-only [expo/expo #50513](https://github.com/expo/expo/pull/50513)
shared-object lifetime backport. Gather subsequent SQLite Android crash and bench results with
this patched APK; pre-backport files are not remeasured by rebuilding. The shipped 2.0 app needs
a published `expo-modules-core` release containing this fix, not this spike patch.

1. Enable USB debugging, connect, unlock and accept the debugging authorization prompt.
   Select the physical serial, not an emulator:

   ```sh
   "$HOME/Library/Android/sdk/platform-tools/adb" devices
   printf 'Paste the Pixel serial: '; read -r PIXEL
   ./run.sh build android "$PIXEL"
   ```

   The local release APK uses the debug keystore. The driver sets
   `adb reverse tcp:48091 tcp:48091` and uses `http://127.0.0.1:48091`; keep USB connected.

2. Run:

   ```sh
   ./run.sh smoke --platform android --device "$PIXEL" &&
   ./run.sh bench --platform android --device "$PIXEL" --scale both &&
   ./run.sh crash --platform android --device "$PIXEL" --trials 30
   ```

## Large-scale bench

The shipped engine's 20k row is an hours-long job on a physical device. Leave the large scale
running unattended, device on power; resume any failure with the original command plus `--resume`.
Timestamped seed progress is logged at most once a minute; sample progress only resets the idle timer.
`Harness timeout: no message from the app for 30 minutes while <phase>` means the active job
has been silent for thirty minutes, not necessarily that the process died (the shipped engine's
20k orders seed went more than ten minutes between 1000-row batches on the iPad). `Harness timeout: job
exceeded 4 hours while <phase>` is the total job cap, even with progress. Ordinary jobs are
`launching` until their first message, then `running`. Both timeouts are harness failures.

## Failures and what to send back

The driver prints jobs, cells and trials; the app shows IDLE / RUNNING / DONE or ERROR.
A lock during a run can appear as a no-message timeout or "No such process" at
the stop: these are harness failures, never storage outcomes. A vanished stop target is recorded
as `harness-failed`; the driver continues with the next trial but leaves `complete: false` and
exits 1. The crash report adds a `harness-failed` column when needed.
Bench and smoke record a harness failure as `harness-failed` and an app-reported error
(including cold-open) as `app-failed`, then continue; either leaves
`complete: false` and exits 1. Launch/job timeouts are harness failures, not storage verdicts. The scorer's 10-second
open/first-read timeout is instead recorded as the storage outcome `open-failed`. A completed
smoke command may still contain failed scenarios: read the report. An app-reported crash-writer
error is a scored `writer-failed` storage outcome, with acknowledged/in-flight transaction counts;
it is not retried by resume. A scorer-reported error during opening is `open-failed`; after the
read event it is `harness-failed`. Each is recorded and the next trial runs.

JSON is saved under `results/`, after every scored crash trial. **Rerunning a leg on the same
device overwrites its JSON unless you add `--resume`.** Resume keeps completed row/scale results
(including smoke divergences) and scored crash trials (including storage failures), rerunning
missing, `harness-failed`, or bench/smoke `app-failed` entries within the requested rows, scales and trial count. Reuse the
original selection to finish the whole leg. A missing file starts a new run; a different device,
platform or dependency version is refused. Each invocation is recorded in `environment.runs`
with its start time, rows and scales; `measuredAt` is the latest invocation's start time.
Preserve failed files before an overwrite. Startup failures can
precede file creation: keep the terminal error and check `measuredAt` to avoid returning an
older run. Uninstalling the app removes its stored trial data.

### Physical iPad over Wi-Fi

Prefer USB for device control; keep the shared Wi-Fi route for the app's HTTP connection.
A `4000`/`4016` devicectl error means the device has gone away, not a storage result. `4016`
can mean locked, asleep or unpaired: unlock, reconnect and restore trust before resuming.
Physical liveness checks run every 2 seconds and retry command failures with backoff for up to
30 seconds. No simulator or Android polling interval changes.

From this spike directory, with the same device and original row/scale/trial selection:

```sh
./run.sh smoke --platform ios --device "$IPAD" --resume
./run.sh bench --platform ios --device "$IPAD" --scale both --resume
./run.sh crash --platform ios --device "$IPAD" --trials 30 --resume
```

After both devices:

```sh
./run.sh report
```

`report` exits **1 on a content mismatch**, after writing `RESULTS.md`. Inspect the `mismatch`
records; do not hide the exit status. Check all six physical-device files exist, have current
`measuredAt` values and say `complete: true`; exit 0 alone does not prove all legs ran.

Send all six JSON files (`smoke`, `results`, `crash` for iOS and Android), `RESULTS.md`, and any
terminal/signing errors. Fill its four answer sections from physical-device evidence only.
See its method notes before interpreting timings, divergences or process-stop durability.
