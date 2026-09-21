# Behaviour ledger: `alert-dialog`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A confirmation-dialog family providing a portal, overlay, descriptive content, and action/cancel controls.

**Base:** `@rn-primitives/alert-dialog`, `@rn-primitives/slot`, `react-native`, and `react-native-reanimated`, with the local Button. No platform-specific files; `index.tsx` uses `"Platform.select({ web: AlertDialogOverlayWeb, default: AlertDialogOverlayNative })"`.

## Lines

1. Paints confirmations above side panels sharing the portal host — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)`, PR #1991, code: `"// z-70: a confirmation must paint above a side panel (DialogContent is z-60) even when both"` in `packages/components/src/alert-dialog/index.tsx:25`.
2. Uses shared native overlay fade durations instead of independent defaults — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"exiting={FadeOut.duration(OVERLAY_FADE_MS)}"` in `packages/components/src/alert-dialog/index.tsx:50`.
3. Aligns the native scrim with the web scrim at black/70 — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"className={cn('z-70 flex items-center justify-center bg-black/70 p-2', className)}"` in `packages/components/src/alert-dialog/index.tsx:44`.
4. Preserves dialog dismissal after a caller-supplied cancel handler instead of allowing the prop spread to replace it — evidence: `a805360120 2026-04-04 fix(pr277): address review comments and lint typecheck blocker`, PR #277, code: `"onPress: userOnPress,"` in `packages/components/src/alert-dialog/index.tsx:149`.
5. Removes the foreground-tinted shadow override for native rendering — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"'web:duration-200 border-border bg-background z-70 max-w-lg gap-4 rounded-lg border py-4 shadow-lg',"` in `packages/components/src/alert-dialog/index.tsx:75`.
