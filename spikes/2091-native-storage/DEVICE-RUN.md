# Physical-device run — operator checklist

Use an unlocked iPad and Pixel. Run one platform at a time, with other simulators,
emulators and benchmarks stopped. Keep the device powered and the release app foregrounded;
do not interact during measurement. No Metro server is needed.

Allow 5–15 minutes for install/prebuild, 5–20 minutes for each first native build, and
30–90 minutes per device for the three legs (estimates).

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

## Failures and what to send back

The driver prints jobs, cells and trials; the app shows IDLE / RUNNING / DONE or ERROR.
Fatal launch/job timeouts are harness failures, not storage verdicts. The scorer's 10-second
open/first-read timeout is instead recorded as the storage outcome `open-failed`. A completed
smoke command may still contain failed scenarios: read the report.

JSON is saved under `results/`, after every scored crash trial. **Rerunning a leg on the same
device overwrites its JSON.** Preserve failed files before rerunning. Startup failures can
precede file creation: keep the terminal error and check `measuredAt` to avoid returning an
older run. Uninstalling the app removes its stored trial data.

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
