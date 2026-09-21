# Behaviour ledger: `chip`

Seeded 2026-09-21 by wcpos/roadmap#360 from the component map (wcpos/roadmap#291), the register sign-off (wcpos/roadmap#287) and the scale page (wcpos/roadmap#289). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The register’s pill and filter trigger skin.

**Base:** `react-native` Pressable and View; `Text` and `Icon`.

## Lines

1. The clear press never bubbles into the chip or a surrounding trigger — evidence: `button` line 10 as origin (`186b25c5c3`), carried here.
2. The clear control has an overridable accessible name defaulting to Remove — evidence: `button` line 11 (`a68a9dfee1`).
3. The clear control has its own test ID — evidence: `button` line 12 (`00f86c0049`).
4. The press handler reaches the label, so a chip composes as a trigger — evidence: `button` line 9 (`4f0e72e463`).
5. A dimmed chip is disabled and its reason is the caller’s, never colour alone — evidence: the register sign-off’s dimmed pill; `.claude/rules/design.mdc` §7.
6. The disabled state is always an explicit boolean; an absent state key leaves an Android view accessibility-disabled after it looks enabled again — evidence: `button` ledger line 1 as origin (`c99855da17`, issue #1614); Codex review on wcpos/monorepo#2189.
7. With a clear control the wrapper is not an accessibility element: it handles nothing and would otherwise group the two actionable halves into one VoiceOver stop — evidence: Codex review on wcpos/monorepo#2189.
8. The clear control carries a control-sized hit area rather than relying on `hitSlop`, which react-native-web does not implement — evidence: `.claude/rules/design.mdc` §3 (44 pt minimum); Codex review on wcpos/monorepo#2189.
9. The chip hugs its label; it never stretches to its container, because a View stretches across a column parent by default and the drawn chip is inline-flex — evidence: the language prototype's `.chip` rule (`display:inline-flex`); the gallery cells on wcpos/monorepo#2189 showed the full-width bar.

_Cells: a chip hugs its label, so each story is content-width. If a cell renders full-width the baseline is stale — see the shoot note on wcpos/monorepo#2189._
