# Behaviour ledger: `breadcrumb`

Seeded 2026-09-18 by wcpos/roadmap#359 from the component map (wcpos/roadmap#291) and the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The place, never the conditions; the phone page’s back crumb.

**Base:** React Native View, HStack, Button (ghost-quiet, sm), Icon and Text.

## Lines

1. The crumb is the place, never the conditions — evidence: filters and breadcrumbs page.
2. The immediate parent is Back and takes focus on drill-in when asked — evidence: component map §8 F4.
3. Labels wrap; the crumb never truncates — evidence: wcpos/roadmap#308 §8 applied (length is height).
4. The row is a minimum height, not a fixed one, so a wrapped label grows it instead of overflowing, and every crumb meets the pointer floor because a crumb is the phone page's back control — evidence: Codex review on wcpos/monorepo#2188; line 3 could not hold with a fixed height.
5. Parent crumbs are the foreground at weight 500 on a muted hover, the `ghost` variant; `ghost-quiet` exists to mute its own label, so asking for it and overriding the colour asked for the wrong variant — evidence: the drawn `.crumb button` rule (foreground, weight 500, muted hover) in the language prototype; Codex review on wcpos/monorepo#2188.
