# Behaviour ledger: `apps/main/components`

Seeded 2026-10-21 by the gate-screen sweep (branch `feat/gate-screen-sweep`, after wcpos/monorepo#2805). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3.

**Job:** The app's own components that cannot live in `packages/components`: the screens that render above every provider, and the shells around them.

## Lines

1. `PreThemeGate` is `GateScreen` for a screen that renders above every provider (the root error screen, the blocked reset): no theme and no translations, so no className resolves, and the same geometry is written in StyleSheet numbers — the mark, one card at 448 inset 32 (16 on a phone, by `isPhoneWindow`), a 56 tone disc, the title in foreground ink at 20/600, one muted line, the actions stacked full width at 44 — evidence: `packages/components/src/gate-screen/LEDGER.md` lines 2–5; `apps/main/components/pre-theme-gate.tsx`; `feat/gate-screen-sweep`.
2. The mark is the sign-in `Logo`: it takes width and height only, never a className, so it draws above the providers — evidence: `packages/components/src/logo/index.tsx`; `feat/gate-screen-sweep`.
3. The tone glyph is the default icon set's (tabler) `warning`, `alert` or `info` path drawn in an inline `Svg` with the tone's colour, because `Icon` takes its colour from a className; a test pins the paths to the generated tabler components — evidence: `pre-theme-gate.test.tsx`; `feat/gate-screen-sweep`.
4. `PRE_THEME_COLOURS` is the light theme's tokens as hex, out-of-gamut tokens clipped to sRGB as a browser paints them, and a test parses `global.css` so no value can drift from its token — evidence: `pre-theme-colours.test.ts`; `feat/gate-screen-sweep`.
5. Every whole-app screen is registered in `gate-screens.test.ts` on its member of the family (GateScreen, FallbackScreen, PreThemeGate), and the same test refuses the parked tab's old hand-built shape (an `EmptyState` and a `Button` centred in a `View`) under the app and the core screens — evidence: `CODING_STANDARDS.md` § Design, "Gate screens"; `feat/gate-screen-sweep`.
