# Behaviour ledger: `empty-state`

Seeded 2026-09-18 by wcpos/roadmap#358 from the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The one state block for Empty, No results and Failed.

**Base:** `react-native` View; `Text`, `Icon`, `HStack`, `Button` and `DocsLink`.

## Lines

1. One inset for the surface size, six units, ending the table’s `p-2` and the grid’s `p-4` — evidence: wcpos/roadmap#308 §5; wcpos/roadmap#358.
2. Inline has no icon and no description — evidence: wcpos/roadmap#308 §5; wcpos/roadmap#358.
3. The action takes focus only through `autoFocus`, never automatically on first paint — evidence: component map §8 F11; wcpos/roadmap#358.
4. The block never truncates; length is height — evidence: wcpos/roadmap#308 §8; wcpos/roadmap#358.
