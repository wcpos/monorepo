# Behaviour ledger: `icon`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A named SVG icon with semantic colours, size variants, and an optional loading indicator.

**Base:** `react-native` View, `react-native-svg`, `uniwind`, and `class-variance-authority`. No platform-specific files; `packages/components/src/icon/index.tsx:126` branches on `"Platform.isWeb || Platform.isElectron"`.

## Lines

1. Uses CSS `currentColor` on web/Electron for hover inheritance and resolved theme colours on native — evidence: `3578256645 2025-12-18 fix icon colour`, code: "On web, use currentColor to inherit from CSS (enables hover state changes)" in `packages/components/src/icon/index.tsx:122`.
2. Gives explicit colour classes precedence over variant classes and inherited text classes — evidence: code: "Order matters: textClass (from context like Button) → iconVariants → className (explicit override)" in `packages/components/src/icon/index.tsx:97`.
3. Forwards pointer-event control to both the wrapper and SVG so icons can stop intercepting presses — evidence: `95148d4d01 2025-12-03 stop Icons from blocking press events`, code: "pointerEvents={pointerEvents}" in `packages/components/src/icon/index.tsx:129` and `packages/components/src/icon/index.tsx:135`.
