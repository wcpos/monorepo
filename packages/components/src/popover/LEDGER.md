# Behaviour ledger: `popover`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** An anchored popover with a trigger, portal-backed content and animated presentation.

**Base:** `@rn-primitives/popover`, `react-native` and `react-native-reanimated`; no platform-suffixed files. `index.tsx` branches on `"Platform.OS !== 'web'"` for full-screen overlay and animation-wrapper bounds.

## Lines

1. Gives native portal wrappers full-screen bounds so Android accessibility does not prune visible content — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}" in `packages/components/src/popover/index.tsx:46`.
2. Lets outside taps pass through the animation wrapper to the dismissing overlay — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "pointerEvents=\"box-none\"" in `packages/components/src/popover/index.tsx:45`.
3. Pins entrance and exit fades to the shared 200 ms duration instead of the default exit duration — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "exiting={FadeOut.duration(POPOVER_FADE_MS)}" in `packages/components/src/popover/index.tsx:44`.
4. Accepts left and right placement in its public `side` type — evidence: `08c70e8df1 2026-02-12 fix: update component types to support existing size and side values`, code: "side?: 'top' | 'bottom' | 'left' | 'right';" in `packages/components/src/popover/index.tsx:28`.
