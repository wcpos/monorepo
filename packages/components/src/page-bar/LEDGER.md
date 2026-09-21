# Behaviour ledger: `page-bar`

Seeded 2026-09-18 by wcpos/roadmap#359 from the component map (wcpos/roadmap#291) and the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The non-register pages’ bar: title left, controls right, the status chip’s home.

**Base:** React Native View, HStack, Text, StatusBadge, IconButton, Breadcrumb, useSafeAreaInsets and useIsPhone.

## Lines

1. The title sits left, never centred, and ellipsises at its end — evidence: component map §6 (`components/header`, R5 reason), the drawn bar; wcpos/roadmap#359.
2. The status chip is the page’s one status place, always with text, a `StatusBadge` — evidence: wcpos/roadmap#308 §7; the map’s one-way rule §7a.
3. The leading slot (menu or back crumb) renders on the phone width only; the rail carries navigation on wide widths — evidence: platform split (wcpos/roadmap#290) §1; `navigation-area` line 2 as origin.
4. No store name is appended to the title; the caller owns the title — evidence: the drawn bar shows the store only when a store has more than one register (`· UK Store`), as a subtitle.
5. The drawer glyph takes a caller-supplied label; an icon-only control carries no accessible name of its own and the string is the caller's to translate — evidence: Codex review on wcpos/monorepo#2188.
6. The drawer glyph is sized to the control token, because an icon plus its padding is under the pointer floor and it is a primary navigation control — evidence: `.claude/rules/design.mdc` §3 (44 pt minimum); Codex review on wcpos/monorepo#2188.
7. The subtitle yields before the title: it shrinks and ellipsises, so flexbox never collapses the page's own name first — evidence: Codex review on wcpos/monorepo#2188.
