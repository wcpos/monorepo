# Behaviour ledger: `toggle-group`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A grouped set of selectable toggle buttons with shared sizing and segmented borders.

**Base:** `@rn-primitives/toggle-group`, with `class-variance-authority` variants; no split.

## Lines

1. Joins adjacent toggles into a bordered segmented control using first/last-child flags — evidence: `e370bc95b4 2024-09-02 tweak components`, code: `"!isLastItem && 'border-border rounded-none border-r'"` in `packages/components/src/toggle-group/index.tsx:87`.
