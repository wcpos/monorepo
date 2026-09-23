# Physical-device run — operator checklist

These commands run the release app, not Metro, EAS, Maestro, or a GitHub workflow.
The operator supplies an unlocked iPad and Pixel; this task did not run on physical devices.
Do not interpret simulator/emulator timings as evidence for the storage decision.

## Once, on the Mac

From this worktree's root:

```sh
cd spikes/2091-native-storage
./run.sh install
./run.sh prebuild
```

The root worktree `.env` must contain `RXDB_PREMIUM`. Do not copy it into the app.
Installation suppresses premium's token-printing output, applies the library patches, copies
this worktree's patched premium distribution, and requires exactly 47 marker lines.
The standalone app uses npm; do not run pnpm inside it.

Allow roughly 5–15 minutes for the first install/prebuild and 5–20 minutes per first native
build. These are planning estimates, not measured guarantees. Build one platform at a time.
Stop other simulator/emulator sessions and benchmarks before a device run. Keep each device
unlocked, connected to power, and foregrounded; do not interact with the app during measurement.

## iPad (USB + same Wi-Fi as the Mac)

1. Connect by USB, unlock, and accept the device's trust request if shown. Enable Developer
   Mode if the device requires it. Identify its UDID:

   ```sh
   xcrun devicectl list devices
   ```

2. Store the UDID in a **shell variable**, not an exported environment variable:

   ```sh
   printf 'Paste the iPad UDID: '; read -r IPAD
   ./run.sh build ios-device "$IPAD"
   ```

   Signing uses team `G7L8G4KJ7A`, Automatic signing, and provisioning/device-registration
   updates. Physical signing was not tested in this task. If Xcode reports that no Apple-ID
   session or signing profile is available, the operator must sign in to the team's Apple ID
   in Xcode and satisfy the provisioning prompt, then rerun the same build command. Do not
   switch to EAS. This is the one-time human signing step; record the exact error if it fails.

3. Keep Mac and iPad on the same Wi-Fi (no client isolation/VPN route). The driver prints the
   Mac address and launches the app with that address. Allow the app's local-network prompt
   and the Mac's Node incoming-network prompt if shown. If the automatic address is not
   reachable, enter `http://<Mac's Wi-Fi address>:48091` in the app's Driver URL field and tap
   **Connect** while the driver is running, as a connectivity diagnostic only. Every driver
   relaunch reapplies its automatic address: if the printed address is wrong, stop and resolve
   the Mac LAN route before the full run. A manual address is not an unattended-run fix.
   On this Mac the simulator's first `openurl` exited successfully without delivering a URL;
   see `RESULTS.md` → Blocked. If a fresh app stays IDLE with an empty URL, enter the driver's
   printed HTTP address and tap Connect. That address is saved across process restarts.

4. Run all three legs with this single pasted command block:

   ```sh
   ./run.sh smoke --platform ios --device "$IPAD" &&
   ./run.sh bench --platform ios --device "$IPAD" --scale both &&
   ./run.sh crash --platform ios --device "$IPAD" --trials 30
   ```

## Pixel (USB)

1. Enable USB debugging, connect, unlock, and accept the debugging authorization prompt.
   Identify the physical serial (not an emulator serial):

   ```sh
   "$HOME/Library/Android/sdk/platform-tools/adb" devices
   printf 'Paste the Pixel serial: '; read -r PIXEL
   ./run.sh build android "$PIXEL"
   ```

   The Expo release template uses the debug keystore deliberately: this is a local lab APK,
   not a store release. The driver creates `adb reverse tcp:48091 tcp:48091`, so the Pixel's
   driver address is `http://127.0.0.1:48091`; USB must remain connected.

2. Run:

   ```sh
   ./run.sh smoke --platform android --device "$PIXEL" &&
   ./run.sh bench --platform android --device "$PIXEL" --scale both &&
   ./run.sh crash --platform android --device "$PIXEL" --trials 30
   ```

## Durations, failures, and what to send back

Reserve 30–90 minutes per device for all legs as an **unverified planning estimate**; whole-set
filesystem calls and per-document content hashing can dominate. The driver prints each cell
and crash trial. A job exceeding its declared timeout is a harness failure, not a storage verdict.
The device shows IDLE / RUNNING / DONE or ERROR. No Metro server is needed after installation.

Each successful command writes its JSON automatically under `results/`; crash JSON is saved
after every scored trial. Failures after driver initialization set `complete: false` and `fatal`;
they must not be counted as storage failures. A device/address/port startup failure may happen
before a new file exists: preserve the terminal error and check `measuredAt` rather than sending
a previous successful JSON as evidence for that attempt. Rerunning a leg on the same device overwrites that leg's JSON
with a fresh run and new database names. Preserve a failed JSON first if it is needed for diagnosis.
All trial data remains under the app's document directory; uninstalling the app removes it.

After both devices:

```sh
./run.sh report
```

A content mismatch deliberately makes this command exit 1 **after** writing the report. Do not
hide it or rerun until it disappears: inspect the `mismatch` records. Missing/incomplete legs are
not guaranteed to be listed if no file was created. Incomplete files are labelled. Check that all
six expected physical-device files exist, have current `measuredAt` values, and are complete; a
zero exit code alone does not mean all required evidence exists.

Send back all six physical-device JSON files (`smoke`, `results`, `crash`, one of each for iOS
and Android) plus `RESULTS.md`, including any `fatal` messages or signing errors. Fill the four
answer sections only after checking the physical-device evidence. The mocha suite is not run
inside React Native; the semantic evidence here is the eight-scenario smoke, the three named
probes, and the cross-row benchmark checks. Cold-open timings end at first read, not first render;
OS page cache is warm. Android stops use `am force-stop`, without lifecycle callbacks. Neither
platform's process-stop experiment establishes power-loss durability.
