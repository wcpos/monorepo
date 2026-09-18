# Behaviour ledger: `panels`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Resizable panel groups with a direction-aware grip handle.

**Base:** `react-native-resizable-panels` and `react-native` (`View`); no split within this folder. Handle styling contains `web:group-hover:` variants.

## Lines

1. Restricts hover styling to web so it does not apply unconditionally on iOS or Android — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, code: "web:group-hover:cursor-ew-resize" in `packages/components/src/panels/index.tsx:53`.
2. Exposes the wrapped handle’s enlarged coarse/fine-pointer hit targets through `hitTargetSize` — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`, code: "hitTargetSize," in `packages/components/src/panels/index.tsx:28`.
3. Exposes the wrapped handle’s double-tap reset with a `disableDoubleTap` opt-out — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`, code: "disableDoubleTap," in `packages/components/src/panels/index.tsx:27`.
4. Inherits web keyboard resizing and separator ARIA semantics from the wrapped handle — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`.
