# Behaviour ledger: `breadcrumb`

Seeded 2026-09-18 by wcpos/roadmap#359 from the component map (wcpos/roadmap#291) and the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The place, never the conditions; the phone page’s back crumb.

**Base:** React Native View, HStack, Button (ghost-quiet, sm), Icon and Text.

## Lines

1. The crumb is the place, never the conditions — evidence: filters and breadcrumbs page.
2. The immediate parent is Back and takes focus on drill-in when asked — evidence: component map §8 F4.
3. Labels wrap; the crumb never truncates — evidence: wcpos/roadmap#308 §8 applied (length is height).
