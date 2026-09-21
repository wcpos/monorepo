# Behaviour ledger: `textarea`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** An autosizing multiline text input with controlled cursor-selection handling.

**Base:** `react-native` (`TextInput`) and `react-native-reanimated`; no split. Shared classes include web-specific focus rings and disabled cursor styling.

## Lines

1. Resizes to content height without shrinking below `minHeight` — evidence: `17b72a05ee 2024-09-28 autosize textarea component`, code: "`height: Math.max(minHeight, height.value),`" in `packages/components/src/textarea/index.tsx:44`.
2. Explicitly resets height when the value becomes empty because the content-size event does not fire — evidence: code: "Necessary because onContentSizeChange doesn't fire for empty content." in `packages/components/src/textarea/index.tsx:88`.
3. Positions the cursor at the end on focus while forwarding the caller’s focus handler — evidence: `17b72a05ee 2024-09-28 autosize textarea component`, code: "Sets the cursor position to the end of the current text and calls the parent `onFocus` handler if provided." in `packages/components/src/textarea/index.tsx:63`.
4. Tracks selection changes to prevent native cursor jumps on re-render — evidence: `19e7955605 2025-11-06 Fix textarea cursor issues on native`, code: "Updates the local selection state to prevent cursor jumping on re-renders." in `packages/components/src/textarea/index.tsx:76`.
