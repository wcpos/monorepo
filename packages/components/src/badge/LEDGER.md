# Behaviour ledger: `badge`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A compact notification count or dot indicator.

**Base:** `react-native` View, `class-variance-authority`, and local Text/TextClassContext; no `@rn-primitives/*` import. Platform: no split.

## Lines

1. Isolates badge text colours from enclosing button hover/active text styles — evidence: `b324f90140 2026-08-19 fix(components): a badge keeps its own colours wherever it is nested (#1369)`, issue #1369, code: `"<TextClassContext.Provider value={undefined}>"` in `packages/components/src/badge/index.tsx:104`.
2. Renders arbitrary children even when there is no positive count, and hides itself only when there are no children, no dot and no count — the Closures room passes translated Unsynced and Corrected labels as children, and a count-only badge would hide them — evidence: `21b57723e9 2026-09-17 Land the Closures room on Reports: the page bar with Sales | Closures, closures by business day, the drill-in through the closure template with settled figures, Reprint, Recount and Export CSV (#2131)`, code: `"if (!children && !dot && (!count || count <= 0)) {"` in `packages/components/src/badge/index.tsx:86`; caller `packages/core/src/screens/main/reports/closures/closure-list.tsx:99-107`. _(added 2026-09-18 after seeding, from the Codex review of monorepo#2160; the behaviour landed after the source ledger's 2026-09-12 read)_
3. A `count` that changes while the badge is mounted plays the count beat: the old number fades where it sits and the new one bounces with the badge when the count went up; a count that goes down only changes the number. `motion="roll"` keeps the earlier vertical roll. Nothing moves on mount, behind the `max` cap, or when `identity` changes; `showZero` keeps a 0 on show — evidence: owner pick 2026-10-02 ("Fade, then bounce as one"; "Make the animation for any badge that changes number"), code: `useCountBeat` in `packages/components/src/badge/count-beat.tsx`, test: `badge count beat` in `badge.test.tsx`.
