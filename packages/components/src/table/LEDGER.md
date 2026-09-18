# Behaviour ledger: `table`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Styled table primitives with alternating rows and an imperative add/remove-feedback row.

**Base:** `@rn-primitives/table`, `@rn-primitives/slot`, `react-native`, `react-native-reanimated`, `react-native-worklets`, and `uniwind`; TanStack imports supply types. No split; shared files contain `web:` styling modifiers.

## Lines

1. Uses column-oriented cell layout to contain overflowing children — evidence: code: "We wrap the children on flex-col shrink to stop it from overflowing the cell" in `packages/components/src/table/index.tsx:102`, code: "`flex-1 flex-col justify-center`" in `packages/components/src/table/index.tsx:107`.
2. Excludes table-model objects from props forwarded to the rendered animated view — evidence: `1c62df7c8c 2026-04-04 fix(pulse-row): stop forwarding row/table props and make ref compatible with View contract`, PR/issue #277, code: "`{...viewProps}`" in `packages/components/src/table/pulse-row.tsx:158`.
3. Dispatches animation-completion callbacks through `scheduleOnRN` instead of deprecated `runOnJS` — evidence: `65e0cc3cc7 2026-01-23 fix: bypass TanStack Table minification bug and migrate to scheduleOnRN`, code: "`scheduleOnRN(callback);`" in `packages/components/src/table/pulse-row.tsx:128`.
4. Omits the redundant row-index dependency from pulse base-colour resynchronisation — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "`}, [baseColor, backgroundColor]);`" in `packages/components/src/table/pulse-row.tsx:71`.
5. Removes CSS colour transitions from animated rows to avoid attenuating and delaying the pulse — evidence: `91fb510369 2026-08-20 fix(pos): make the cart add/remove pulse fire once and reach full color`, code: "pulse never reaches the success/error color and visibly lags/snaps." in `packages/components/src/table/pulse-row.tsx:155`.
6. Ignores repeated remove-pulse calls so subsequent presses cannot cancel the pending removal — evidence: `fe0efae382 2026-08-30 fix(pos): let the first remove press win in the cart`, issue #1693, code: "`if (removePulseActive.current) {`" in `packages/components/src/table/pulse-row.tsx:134`.
7. Releases the removal latch after cancellation or mutation settlement so a surviving row remains removable — evidence: `d4439fcc45 2026-08-30 fix(pos): release the cart remove latch when the removal doesn't land`, review reference #1694, code: "`void Promise.resolve(callback?.()).finally(() => {`" in `packages/components/src/table/pulse-row.tsx:111`.
