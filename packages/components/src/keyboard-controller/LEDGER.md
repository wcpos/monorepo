# Behaviour ledger: `keyboard-controller`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A platform adapter exposing native keyboard handling and web-compatible wrappers.

**Base:** `react-native-keyboard-controller`, re-exported by `index.tsx`; the web file imports its props type only. Platform-specific file: `packages/components/src/keyboard-controller/index.web.tsx`.

## Lines

1. Replaces KeyboardProvider and KeyboardAvoidingView with children-only wrappers on web — evidence: `60f77d4098 2025-04-04 add keyboard-controller wrapper for web`, code: "This is an empty wrapper for web platforms" in `packages/components/src/keyboard-controller/index.web.tsx:7` and `packages/components/src/keyboard-controller/index.web.tsx:15`.
