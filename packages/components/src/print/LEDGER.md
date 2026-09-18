# Behaviour ledger: `print`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Receipt/report layout primitives providing monospaced text, equal-width rows, separators and spacing.

**Base:** `react-native` (`View`, `Text`) and `class-variance-authority`; no split. Text styling includes `web:select-text`.

## Lines

1. Forwards row test identifiers so report blocks can be addressed without text selectors — evidence: `c7f9418627 2026-09-11 fix(orders): register names keyed per site/store, register verified in lane coverage, test ids on the report block`, code: "<View testID={testID} className=\"flex-row justify-between\">" in `packages/components/src/print/row.tsx:9`.
