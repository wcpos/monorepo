# Native E2E (Maestro) playbook

The rules in this file were paid for. Between 2026-08-28 and 2026-09-04 the
native suite went from "has never passed" to two consecutive fully green
four-device runs on `main`, through roughly twenty-five pull requests, one
paid diagnostic build, and several nights. Each rule below names the failure
that produced it, so you can judge whether it still applies rather than obey
it blindly. When you remove a guard, expect the failure it names to come back.

Green baseline (compare any red against it):

| Lane           | Whole job | Flow 01 | Other flows  |
| -------------- | --------- | ------- | ------------ |
| iOS phone      | 35–45 min | 4–8 min | 15 s – 4 min |
| iPad           | 35–45 min | 4–8 min | 15 s – 4 min |
| Android phone  | 35–45 min | ~2 min  | 15 s – 4 min |
| Android tablet | 35–45 min | ~2 min  | 15 s – 4 min |

Reference runs: 33821073731 and 33826506217 (2026-09-04, 36/36 flows each,
zero recovery-guard log lines). A flow that takes ten minutes is not slow, it
is broken, whatever its verdict says.

## 1. What runs, and what it costs

- The job installs the **development-profile dev client** (the build
  developers use) and serves the JS from **Metro on the runner**, bundling the
  checked-out revision with `--no-dev --minify`. The dev client contains no
  JS, so **JS-only changes never need a build**.
- A build is spent when `npx @expo/fingerprint` moves: native deps, config
  plugins, app config, native code, and **`package.json` scripts** (they are
  in the fingerprint; a throwaway script costs a build). A push to `main` also
  builds when the cached dev client has been **evicted** and no recent `main`
  run's artifact holds it (§5, Cache); that path exists so `main` never goes
  untested, and it is the one that spent $6 on 2026-09-03. Builds are metered:
  $2 iOS, $1 Android, against a $45/month credit shared with release builds.
  PR builds and unapproved dispatches are refused at a monthly ceiling of 20;
  `main` is exempt.
- **Never dispatch `e2e-native.yml` with `build=true` without asking the
  owner.** A plain dispatch defaults to `build=false` and fails fast on a
  cache miss. When a native change genuinely needs a build, pass a single
  `platform=`.
- PRs that touch native-E2E inputs run **phones only**; pushes to `main` and
  `workflow_dispatch` run all four devices (a dispatch can be narrowed with
  `platform=`). A tablet fix is proven by its merge run, not its PR run.
- A red run on a push to `main` opens (or refreshes) a `ci:main-native-red`
  issue carrying the per-platform results. It closes itself only on a run
  where both platforms passed, and a rerun of an older push never moves it.
  The web suite's equivalent is `ci:main-red` from `deploy.yml`.
- PRs whose base is `next` skip the native suite by ruling (2026-09-03).
- Red native checks on a PR that is not itself native-E2E work do not block a
  merge (owner ruling, 2026-09-03). Native-E2E PRs merge on evidence.

## 2. Run it locally first

```bash
scripts/e2e-native-local.sh --platform ios            # phone, flows 01–09, records screen.mp4
scripts/e2e-native-local.sh --platform ios --device tablet
scripts/e2e-native-local.sh --platform android --flow apps/main/.maestro/flows/07-variation-add-to-cart.yml
```

A local iOS run of the suite takes about ten minutes; the CI round trip is an
hour. Diagnose locally, confirm in CI. Flows 04 and 06 sell the seeded
`WCPOS E2E Simple` product and flow 07 the seeded variable product
(`VARIABLE_PRODUCT_*`); `scripts/e2e-native-seed.mjs` creates or repairs both
and needs `E2E_PRODUCT_WRITER_USER` / `_PASS`. Without the credentials the
seed stops after the reachability check, the run warns, and those three flows
fail on missing data, which says nothing about the product. One Metro per
machine on port 8081; never share a simulator between two runs.

Some failures **cannot** reproduce locally because their ingredient is the
starved three-core CI runner (the dropped `openLink` after `clearState`, lost
presses inside React Native, the WebKit payment-frame stall). If it does not
reproduce locally, that is the finding: read the runner's differences, not the
app's code.

## 3. Rules for writing and changing flows

1. **Every file starts with the config section**, subflows included. Without
   it batch mode aborts before the first flow with "Config Section Required"
   and no verdict at all (run 33627088324).
2. **Select app-owned UI by `testID` only**, never by localized text. The
   exceptions are surfaces the app cannot label: the iOS deep-link
   confirmation ("Open in WCPOS" / "Open"), the sign-in consent alert
   ("Continue"), and the Android ANR dialog ("Wait"). Each such selector
   carries a comment saying whose UI it is. The lint
   `pnpm --filter @wcpos/main test:e2e:native:check` verifies that every id a
   flow references exists in the app source, and resolves ids written as
   `${VAR}` through every `VAR: value` assignment in the flows.
3. **Every POS flow (04–09) ends on the POS products screen with
   `search-products` visible**, established by `subflows/ensure-pos-ready.yml`,
   so the next flow starts from a known state. The onboarding flows are the
   exception by design: 01 ends on `store-url-input` for 02 to continue, and
   02/03 end by asserting it is gone. Flows 03 and 09 relaunch the app **as
   the behaviour under test**; apart from those, the healthy path performs
   **zero relaunches**. Any other relaunch is recovery, and every recovery
   logs a `WCPOS_E2E …` line so the run's artifacts can count it.
4. **Use the subflows; do not paste their bodies into a flow.** Four inline
   copies of the relaunch and three of the drawer guard each carried their own
   bug (tablet rail, cold-start crash) after the shared copy was fixed.
   - `open-drawer.yml` brings the navigation items on screen on both device
     classes.
   - `relaunch-app.yml` cold-starts the app and waits for `READY_ID`.
   - `relaunch-to-pos.yml` is the same with `READY_ID: search-products`.
   - `ensure-pos-ready.yml` is the end-of-flow invariant.
5. **Two device classes, two layouts.** Phones have a hamburger drawer and a
   scrollable tab strip. Tablets have a **permanent rail**, marked
   `drawer-panel-permanent`, that never closes: a guard that waits for the
   drawer to disappear waits forever on a tablet (Android tablet flow 04 died
   at 19 s, run 33750030091). A tab can be **off the visible strip** after the
   list grows (flow 08's new-order tab after a void): step with
   `scrollable-tabs-next` instead of assuming it is on screen.
6. **Never assert a state a one-shot look can miss.** Async overlays (the
   sign-in consent alert, the login prompt, a popover closing) can appear
   seconds after the step that causes them. The shape that works is: an
   optional `extendedWaitUntil` for _either_ outcome, then `runFlow when:`
   branches for each. Flow 02 and `ensure-pos-ready.yml` are the models.
7. **Retries are counted, logged, and bounded.**
   - Maestro's `retry` executes `maxRetries + 1` times. State the intended
     number of executions in the comment and multiply the block's worst-case
     waits by it against the per-flow budget (iOS flows run under a 20-minute
     deadline). The flow 01/02 launch wrapper is pinned at one retry by
     `scripts/ci-workflows.test.mjs`.
   - Every **conditional recovery guard** (a `runFlow when:` branch that
     re-taps, re-submits or relaunches) logs
     `WCPOS_E2E <what happened, what is being done>` through `evalScript`.
     The rate of those lines across runs is the evidence for deciding whether
     the class is worth an app fix; a guard that does not log hides the defect
     it papers over. Maestro's own `retry` blocks (the launch wrappers in 01/02,
     the search-input retries in 04/06/07) do **not** log per attempt: count
     their attempts from the `RUNNING`/`FAILED` cycles in `maestro.log`.
   - An unquoted `:` followed by a space inside a plain YAML scalar (typically
     that log string)
     breaks the flow parse, and the parse failure is invisible if you filtered
     the run's output. Quote the string.
8. **A harness retry is for the runner, an app fix is for the app.** Add a
   retry only when the evidence shows the event was delivered (UIKit
   `Sending UIEvent` pairs in `app-console.log`, or a tap that Maestro reports
   `COMPLETED`) and the UI did not react on the starved runner. When the app
   is wrong, fix the app and cover it with a unit test:
   - tab strip did not re-centre the active tab on content change (#1814)
   - quantity input appended instead of replacing on iPad (`selectTextOnFocus`)
   - popover Add button accepted a second press during a slow write (#1832)
   - payment frame had no exit from `loading` when WebKit stalled (#1820)
9. **Keyboard.** `hideKeyboard` is flaky on iOS, so it is `optional` and never
   the thing a step depends on. A tap under the keyboard silently no-ops. On
   iOS, verify dismissal with `notVisible … focused: true` and submit again if
   the field is still focused (`ensure-pos-ready.yml`). On Android a view's
   focus outlives the keyboard, so that check is iOS-only.
10. **Relaunch by platform.** iOS relaunches with `launchApp`. **Android
    relaunches with `openLink` to the dev-client URL** because Maestro's
    `launchApp` re-grants every manifest permission through `pm grant` first
    and the emulator's package manager can hang on one call for 47 minutes
    while the flow still reports `[Passed]` (run 33808415134). `relaunch-app.yml`
    encodes this; do not call `launchApp` on Android elsewhere.
11. **Flow 01/02 wrap `openLink` in a retry.** After `clearState` reinstalls
    the app, a link issued before the OS has registered the install is dropped
    with exit 0 or throws a timeout. Seen on both platforms; it cannot
    reproduce locally (a local reinstall takes 0.4 s).
12. **Waits reflect a physical expectation, not a past guess.** A cashier sees
    search results in about a second. The workflow's timing triage labels a
    flow over 600 s `STARVED` and **fails** the job over 1200 s `ABSURD`, even
    when every flow passed. Do not weaken that gate back to a warning; a
    warning is what let a 45-minute "pass" through.
13. **Seeded data.** `scripts/e2e-native-seed.mjs` creates the variable
    product flow 07 uses. Reads retry through a store blip (six attempts, ten
    seconds apart, `scripts/store-transient-retry.mjs`); **writes never
    retry**. It sends credentials only to the dev stores over https.
14. **Adding a native input to the plan.** If a PR touches a path that changes
    the fingerprint and the workflow did not expect a build, add the path to
    the native-config rule in `scripts/ci-plan.mjs`. The warning in the resolve
    job names this case.

## 4. Reading a red run

Reading order:

1. The app's own errors, already captured: the job summary's "App errors
   logged during this run", the `::warning::` annotations, and the
   `app-errors-*` artifact. A red overlay, a 502 from the store, or a sync
   failure is named here before any flow evidence is.
2. The verdict line and its duration, against the baseline above.
3. The ❌ screenshot.
4. The gap in `maestro.log` (`grep RUNNING$`).
5. `logcat.txt` for `Fatal signal`, or the store's nginx log for the request
   that never arrived.

**The verdict names the element Maestro could not find. It never names why**,
and the two are routinely unrelated: the canonical
`search-products is visible FAILED` has meant a red overlay over a working
app, a dead process, a permanent rail, and a keyboard.

On Android, grep `logcat.txt` for
`WCPOS_E2E_ENGINE`: the sync engine emits one JSON line per event under
`EXPO_PUBLIC_WCPOS_E2E=1`, and it is the only detailed Android evidence there
is under `--no-dev --minify`.

Known classes, by what the screenshot shows:

| Screenshot / verdict                                                                                                                     | Class                                                                                                               | Handled by                                                                                                                    | Do not                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Android launcher home screen ~50 s after a relaunch; logcat `Fatal signal 11 … mqt_v_js`, `MountingCoordinator::pullTransaction`         | #1661 cold-start SIGSEGV in react-native-screens' mounting delegate (~1 in 12 cold starts). Native bug, still open. | `relaunch-app.yml` relaunches once and logs `cold start never reached …`                                                      | raise the readiness wait; blame the flow                         |
| Android flow `[Passed]` at 45–55 min, job red on the timing gate; `maestro.log` gap after `Launch app … RUNNING` with a `pm grant` stack | Maestro `launchApp` permission pass hung in the emulator's package manager                                          | Android relaunches via `openLink` (#1840)                                                                                     | read it as a slow device                                         |
| iOS flow 04, pay dialog with an empty body, `process-payment-button` never enabled; store nginx shows the order-pay GET late or absent   | WKWebView on the simulator stalls before the request leaves the process                                             | 90 s watchdog, one silent remount, then a Retry button flow 04 presses (#1820)                                                | raise the 180 s wait; touch the store                            |
| Full-screen red/black overlay with Dismiss / Reload / Copy buttons; `Element not found` on ids that were just visible                    | expo-dev-launcher draws its own overlay on any `console.error`, regardless of `--no-dev`                            | Logger routes error-level output to `console.warn` under `EXPO_PUBLIC_WCPOS_E2E=1`; the report step still captures it (#1840) | try to silence LogBox; debug selectors                           |
| OS home screen during flow 01/02 after `clearState`                                                                                      | `openLink` dropped or timed out while the reinstall was still registering                                           | Flow 01/02 retry wrapper (#1728)                                                                                              | reproduce locally and conclude it is fixed                       |
| Android flow 02 "Site does not seem to be a WordPress site", "!" on wifi and cellular icons; logcat `PROBE_DNS … FAIL`                   | Emulator booted without DNS                                                                                         | `-dns-server 8.8.8.8,1.1.1.1` plus a validated-internet guard before `adb reverse` (#1718)                                    | touch the store or the flow                                      |
| Seed step or flow 02 `add-user-button` timeout; store answers slowly or with a 200 that has no form fields                               | Dev store saturated or mid-redeploy                                                                                 | 16 php-fpm workers on dev-free/dev-pro (see §5); seed reads retry (#1810)                                                     | run fewer tests (ruled out 2026-09-01)                           |
| Android tablet flow 04/05 `drawer-item-pos is not visible` within seconds                                                                | Guard waited for a permanent rail to close                                                                          | `drawer-panel-permanent` marker; `open-drawer.yml` (#1814, #1827)                                                             | add a longer wait                                                |
| Flow 08 `new-order-tab` not visible after a void                                                                                         | Tab off the scrolled strip; the strip did not re-centre                                                             | App fix in the tabs component plus `scrollable-tabs-next` steps (#1814)                                                       |                                                                  |
| Flow 07 popover still open after Add; cart holds only flow 06's line                                                                     | Add press lost inside RN on the starved runner                                                                      | Logged re-tap after 10 s (#1832); app-side pending guard                                                                      | double the wait                                                  |
| Flow 06 `cart-quantity-input` reads "3" but the assert fails on iPad                                                                     | Value is `3331`: the tap landed left of the digit, `eraseText` deleted nothing                                      | `selectTextOnFocus` on the native number input                                                                                | trust a screenshot of a narrow field; read the hierarchy         |
| iOS flow 08 keyboard up over the tab bar; taps hit keys                                                                                  | Search-clear refocus vs Enter race                                                                                  | Focus-verified dismissal, iOS-only (#1833)                                                                                    |                                                                  |
| iPad flow 02 consent alert already up after the URL was typed                                                                            | App reached sign-in without the flow's Connect/Add-user taps (trigger not established)                              | Flow 02 logs, skips those taps, and falls into the consent handling (#1841)                                                   |                                                                  |
| Android tablet flow 09, cold start shows the default ~60% split; post-relaunch band assert fails                                         | The relaunch killed the process ~300 ms after the swipe, before the single async RxState width write landed         | 3 s write settle before the relaunch in flow 09 (the write has no UI observable)                                              | read it as a persistence bug; the app has no debounce to shorten |
| iOS "Application is not running" ~200 ms after launch                                                                                    | XCTest driver queried before scene activation; not a crash                                                          | Split stop/launch and a settle in `relaunch-app.yml`                                                                          | read it as a crash                                               |

When a red matches none of these, the thing to produce is a new row: the
signature, the mechanism with the evidence that established it, and where the
handling lives. A fix without a row is a fix nobody can recognise next time.

## 5. Environment facts that decide whether a red is yours

- **Dev stores.** The suite runs against dev-pro (and dev-free for the web
  suite). Both run **16 php-fpm workers** from `php/php-fpm-ondemand.conf` in
  the `wcpos-wordpress` repo. **Editing the file on the box does nothing
  durable**: every push to that repo redeploys all four sites, and dev-next's
  config-sync copies the repo's confs into the shared config volume, silently
  reverting box edits (two earlier bumps died that way before anyone noticed).
  Change the repo, merge, then restart the php containers; php-fpm reads its
  config at container start. Every merge there also recreates the containers,
  so a suite running at that moment sees a ~30 s blip.
- dev-next has its own worker ceiling under a separate ruling; the 16-worker
  ruling does not cover it.
- `ssh wcpos-prod` works only while the owner's machine is unlocked (the key
  lives in a 1Password agent). Overnight, the box is unreachable, which reads
  as an outage. Probe the store from outside before concluding anything.
- **Android emulators run 3 guest cores, 4 GB guest RAM (the profile default
  is 2 GB), a 576 MB VM heap, from a cached AVD quickboot snapshot.** Four
  cores produced a pathological input crawl (a flow at 42 min with 25-minute
  gaps between single keystrokes): the 16 GB runner also hosts Metro, the
  Maestro JVM, logcat and screen recording, and they need a core. Every
  AVD-shaping value is part of the snapshot cache key and pinned by
  `scripts/ci-workflows.test.mjs`; change them together, and delete stale AVD
  cache entries when you do (a dead entry is ~2 GB and evicts the dev client).
- iOS runs each flow under a 20-minute deadline; Android runs the whole suite
  in one Maestro process, so nothing kills a hung command mid-flow. A command
  that eventually returns produces a `[Passed]` at 45+ minutes that the timing
  gate fails afterwards; a command that never returns is killed by the suite
  step's 90-minute timeout, and the flow it was in has no verdict line at all.
- **Cache.** The dev client is keyed by fingerprint and platform in the
  repo's 10 GB LRU Actions cache. The turbo cache is saved once per OS per UTC
  day by `deploy.yml` on `main` only; PRs restore read-only. Before that
  change, a 360 MB turbo entry per commit evicted the dev client twice in one
  evening and the spend guard refused every PR run. If the cache is evicted,
  the resolve job recovers the build from the last ten `main` runs' stamped
  `e2e-builds` artifacts before it considers spending.

## 6. Tripwires

Run these before pushing anything under `apps/main/.maestro/**` or the
workflow. They exist because each caught a real regression.

```bash
pnpm --filter @wcpos/main test:e2e:native:check      # every testID a flow uses exists in the app
node --test scripts/maestro-search-input.test.mjs    # search-input retry shape per flow
node --test scripts/ci-workflows.test.mjs            # workflow structure: gates, retry counts, routing, cache split, recovery
pnpm test:scripts                                    # runs all of the above plus the other repo checks
```

`scripts/ci-workflows.test.mjs` runs the workflow's shell steps against fake
inputs (a fake `gh`, failing verdict files). When you change a step, change or
add its case in the same PR.

## 7. Still open

- **#1661**: the Android cold-start crash is a refcount fault in
  react-native-screens' `RNSScreenRemovalListener` (4.26.2 on RN 0.86.2). The
  relaunch hides it; the decisive test is a build without the delegate
  registration, or a screens bump, judged over many launches.
- The WebKit payment-frame stall's cause on the simulator is unknown; the
  watchdog only bounds it. Grep an iOS lane's app log for
  `Payment form did not load in time` to measure its rate.
- Retry-rate greps to run now and then across `main` runs (**in the
  `maestro-*` artifacts' `maestro.log`, not the job log**: `evalScript` output
  and the app's console never reach the job log, so a job-log grep reads zero
  for everything):
  `cold start never reached`, `tap did not close the popover`,
  `still focused after Enter`, `consent alert already up`. When a rate climbs,
  the class has changed and the row above is stale. Beware: `maestro.log`
  repeats each retry block's command metadata on every evaluation, so grep for
  the output form of the line, not bare `WCPOS_E2E`.
