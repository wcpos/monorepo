# Behaviour ledger: `checkbox`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A checkbox with an additional visual indeterminate state.

**Base:** `@rn-primitives/checkbox` and `react-native` View. Platform: no split in files or Platform branches; styling explicitly differs through `"native:h-[20] native:w-[20] native:rounded"` and web-only focus classes.

## Lines

1. Displays a filled minus indicator independently of the primitive’s checked indicator for indeterminate selections — evidence: `54e2de9747 2024-08-29 update components`, code: `"<Icon name=\"minus\" className=\"text-primary-foreground h-3 w-3\" />"` in `packages/components/src/checkbox/index.tsx:26`.
2. Uses native-specific dimensions and rounding while keeping keyboard focus rings web-only — evidence: code: `"web:peer native:h-[20] native:w-[20] native:rounded web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1"` in `packages/components/src/checkbox/index.tsx:17`.
