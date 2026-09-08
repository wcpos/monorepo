# Overnight iPad cashier run — prompt for Codex (GPT-6 Astra)

Run it from the monorepo root on Paul's Mac with the iPad on USB:

```sh
caffeinate -dims &   # keep the Mac awake for the night
codex exec -m gpt-6-astra -c model_reasoning_effort="high" -s danger-full-access \
  --cd /Users/kilbot/Projects/monorepo-v2/.claude/worktrees/fix+expo-opfs-swap-copies \
  < /Users/kilbot/Projects/monorepo-v2/.claude/worktrees/ios-device-profile/.claude/research/2026-09-08-ipad-expo-opfs-swap-copies/overnight-cashier-prompt.md
```

Everything below the line is the prompt.

---

You are running an unattended overnight session on Paul's MacBook Pro with his iPad Pro (12.9" 3rd gen, iPad8,5, iOS 26.6.1) attached over USB. Nobody is watching. Your job: drive the WCPOS point-of-sale app on the iPad the way a cashier would, for hours, and produce a ranked, evidence-backed list of everything that is sluggish. The bar is the web build: every tap should respond in under 100 ms and nothing should stall the UI for more than a frame or two. Anything slower is a finding.

## Ground truth you start from

- Product: WCPOS, a React Native + Expo POS client (`apps/main`), Hermes, new architecture. Data lives in RxDB on a filesystem storage engine; the sync engine pulls the WooCommerce catalogue and pushes orders.
- Today's diagnosis is in `.claude/research/2026-09-08-ipad-expo-opfs-swap-copies/README.md` in this worktree's parent repo (path: `/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/ios-device-profile/.claude/research/2026-09-08-ipad-expo-opfs-swap-copies/`). Read it first. Short version: (1) the storage engine copied whole files on every write — this worktree carries the fix (PR #1918); (2) the interaction-time freezes are Hermes garbage collection over a large live heap (≈42 k React fibers, ≈40 k live RxJS subscriptions); (3) the dev client compiles the JS bundle from source on the device, so absolute numbers are inflated versus a release build — compare interactions to each other, and to the web, not to zero.
- What is installed and running:
  - `com.wcpos.main.dev` on the iPad: the **development client** built locally from `main`. It contains no JS; it loads the bundle from Metro over Wi-Fi. Do not uninstall or touch `com.wcpos.main` (Paul's App Store install) — it must stay exactly as it is.
  - Metro should be serving on port 8081 from **this** worktree (`/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/fix+expo-opfs-swap-copies/apps/main`). Check with `curl -s http://127.0.0.1:8081/status` (expect `packager-status:running`). If it is not running, start it exactly like this and wait for "Waiting on":
    `cd apps/main && EXPO_NO_METRO_LAZY=1 EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1 CI=1 npx expo start --no-dev --minify --clear --port 8081`
    (`--no-dev --minify` because dev mode distorts timings; `EXPO_NO_METRO_LAZY=1` because dynamic imports break under `--no-dev` lazy bundling; the probe flag turns on the JS-thread timing rows.)
  - Launch / relaunch the app pointed at Metro:
    `xcrun devicectl device process launch --terminate-existing --device 96D11509-CE68-5507-9AA5-713657C0B14A --payload-url "wcpos-dev://expo-development-client/?url=http%3A%2F%2F192.168.1.152%3A8081" com.wcpos.main.dev`
    (CoreDevice id `96D11509-CE68-5507-9AA5-713657C0B14A`; hardware UDID `00008027-000A49223631002E`; the Mac's LAN address is `192.168.1.152` — re-check with `ipconfig getifaddr en0` if the bundle never loads.) If the dev-launcher home screen appears instead of the app, the deep link was ignored: use `maestro` (below) to tap the URL field and enter `http://192.168.1.152:8081`.
- Store: the app is logged out on a fresh container. Log in through the UI to the demo store Paul used today (`demo.wcpos.com`, store id 1235; the login screen's demo button logs in without a password if present). If the login flow needs credentials you do not have, stop and write that in the report — do not guess.
- Instruments already prepared (all in the research folder above; copy them into a scratch directory under `/tmp/overnight` before use):
  - `pull-rows.sh` — pulls the app's storage directory over USB and prints the "JS thread timing report" rows (one per minute: `maxMs`, stall buckets at 16/50/100/250/500/1000 ms, and the busiest storage collection×method). `PULL_DIR=/tmp/overnight/pulls bash pull-rows.sh`. Trust `maxMs` and the buckets; `blockedMs` is inflated on this ProMotion iPad while idle.
  - `cdp-errors.mjs` — streams every uncaught exception and `console.error` from the app with symbolicated stacks over Metro's inspector: `WCPOS_WORKTREE_PKG=$PWD/package.json node cdp-errors.mjs | tee /tmp/overnight/errors.log`. Run it for the whole session in the background. Paul saw a RedBox "about a form" today that nothing persisted — capture its text.
  - `cdp-heap.mjs` — one-shot Hermes heap usage and GC counters. Take a reading at the start, then hourly, then at the end. No overhead.
  - `cdp-profile.mjs <seconds> <prefix>` — a Hermes CPU profile. It is **heavy** (three sampler threads, ~40 % of CPU) and inflates every other number; use it at most three times all night, only for 60 s, only on an interaction you have already shown to be slow, and never at the same time as a probe-row minute you intend to quote.
  - iOS's own CPU diagnostics land in `xcrun devicectl device copy from --device 96D11509-CE68-5507-9AA5-713657C0B14A --domain-type systemCrashLogs --source . --destination /tmp/overnight/crashlogs` as `WCPOS.cpu_resource-*.ips` (and `JetsamEvent-*.ips` for memory kills). Pull them at the end.

## Driving the device

1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`, then `export PATH="$HOME/.maestro/bin:$PATH"` and `maestro --version`. Maestro's iOS driver is an XCTest runner; **verify that your installed version supports a physical iPad** (`maestro --device 00008027-000A49223631002E test <flow>` or `maestro test --udid …`; consult `maestro --help` and the docs at maestro.mobile.dev for "real iOS device"). It needs the device in `xcrun devicectl list devices` (it is, paired, Developer Mode on) and a signed runner — Xcode's team `G7L8G4KJ7A` is logged in and can sign automatically. If physical-device support genuinely does not work after a real attempt (say exactly what failed), fall back to WebDriverAgent/Appium over XCUITest, and if that also fails, stop and write up what you tried — do not switch to the iOS Simulator, its timings are artefacts.
2. Read `apps/main/.maestro/README.md` before writing any flow. It carries the flow-authoring rules, the `testID` selector policy (never select by text), the known failure classes and the tripwires. The existing flows under `apps/main/.maestro/` are the reference for how to log in, open the POS, search, add to cart, check out and open orders — run them on the iPad first to calibrate, then write your own cashier flows in `/tmp/overnight/flows/` (do not modify the checked-in ones).
3. Write flows as a cashier would act, with a pause of 1–3 s between actions like a human, and repeat them in cycles for the whole night: search a product by name, scroll the grid, open a variation, add three lines, change a quantity, remove a line, add a fee, pick a customer, check out with cash, open the orders screen, open the order, void it, go back; every 20 minutes leave the app idle for 6 minutes on the POS screen and then resume (the 5-minute sync cycle is where the worst idle-time stalls lived today); once an hour switch to the customers and products screens and back; once during the night background the app for 15 minutes and foreground it. Always end a cycle in the same state you started it.
4. Measure every interaction two ways: (a) Maestro's own per-command timing from `--debug-output /tmp/overnight/maestro-debug` (the time from a tap to the `assertVisible` that proves the UI responded, using the outcome's `testID`, not text); (b) the probe rows for the same minute. A tap whose expected result takes over 300 ms to appear, or any minute with a stall over 250 ms, is a finding; over 1 s is a headline finding. Note the wall-clock time of every flow step so you can line it up with rows, heap readings and errors.

## Hard rules

- Nothing you do may cost money or touch shared infrastructure: no EAS builds, no `gh workflow run`, no `git push`, no PRs, no branches in the main working tree, no server-side changes. Everything you write goes under `/tmp/overnight/` plus the one report file named below.
- Do not modify app code, `apps/main/.maestro/`, or the Metro invocation beyond restarting it as given. If the app crashes, relaunch it with the command above and note the time; if it crashes three times in an hour, stop driving and write up.
- One process that compiles or profiles at a time. Never run the unit test suites. The Mac has 24 GB and a memory watchdog that kills runaway processes; keep your own footprint small (no `pnpm install`, no builds).
- Do not lock, restart, unpair or uninstall anything on the iPad. Leave it on the login screen or the POS screen when you finish.
- Stop driving after 7 hours or at 06:30 local time, whichever is first, then spend the remaining effort on the report.

## The report

Write `/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/ios-device-profile/.claude/research/2026-09-08-ipad-expo-opfs-swap-copies/overnight-cashier-report.md` (this path is in a different worktree; it is the one file outside `/tmp/overnight` you may write). Contents, in this order:

1. A ranked table of sluggish interactions: what the cashier did, tap-to-response time (median and worst over the night), how many times it was exercised, the probe-row stall that coincided (`maxMs`, bucket), and the busiest storage entry for that minute. Rank by worst tap-to-response.
2. The idle-cycle picture: for each 6-minute idle stretch, the rows during it and the first minute after resuming.
3. Every uncaught exception and console error captured, deduplicated, with counts, first-seen time, the symbolicated top frames, and what the cashier was doing when it fired. Call out anything mentioning a form.
4. Heap readings over the night (used/total, GC count, GC CPU) as a small table; say whether it grows monotonically.
5. Crash and CPU reports pulled from the device, if any, with the heaviest stack's app frames.
6. Exactly what tooling worked and what did not (Maestro version, physical-device support, anything you fell back to), with the commands, so the next run is faster.
7. Three recommendations, each tied to a numbered finding. No speculation beyond that.

Be precise and sparing with prose. Every number carries its time window. Do not quote `blockedMs`. Do not compare against a release build you never measured.
