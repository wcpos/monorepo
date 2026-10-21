# Behaviour ledger: `apps/main/components`

Seeded 2026-10-21 by the gate-screen sweep (branch `feat/gate-screen-sweep`, after wcpos/monorepo#2805). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3.

**Job:** The app's own components that cannot live in `packages/components`: the screens that render above every provider, and the shells around them. The pre-theme gate they draw on lives in the design system (`@wcpos/components/gate-screen/pre-theme`).

## Lines

1. _(moved to `packages/components/src/gate-screen/LEDGER.md` lines 12–15 with `PreThemeGate`, 2026-10-21)_
2. _(moved to `packages/components/src/gate-screen/LEDGER.md` lines 12–15 with `PreThemeGate`, 2026-10-21)_
3. _(moved to `packages/components/src/gate-screen/LEDGER.md` lines 12–15 with `PreThemeGate`, 2026-10-21)_
4. _(moved to `packages/components/src/gate-screen/LEDGER.md` lines 12–15 with `PreThemeGate`, 2026-10-21)_
5. Every whole-app screen is registered in `gate-screens.test.ts` on its member of the family (GateScreen, FallbackScreen, PreThemeGate), and the same test refuses the parked tab's old hand-built shape (an `EmptyState` and a `Button` centred in a `View`) under the app and the core screens — evidence: `CODING_STANDARDS.md` § Design, "Gate screens"; `feat/gate-screen-sweep`.
