# Behaviour ledger: `avatar`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A profile or site image with configurable shape, size, colour, and initials fallback.

**Base:** `react-native` View, `class-variance-authority`, and local Image/Text components; no `@rn-primitives/*` import. Platform: no split.

## Lines

1. Defaults to initials when the image source is missing or loading fails — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"onError={() => setErrored(true)}"` in `packages/components/src/avatar/index.tsx:130`.
2. Resets image-error state using source content rather than source-object identity — evidence: `bf4403a2ea 2026-05-22 fix: address remaining PR blockers`, code: `"if (sourceKey !== prevSourceKey) {"` in `packages/components/src/avatar/index.tsx:110`.
3. Returns a question-mark initial for empty or whitespace-only names — evidence: `87cb134e9a 2026-04-21 fix: harden components and localize auth copy`, code: `"if (!trimmed) return '?';"` in `packages/components/src/avatar/index.tsx:169`.
