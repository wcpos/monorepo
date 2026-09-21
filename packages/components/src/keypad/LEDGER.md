# Behaviour ledger: `keypad`

Seeded 2026-09-21 by wcpos/roadmap#360 from the component map (wcpos/roadmap#291), the register sign-off (wcpos/roadmap#287) and the scale page (wcpos/roadmap#289). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The register’s grid of keys, without a display or value owner.

**Base:** `react-native` View and Pressable; `HStack`, `Text` and `Icon`.

## Lines

1. The grid owns no value and no display, so the caller keeps its entry behaviour — evidence: map §5 (`numpad` composes it and keeps its display lines).
2. Under `shrink` the keys give way before anything else in the pane, down to the pointer floor and no further — evidence: map §5 (a height policy that gives way first).
3. An icon-only key carries a stable identifier — evidence: `numpad` line 6 as origin (`e513ffcb69`).
4. An icon-only key takes a caller-supplied accessible name; its machine value is not a name — evidence: the page-bar review on wcpos/monorepo#2188 applied here; wcpos/roadmap#360.
