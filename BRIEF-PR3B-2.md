# PR 3B, continuation — finish the app integration

Read `PR3B-STOP.md` and `PR3B-NOTES.md` (yours). **Scope permission granted: up to 700 changed
non-test source lines for PR 3B in total** (the 400 in AGENTS.md is the default for an unstated
budget; this brief states one). The two blockers you named are exactly the ones to finish; the
answers below are decisions, not questions.

**Do not push. Do not open or edit a PR.** No `git fetch`/`pull`/`rebase`. First commit the
uncommitted working tree as it stands (`feat(main): parked-tab screen and live-tab gate (WIP)`),
then work in small commits.

## 1. Payment holds — where the money actually is

Hold `holdLiveTab('payment')` across the AWAITED capture only, in the payment legs you found:
`packages/core/src/screens/main/pos/checkout/payments/server/server-leg.ts` and
`.../payments/device/device-leg.ts` — from the moment the request leaves until the response (or
failure) settles, released in `finally`. Not around preparation, idle UI, or the tender screen.
Manual tender (cash and other offline gateways) has no external capture: its "capture" is the
order save, which `bulkWrite` already holds as `'write'`; do not add a payment hold there. The
contract checkout path: hold only if it awaits an external capture; if it only saves, the write
hold covers it — state which in the notes. Import the hold through `@wcpos/database`'s public
index (the non-web implementation is the no-op you already exported). One test per leg: the hold
is taken before the awaited call and released after it settles, on success and on rejection.

## 2. Bounded teardown — reuse the disposal deadline

`closeRegisteredDatabases()` may wait on a wedged write. The existing primitive for exactly this
is `markStorageTerminallyFailed(databaseName, reason)` in `wrapped-error-handler-storage.ts`
(marks every instance of the database, rejects its in-flight calls, lets `close` resolve — the
host already uses it as a disposal deadline in `create-app-engine.ts`). In the gate's
`onHandover`: race `closeRegisteredDatabases()` against a timer of `HANDOVER_TEARDOWN_DEADLINE_MS`
(constant beside the protocol constants; 10 s — the same order as the existing storage write
deadline, and it starts only AFTER the takeover ceiling has already passed, so a wedged tab hands
over within ceiling + deadline); on expiry call `markStorageTerminallyFailed(name, 'live-tab handover')`
for every registered database, await the close again (it now resolves), then terminate the
worker and release the lock. A write of unknown outcome is resolved by the NEXT owner reading the
document back (the deadline policy's rule) — say so in the comment; never claim the write did not
commit. Test in `live-tab-gate.test.tsx` (or a database-package test if the teardown helper lives
there): a close that never resolves is bounded; the terminal-failure call is made for each
registered database; the lock is released after.

## 3. Gate lifecycle checks

- Electron and native resolve `live-tab-gate.tsx` (the passthrough); web resolves `.web.tsx`.
  Add a test that the non-web module renders children immediately with no `navigator.locks` access.
- Expo web static export pre-renders `_layout` on the server (no `navigator`): the web gate must
  treat "no `navigator.locks` object" during render as `live` without touching it, and create the
  live tab in an effect, not during render. Test it with `navigator` undefined.
- Repeated takeover/reload: after a former owner reacquires, it reloads (your probe's finding —
  premium's client keeps the terminated worker). Make that explicit in the gate with a comment
  citing the probe, and cover it in the E2E spec's third case (the reverse takeover ends with the
  former owner reloaded and live).

## 4. Rendering evidence for the parked screen

Extend `scripts/live-tab-probe.mjs` (or add `scripts/parked-tab-probe.mjs`) so a headless
Chromium page mounts the REAL `ParkedTab` component outside every provider — build a tiny page
with esbuild that imports the component through react-native-web, loads `apps/main/global.css`
(or the compiled CSS the web export produces; find what `apps/main` uses for Uniwind on web —
if the compiled CSS only exists after `expo export`, run the export once in the probe or document
the manual step) — and take screenshots of all six states in light and dark
(`page.emulateMedia({ colorScheme })`) at tablet (1024×768) and phone (390×844) widths into
`.scratch/parked-tab/` (gitignored — check `.gitignore`; if `.scratch` is not ignored, write to
`/tmp/claude-501/parked-tab/`). Assert the take-over button's bounding box height ≥ 44 CSS px and
that the title's computed colour differs from the background. If the real component cannot render
outside the providers, switch the component to the plain React Native precedent and say so.
List the screenshot paths in the notes; I will look at them.

## 5. Finish

Run, one at a time, `--maxWorkers=2`: database, main, `node --test scripts/*.test.mjs`,
`pnpm typecheck --force`, lint on changed files. For core, run ONLY the changed payment-leg test
files with `--runTestsByPath` (the full core suite OOMs at two workers here; say that). Then an
independent read-only review pass of the whole PR 3 diff (`codex review`-style: correctness of the
protocol, the teardown bound, the payment holds). Update `PR3B-NOTES.md` to the final state,
delete `PR3B-STOP.md`.
