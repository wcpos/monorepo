# Review brief: rounds 4–11 of the spike-2091 harness (read-only)

Review the changes between commit `9d6be9cc8` and `HEAD` under `spikes/2091-native-storage/`
(driver, app sources, `report.mjs`, `harness.test.mjs`, the docs). The earlier commits were
reviewed already; only this range is in scope. This is a research harness, not shipping code: it
drives a standalone Expo app on two physical devices from a Mac and records storage-engine
measurements into `results/*.json`, and `RESULTS.md` states the conclusions.

Rules: do not modify any file, do not run builds, installs, devices, simulators or emulators, do
not run anything that binds a network port. You may run `node --test harness.test.mjs` from
`spikes/2091-native-storage` and `npm run typecheck` in `spikes/2091-native-storage/app`.

Look for, in this order of importance:

1. **Measurement validity.** Anything in the range that could change a recorded number without
   being visible in the results: timers that include harness work, samples lost or duplicated on
   `--resume`, partial cells merged incorrectly, the report rendering a number that the JSON does
   not support, an outcome recorded as a storage result when it was a harness failure or the
   reverse. `RESULTS.md`'s hand-written sections cite numbers from the JSON files; spot-check
   ten of them against `results/results.ios.00008027-000A49223631002E.json`,
   `results/results.android.5C270DLCR0020Q.json` and the two `crash.*.json` files.
2. **Driver control-flow defects** in `driver/driver.mjs`, `driver/control.mjs`, `driver/ios.mjs`,
   `driver/android.mjs`: a promise that can settle twice, a job that can be lost between
   `launching` and `running`, a stop that can race the next launch, resume logic that skips or
   repeats a row or trial, the port flag not reaching every consumer.
3. **App-side defects** in `app/src/bench.ts`, `app/src/client.ts`, `app/src/crash.ts`,
   `app/src/polyfills.ts`, `app/with-show-when-locked.js`, `app/app.json`: an event posted with
   a wrong shape, a progress path that can throw inside a timed cell, a config plugin that would
   not survive `expo prebuild --clean`.
4. **Docs drift:** claims in `RESULTS.md`, `DEVICE-RUN.md` or `FIXES.md` (this range only) that the
   code or the JSON contradicts.

Report each finding as: severity (blocker / major / minor / nit), `path:line`, what is wrong, the
concrete failure it causes, and the smallest fix. Then a one-paragraph verdict on whether the
recorded numbers can be trusted as `RESULTS.md` presents them. Do not pad with style remarks.
