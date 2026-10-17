# Behaviour ledger: `list-item`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A selectable row with leading and trailing content, title/subtitle, and optional removal.

**Base:** `react-native` Pressable/View, `class-variance-authority`, and local IconButton/Text components. Platform split: no split.

## Lines

1. Gives explicit non-default variants priority over selected styling — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: "Explicit non-default variant (e.g. \"warning\") wins over selected." in `packages/components/src/list-item/index.tsx:80`.
2. Stops the remove-button press from also activating the row — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: "e.stopPropagation();" in `packages/components/src/list-item/index.tsx:110`.
3. It shares the tile surface (`lib/tile-surface.ts`): `selected` is the primary border on `bg-muted`, `dashed` has no surface, disabled is `opacity-50`; a fine pointer gets the `bg-muted` hover. An actionable row is a `button` unless the caller names another role (a checkbox, a radio), which react-native-web also needs for Space to press it; a row without `onPress` is no tab stop — evidence: Phase F3 (#2641), where the printer results, store picker and device rows moved onto it from outline Buttons and raw Pressables; Codex and CodeRabbit on #2641; tests in `list-item.test.tsx`.
