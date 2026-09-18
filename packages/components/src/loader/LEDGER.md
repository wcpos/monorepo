# Behaviour ledger: `loader`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A theme-coloured SVG progress spinner.

**Base:** `react-native` View, `react-native-reanimated`, `react-native-svg`, `uniwind`, and `class-variance-authority`. No platform-specific files; `packages/components/src/loader/index.tsx:91` branches on `"!Platform.isNative"` and line 113 on `"Platform.isNative"`.

## Lines

1. Uses a Reanimated rotation on native instead of the inert Uniwind CSS spin class — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "uniwind has no keyframe-animation support on native, so `animate-spin` is" in `packages/components/src/loader/index.tsx:85`.
2. Keeps web rotation CSS-driven rather than JS-driven to avoid load-related stuttering — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "animation: reanimated on web is JS-driven and would stutter under load." in `packages/components/src/loader/index.tsx:88`.
3. Explicitly keeps the native progress animation running under reduced-motion settings — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "withTiming(360, { duration: 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never })" in `packages/components/src/loader/index.tsx:97`.
4. Resolves SVG stroke colours from theme variables rather than relying on native CSS colour inheritance — evidence: `7147247aef 2025-02-25 Fix icon colours in native`, code: "const resolvedColor = String(useCSSVariable(cssVariable) ?? '');" in `packages/components/src/loader/index.tsx:83`.
