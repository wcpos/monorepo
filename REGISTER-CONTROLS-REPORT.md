# Register controls report

## Result and scope

Observed: added `Chip`, `SegmentedControl` and `Keypad`, with 6/5/4 gallery stories, focused tests, seeded ledgers, alphabetical package exports and gallery registration. One local commit on `codex/register-controls`; no pull, fetch, branch switch, push or PR creation.

Added-line count from `git diff --cached --numstat`: **374 non-test code lines; 415 including the 41 ledger lines**, below the 390-code-line estimate and the task's 460-line cap. Tests and this explicitly requested report are excluded. No existing component or caller changed; no dependency, environment variable or allowlist addition.

Stakes: pos-ui / low. These primitives own no payment, persistence or entered-value state.

## Commands and observed results

All Jest invocations ran sequentially with `--maxWorkers=2`; focused component runs used `--coverage=false`. Exit statuses were checked, not inferred from pipelines.

| Command | Result |
| --- | --- |
| `git status --short`; `git branch --show-current`; `git rev-parse --git-dir --git-common-dir --show-superproject-working-tree` | PASS: existing linked worktree, `codex/register-controls`; initial untracked inputs were `REGISTER-CONTROLS-RUN.md` and `REGISTER-CONTROLS-TASK.md`. |
| `pnpm -C packages/components exec jest src/button src/toggle-group src/numpad --maxWorkers=2 --coverage=false` | PASS, exit 0: 3 suites / 50 tests, both before implementation and after it. |
| `pnpm -C packages/components exec jest src/chip src/segmented-control src/keypad --maxWorkers=2 --coverage=false` | Initial exit 1: three missing modules. Null implementation stubs then produced 22 failing tests. First implementation: 21 passed / 1 failed because this Jest lacks `toHaveBeenCalledExactlyOnceWith`; replaced that assertion with call-count and argument assertions. Subsequent and final runs PASS, exit 0: 3 suites / 22 tests. |
| `pnpm -C apps/main exec jest __tests__/gallery --maxWorkers=2` | PASS, exit 0: 2 suites / 2 tests; rerun after formatting. |
| `pnpm typecheck --force` | PASS, exit 0: 15 successful workspace tasks, 0 cached. |
| `node --test packages/eslint/tests/*.test.mjs` | PASS, exit 0: 135 tests, 9 suites, including the repository Uniwind ratchet. |
| `pnpm -C packages/components exec eslint src/chip src/segmented-control src/keypad --fix` | PASS, exit 0 on both formatting passes. |
| `pnpm -C packages/components exec eslint src/chip src/segmented-control src/keypad` | PASS, exit 0, no findings; final rerun also clean. |
| `pnpm -C packages/components run lint` | PASS, exit 0: 0 errors, 25 warnings, all in untouched files. |
| `pnpm -C apps/main run lint` | PASS, exit 0, no findings. |
| `pnpm exec eslint apps/main/__tests__/gallery-registry.test.tsx --fix` | PASS, exit 0. |
| `git diff --check`; `git diff --cached --check` | PASS, exit 0. |
| `git diff HEAD --exit-code -- packages/components/src/button packages/components/src/toggle-group packages/components/src/numpad packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx apps/main/global.css packages/eslint/uniwind-allowlist.json` | PASS, exit 0, no differences. |
| `git diff --cached --numstat` plus a Python sum excluding `.test.` paths, then excluding `.md` for code-only count | PASS: 415 non-test added lines / 374 code-only. |

Inspection used `cat`, `sed`, `rg`, `find`, `ls` and `wc -l` on the requested rules, skills, spec, sibling primitives, replaced controls, token sheet, icon names, registry, test harness, ratchet and commit hook. A guessed `.claude/rules/e2e*.mdc` glob and guessed `button/index.test.tsx` path did not exist; the actual rules and button tests were subsequently located/read or exercised. File edits used shell heredocs/Python and the package eslint formatter. No install command was run.

Existing tooling warnings: pnpm reports the installed workspace structure differs from the lockfile; ts-jest warns that its `isolatedModules` option is deprecated. Neither blocked validation.

## Mutation checks: red, then restored

Each mutation was applied in isolation by Python, its Jest process status captured, and the original source restored in `finally`.

1. Removed only the clear handler's `event?.stopPropagation?.()`.
   - Command: `pnpm -C packages/components exec jest src/chip --maxWorkers=2 --coverage=false --testNamePattern 'stops native clear propagation'`
   - Expected RED, observed exit 1: **1 failed, 9 skipped**; `Expected: true; Received: false` when clearing before propagation had stopped.
   - RNW itself stops click propagation. This test invokes Chip's actual captured handler with a native-like event; a separate real-RNW test verifies clear/label/outer-trigger behavior.
2. Removed the selected-value no-op (`next && next !== value` became `next`).
   - Command: `pnpm -C packages/components exec jest src/segmented-control --maxWorkers=2 --coverage=false --testNamePattern 'commits an unselected segment'`
   - Expected RED, observed exit 1: **1 failed, 6 skipped**; expected 0 callbacks, received 1 with `"a"`.
3. Made shrink unconditional (`fit === 'shrink'` became `true`).
   - Command: `pnpm -C packages/components exec jest src/keypad --maxWorkers=2 --coverage=false --testNamePattern 'fit defaults to tile'`
   - Expected RED, observed exit 1: **1 failed, 4 skipped**; expected class `h-tile`, received classes containing `min-h-ctl` instead.

After all restorations, the full three-control command above passed **22/22**. All mutations are absent from the delivered implementation.

## Shrink policy

Observed in source/tests: `tile` keys use `h-tile`. `shrink` gives the root `flex-1 min-h-0`, each row `flex-1 min-h-ctl`, and each stretched key `min-h-ctl`; rows retain `gap-2`. The row floor prevents a flex row collapsing below its key's floor. The caller supplies the available height; the gallery demonstrates this in an `h-56` box. `span: 2` uses `flex-[2]`. No pixel-height arithmetic, display state or focus management was added to Keypad.

Inferred: these classes let keypad rows share constrained height down to the control token while siblings retain their own sizing. Actual native/browser geometry was not measured.

## Review and unmet/deferred verification

- Read-only independent review, round 1: **PASS, no actionable findings; not over-scoped**. It changed 0 lines and created no artifacts.
- Not evaluated: native-device interaction, physical touch-target measurements, visual contrast, phone/tablet captures and gallery baseline images. Jest tests inspect token classes and RNW behavior, not rendered CSS geometry.
- The spec's PR label, bot approval, baseline update job and final read-only gallery shoot were **not performed**, because the run explicitly requires a local-only commit and no push. No existing baseline file changed locally. CI image equivalence is unverified.
- No implementation requirement was intentionally dropped. Accepted caller contract: controlled segmented values identify an enabled, nonempty segment and segment values are unique; no runtime input-validation/fallback layer was introduced.

## Behavior changes / regressions

- New standalone controls and gallery entries only. No merchant caller has switched to them.
- Chip deliberately uses the full `h-ctl` token, not the prototype's eight-pixel inset; its count is inline rather than the existing Badge. Both are specified decisions.
- Segment keyboard selection commits immediately and never toggles the current selection off. Keypad shrink stops at the control token, not the tile token, as specified.
- Existing controls were run against the same 50-test suite before and after and their source is unchanged. This is not a claim of broad compatibility between old and new APIs, nor of performance improvement.

## Artifacts and delivery

- Report: `REGISTER-CONTROLS-REPORT.md` (this file).
- Each of `packages/components/src/chip/`, `packages/components/src/segmented-control/`, and `packages/components/src/keypad/` contains `index.tsx`, `index.test.tsx`, `gallery.tsx`, and `LEDGER.md`.
- Integration edits: `packages/components/package.json`, `apps/main/components/gallery/registry.tsx`, `apps/main/__tests__/gallery-registry.test.tsx`.
- Local commit command: `git commit -m "feat(components): chip, segmented-control and keypad, the register's controls, with gallery cells and seeded ledgers (roadmap#360)"`.
- The supplied run/spec files remain untracked and are not included in the commit. No screenshots or external artifacts were created.
