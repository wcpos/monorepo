# Behaviour ledger: `collapsible`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A disclosure container with a trigger, open-state chevron, and conditionally mounted content.

**Base:** Local primitives using `react-native`, `@rn-primitives/hooks`, and `@rn-primitives/slot`; the web implementation additionally wraps `@radix-ui/react-collapsible`. Platform split: `primitives.web.tsx` versus default `primitives.tsx`; no Platform branches.

## Lines

1. Moves web DOM mutations into helpers to avoid React Compiler return-value mutation complaints — evidence: code: `"Helper to mutate DOM dataset properties outside component scope"` in `packages/components/src/collapsible/primitives.web.tsx:17`, code: `"so the react-compiler doesn't flag them as return-value mutations."` in `packages/components/src/collapsible/primitives.web.tsx:18`.
