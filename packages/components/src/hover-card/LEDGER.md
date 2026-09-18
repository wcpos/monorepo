# Behaviour ledger: `hover-card`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A trigger-associated informational card rendered through a portal.

**Base:** `@rn-primitives/hover-card`, `react-native`, and `react-native-reanimated`. No platform-suffixed files; `index.tsx` uses `"Platform.OS !== 'web'"` for the overlay and animated wrapper’s absolute-fill styles.

## Lines

1. Native portal wrappers have full-bleed bounds and box-none pointer handling so Android accessibility can reach the content without blocking outside taps — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "a11y prunes out-of-bounds children — see popover/index.tsx." in `packages/components/src/hover-card/index.tsx:28`.
