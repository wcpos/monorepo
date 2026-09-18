# Behaviour ledger: `label`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A styled form label that supports press interactions.

**Base:** `@rn-primitives/label`, `@rn-primitives/slot`, and `react-native` Pressable. Platform split: no split; web-specific styling uses `web:` classes.

## Lines

1. Wraps primitive label text in a Pressable to preserve press, long-press, press-in, and press-out events — evidence: code: "@rn-primitives/label is not using Pressable, only a View so we don't get the onPress events" in `packages/components/src/label/index.tsx:18`.
