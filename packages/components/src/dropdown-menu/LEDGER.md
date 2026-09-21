# Behaviour ledger: `dropdown-menu`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A composable dropdown action menu with submenus, checkbox items, radio items, and destructive variants.

**Base:** `@rn-primitives/dropdown-menu`, `react-native`, and `react-native-reanimated`. No platform-suffixed files; `index.tsx` branches on `"Platform.OS !== 'web'"` for absolute-fill overlays and native fade animations. The `"Platform.OS === 'web'"` icon expression is commented out, not an active split.

## Lines

1. Submenu labels no longer flex-grow following the “Select Store” text fix — evidence: `c28abfa355 2025-07-01 fix menu text for 'Select Store'`, code: "<View className=\"flex-row items-center gap-2\">{children}</View>" in `packages/components/src/dropdown-menu/index.tsx:52`.
2. Native menus animate entry and exit using the shared overlay fade duration — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "entering={Platform.OS !== 'web' ? FadeIn.duration(OVERLAY_FADE_MS) : undefined}" in `packages/components/src/dropdown-menu/index.tsx:106`.
3. The native animation wrapper has full-bleed bounds and box-none pointer handling to preserve Android accessibility and outside taps — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "a11y prunes out-of-bounds children — see popover/index.tsx." in `packages/components/src/dropdown-menu/index.tsx:104`.
