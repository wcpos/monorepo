# Behaviour ledger: `status-badge`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A compact text badge displaying a status with semantic colour variants.

**Base:** `react-native` (`View`), `class-variance-authority`, and local `Text`; no split.

## Lines

1. Resets inherited text classes so enclosing buttons cannot override the badge’s semantic colours on hover — evidence: `b324f90140 2026-08-19 fix(components): a badge keeps its own colours wherever it is nested (#1369)`, PR/issue #1369, code: "`<TextClassContext.Provider value={undefined}>`" in `packages/components/src/status-badge/index.tsx:61`.
