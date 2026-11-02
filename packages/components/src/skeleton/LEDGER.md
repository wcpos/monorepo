# Behaviour ledger: `skeleton`

Seeded 2026-09-18 by wcpos/roadmap#358 from the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The still first paint of a surface, in the content’s shape.

**Base:** `react-native` View and shared token classes.

## Lines

1. Still: no shimmer, no pulse, no entrance; replaced by a hard swap — evidence: wcpos/roadmap#308 §9; wcpos/roadmap#358.
2. Every shape carries `aria-busy` — evidence: component map §8 F12; wcpos/roadmap#358.
3. The placeholder count fills the viewport and is capped at twelve, never a fixed eight — evidence: wcpos/roadmap#308 §2; wcpos/roadmap#358.
