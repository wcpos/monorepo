# Behaviour ledger: `segmented-control`

Seeded 2026-09-21 by wcpos/roadmap#360 from the component map (wcpos/roadmap#291), the register sign-off (wcpos/roadmap#287) and the scale page (wcpos/roadmap#289). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** One single-select value picker of two to four segments.

**Base:** `react-native` View and Pressable; `Text` and `Icon`.

## Lines

1. The selected segment cannot be pressed off; a picker is never empty — evidence: component map §5 and §7a (one value picker).
2. The group is one Tab stop with arrow keys between segments — evidence: the ARIA radiogroup pattern; map §8 F8 (Tab order, no roving tabindex in navigation).
3. Two to four segments, enforced by the type — evidence: map §5.
4. The disabled state is always an explicit boolean — evidence: `button` ledger line 1 as origin (`c99855da17`); Codex review on wcpos/monorepo#2189.
