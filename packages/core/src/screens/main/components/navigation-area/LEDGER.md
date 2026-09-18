# Behaviour ledger: `components/navigation-area`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Provide shared responsive navigation for multi-page areas such as Settings and Store Health.

**Composes:** `@wcpos/components/{button,hstack,icon,lib/utils}`.

## Lines

1. Wide layouts show a persistent page rail and redirect the area root to its default page; narrow layouts show a tappable index — preserves the approved desktop versus phone navigation model — evidence: `ea688a87c5 2026-07-16 feat(main+core)!: Settings and Store health drawer areas — the modal retires (#700)`; wide-rail, narrow-list, and default-redirect tests in `index.test.tsx` — platform: all.
2. Narrow leaf pages include a back bar navigating to the area index, including when deep-linked — otherwise there is no in-app route to sibling pages — evidence: “A leaf page (or deep link) on a narrow screen has no rail — the back” / “bar is its only in-app route to the area index and its siblings.” (`components/navigation-area/index.tsx:87–88`) — platform: all.
3. Active pages receive both visual selection and accessibility selection state, with optional icons/badges — navigation must communicate which page is open — evidence: `ea688a87c5 2026-07-16 feat(main+core)!: Settings and Store health drawer areas — the modal retires (#700)`; `69a36ee74c 2026-07-22 feat(settings): redesign settings pages with quiet row-based layout` — platform: all.
