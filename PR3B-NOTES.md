# PR 3B — app integration

## Status and scope

Implementation and verification finished; independent review status is recorded below.
High stakes: sync-storage / checkout-money. Premature handover can affect persisted data or money.
The continuation brief authorizes 700 changed non-test source lines total. Conservative count:
**599 additions + deletions** against `a98d278981e7`, including platform files; excludes
probes/tests, generated worker, lockfile, and reports. The continuation adds 202 versus the
397-line stop. No new recovery subsystem, retries, flags, dependencies, or environment variables.

No fetch/pull/rebase, push, PR edits, deployment, sync-engine/sync-core/schema changes.
The requested initial WIP commit is `3d13716ae`; it preserved the entire starting working tree,
including staged briefs. Capture integration is `76fadf254`; lifecycle/teardown is `7bced5b51`. Earlier PR3 commits are `226cc6373` (pool growth) and `58ba03e7b` (protocol).

## Changes by file / behavior

- `scripts/sqlite-worker-entry.mjs`, database `adapters/storage/sqlite-pool.ts`, generated
  `apps/main/public/sqlite.worker.js`: initial pool capacity 22, growth by 16 before opens.
  Existing pools retain their capacity; the earlier probe failed with fixed capacity and passed
  after growth. No performance improvement is claimed.
- Database `live-tab/live-tab.web.ts`: origin-scoped exclusive Web Lock, cooperative
  request/ack/release, payment/write holds, 15-second defer ceiling, 3-second no-answer state,
  worker-loss parking, disposal. Replacement holds are rechecked after each release without
  resetting the ceiling (including collection immediately starting capture).
- Database `live-tab/index{,.web,.electron}.ts`, public `index.ts`: platform-neutral hold export;
  Electron/native holds are no-ops. Electron needs its explicit override because Metro exports
  its renderer with the web platform.
- Database `plugins/wrapped-error-handler-storage.ts`, `adapters/default/index.web.ts`:
  write holds cover wrapped bulkWrite through settlement; no extra manual-tender hold.
- Core `payments/server/server-leg.ts`, `payments/device/device-leg.ts`: payment holds cover
  awaited capture POSTs, released in finally. Device `driver.collect()` also has a hold because
  its result can already be `captured`; intent preparation and idle tender UI have none.
- Core `checkout/hooks/use-checkout-session.ts`: **contract checkout DOES await an external
  capture**, `orders/{id}/checkout`. Only that POST is held, not bootstrap, preparation,
  polling, or completion writes. Manual/offline gateway order saves use the existing write hold.
- Core `services/terminal-payments/service.ts`: background settlement of recorded-offline
  authorizations posts an external capture too. It is reachable on web from persisted rows
  without a device driver, so the same narrow hold protects that await.
- `apps/main/components/live-tab-gate.web.tsx`: singleton creation happens in an effect;
  no-locks/SSR render is live without starting the protocol. Browser hydration remains acquiring
  until ownership. Live children unmount synchronously before teardown. Former owners reload
  after reacquiring: the real worker probe found premium retains the terminated worker.
- `live-tab-gate.tsx` and `.electron.tsx`: provider-free passthroughs; platform unit cases
  render immediately even when reading navigator throws.
- Gate teardown starts engine disposal and registered-database close together, retaining the
  original close promises. After the existing hold ceiling, a separate 10-second deadline
  terminally fails every still-registered database, awaits the closes, then terminates the
  worker before the protocol releases the lock. This reuses the disposal primitive.
  **A timed-out write may have committed. The next owner must read the document back.**
- Database `plugins/rx-database-registry.ts`: expose current names for terminal failure;
  keep the existing close loop. `adapters/storage/index.web.ts`: worker termination is permanent
  for the page, rejecting late hydration opens even if no worker existed yet. This permits
  removing the WIP's `finishPendingHydration` wait: unrelated HTTP probes cannot delay handover,
  and cannot reopen the old pool afterward. Recovery remains reload-only.
- `apps/main/app/_layout.tsx`: merchant gate precedes startup clearing/hydration.
  `lib/create-app-engine.ts`: exposes the existing cached-engine disposal.
- `parked-tab.tsx`: unchanged real EmptyState/Button components, semantic tokens and specified
  provider-free English copy. No plain-React-Native fallback was needed.
- `apps/main/e2e/live-tab.spec.ts`: same-context tabs, write deferral, frozen owner; third case
  reverses takeover and explicitly observes document reload before the former owner is live.
  Authenticated live-store execution is deferred to the owner, as the original brief instructs.
- `scripts/parked-tab-probe.mjs`: bundles REAL ParkedTab with RNW/Uniwind web bindings and
  compiles `apps/main/global.css` through the installed Uniwind Metro compile/scan/CSS visitor
  pipeline. No provider/UI mocks, no handwritten substitute CSS, no Expo export prerequisite.
  Generated CSS, HTML, JS and types are colocated with screenshots outside the repository.

## Verification — Observed

All commands below are run from the repository root. Jest commands omit the extra `--`,
which this repository passes through as a filename pattern. Suites ran sequentially with
`--maxWorkers=2`; core was limited to changed capture-path test files, never the full suite.
The previous full core run exhausted worker heaps at two workers; no full-core passing claim.

| Command / check | Result |
| --- | --- |
| `pnpm --filter @wcpos/database test --maxWorkers=2` | PASS: 49 suites, 607 tests; 1 suite/1 test skipped. |
| `pnpm --filter @wcpos/main test --maxWorkers=2` | PASS: 41 suites, 528 tests. Existing worker-exit warning remains. |
| `pnpm --filter @wcpos/core test --maxWorkers=2 --coverage=false --runTestsByPath src/screens/main/pos/checkout/payments/server/server-leg.test.ts src/screens/main/pos/checkout/payments/device/device-leg.test.ts src/screens/main/pos/checkout/hooks/use-checkout-session.test.ts src/services/terminal-payments/service.test.ts` | PASS: 4 suites, 140 tests. Hook/background files are included because they also contain changed capture awaits; no unrelated core tests. Existing React act warnings in hook tests remain. |
| `node --test scripts/*.test.mjs` | PASS: 926 tests. |
| `pnpm typecheck --force` | PASS: 15/15 tasks, none cached. |
| `git diff --check -- . ':!apps/main/public/sqlite.worker.js'` | PASS. Generated vendor worker is excluded from whitespace checking. |
| Explicit ESLint on every source/test/probe file in the whole PR3 diff | PASS, exit 0; `/tmp/claude-501/pr3b-whole-diff-lint.log`. |
| `pnpm --filter @wcpos/database lint` | PASS; existing type-definition warnings. |
| `pnpm --filter @wcpos/main lint` | PASS. |
| `pnpm --filter @wcpos/core lint` | PASS: zero errors, 125 existing warnings. |
| `node scripts/live-tab-probe.mjs` | PASS: first live/second parked with zero opens; payment deferral; write ceiling/reverse ownership; frozen-holder close grants ownership, no pool contention. Protocol + real worker, not full app. |
| `node scripts/parked-tab-probe.mjs` | PASS: 24 provider-free states; 48px action heights; title/background colours differ. Title contrast 16.13:1 light / 15.11:1 dark (sRGB canvas measurement). |

Logs: `/tmp/claude-501/pr3b-{database,main,core,scripts,typecheck}-final.log`,
`/tmp/claude-501/pr3b-{database,main,core}-lint.log`, `/tmp/claude-501/pr3b-format.log`,
`/tmp/claude-501/pr3b-{live-probe-final,parked-probe}.log`.

### Regression / mutation evidence

- Payment legs: 4 new hold cases failed first (68 existing passed); green afterward.
  Contract capture: 2 new cases failed, then passed. Background capture: 2 failed, then passed.
  Reader rejection also releases its collection hold.
- Gate: missing navigator/render side effects and unbounded close failed before correction.
  Final teardown test drives the real protocol with controlled storage: both registered names
  are terminally failed, worker terminates, then the real lock callback completes. Pending
  hydration is not awaited. Reacquisition triggers reload without mounting retired children.
- Worker-retirement and replacement-hold tests failed before the respective fixes.
  One exploratory test queued capture AFTER handover had already parked; corrected it to queue
  capture before the handover continuation, the actual race the test must protect.
- SSR mutation: replacing the browser hydration snapshot with unconditional LIVE makes the
  real web-module render test fail (exit 1), then restoring the gate passes.
  Log: `/tmp/claude-501/pr3b-ssr-mutation.log`.
- Final ack-before-teardown mutation: moving ack after starting handover failed the ordering test (exit 1), then the restored protocol passed all 12 tests. Logs: `/tmp/claude-501/pr3b-ack-mutation.log`, `/tmp/claude-501/pr3b-protocol-restored.log`.

## Independent read-only review

Round 1 reviewed the whole PR3 diff against `a98d278981e7` and found browser-hydration bypass,
release/rehold race, hydration exceeding teardown deadline, and background capture missing a hold.
All four are addressed above with regression coverage. **Round 2 code verdict: CLEAN** (read-only source-review inference, not independently rerun runtime verification). Doc-logic review found one non-blocking measurement-timing contradiction; the evidence limitation below corrects that claim. Review stopped after two rounds.

## Rendering artifacts

`.scratch/parked-tab/` is not gitignored, so the specified fallback directory is used:
`/tmp/claude-501/parked-tab/`. Reproduce with `node scripts/parked-tab-probe.mjs`.
`measurements.json` records action heights and sampled colours/contrast. **Accepted probe timing limitation:** the first colour sample after a media switch can precede the theme update. Specifically `tablet-dark-parked`, `phone-light-parked`, and `phone-dark-parked` contain the previous theme's colours/contrast. The screenshots are taken later and show the requested theme; the reviewer independently inspected the first two. Do not treat those three JSON colour samples as matching their screenshots. The 48px heights and title/background difference assertions still hold.
`probe.html`, `probe.js`, `global.css`, `uniwind.css`, `uniwind-types.d.ts` are the reproducible
local harness artifacts. No screenshot/artifact is committed into the repository.

- `/tmp/claude-501/parked-tab/tablet-light-parked.png`
- `/tmp/claude-501/parked-tab/tablet-light-waiting.png`
- `/tmp/claude-501/parked-tab/tablet-light-payment.png`
- `/tmp/claude-501/parked-tab/tablet-light-write.png`
- `/tmp/claude-501/parked-tab/tablet-light-no-answer.png`
- `/tmp/claude-501/parked-tab/tablet-light-lost.png`
- `/tmp/claude-501/parked-tab/tablet-dark-parked.png`
- `/tmp/claude-501/parked-tab/tablet-dark-waiting.png`
- `/tmp/claude-501/parked-tab/tablet-dark-payment.png`
- `/tmp/claude-501/parked-tab/tablet-dark-write.png`
- `/tmp/claude-501/parked-tab/tablet-dark-no-answer.png`
- `/tmp/claude-501/parked-tab/tablet-dark-lost.png`
- `/tmp/claude-501/parked-tab/phone-light-parked.png`
- `/tmp/claude-501/parked-tab/phone-light-waiting.png`
- `/tmp/claude-501/parked-tab/phone-light-payment.png`
- `/tmp/claude-501/parked-tab/phone-light-write.png`
- `/tmp/claude-501/parked-tab/phone-light-no-answer.png`
- `/tmp/claude-501/parked-tab/phone-light-lost.png`
- `/tmp/claude-501/parked-tab/phone-dark-parked.png`
- `/tmp/claude-501/parked-tab/phone-dark-waiting.png`
- `/tmp/claude-501/parked-tab/phone-dark-payment.png`
- `/tmp/claude-501/parked-tab/phone-dark-write.png`
- `/tmp/claude-501/parked-tab/phone-dark-no-answer.png`
- `/tmp/claude-501/parked-tab/phone-dark-lost.png`

## Exact copy

| State | Title | Description | Action |
| --- | --- | --- | --- |
| another-tab-live | The POS is open in another tab | Only one tab can run the register. | Take over here |
| taking-over: null | Taking over… | Waiting for the other tab to hand over. | Take over here (disabled) |
| taking-over: payment | Taking over… | Waiting for the other tab to finish a payment. | Take over here (disabled) |
| taking-over: write | Taking over… | Waiting for the other tab to finish saving. | Take over here (disabled) |
| taking-over: no-answer | The other tab isn't answering | Close it, or reload it, to continue here. | Take over here (disabled) |
| worker-lost | Local database unavailable | Reload to keep selling. | Reload the app |


## Behavior changes / regressions

- Observed in tests/probes: one merchant web tab per origin; other tabs park. Takeover closes
  the predecessor and former owners reload on reacquisition instead of reopening cached workers.
- Observed: awaited external captures and writes defer takeover up to the existing 15-second
  ceiling. A wedged close is terminally failed at the additional 10-second teardown deadline.
  Unknown write/capture outcomes are not reported as “did not commit”.
- Observed: worker termination rejects subsequent opens until reload. This intentionally
  replaces the possibility of a late hydration reopening or hanging on a retired worker.
- Observed: new pools start at 22 handles and grow by 16 instead of using a fixed initial 64.
  No old/new app compatibility or performance claim is made.
- Not evaluated: real reader/payment processing, authenticated live-store E2E, full Expo static
  export, packaged Electron/native runtime, WebKit, CDN deployment, crash durability, or broad
  old/new application equivalence. Unit platform cases are not packaged-platform verification.
- Accepted limitation: timer-based deadlines cannot run while a browser freezes a tab. The
  no-answer state asks the user to close/reload that holder; real Chromium close recovery passes.
- Known non-blocking evidence limitation: the three theme-switch colour samples described above lag their screenshots; no production change was made for this stale-read-only probe issue.
- Known non-blocking validation noise: existing main Jest worker-exit warning, core hook act
  warnings and existing package lint warnings. No unrelated cleanup attempted.
