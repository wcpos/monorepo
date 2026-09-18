# Behaviour ledger: `error-boundary`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A react-error-boundary wrapper with a default dismissible error display.

**Base:** `react-error-boundary`, composed with local layout, text, icon, and tooltip components; no split.

## Lines

1. Narrow containers or very long errors show the message in a tooltip instead of inline — evidence: code: "if (containerWidth < 200 || errorMessage.length > 1000)" in `packages/components/src/error-boundary/fallback.tsx:31`.
2. Both fallback layouts expose the same stable test identifier — evidence: `029fad548c 2026-04-30 Enforce stable testIDs in E2E tests`, code: "testID=\"error-boundary-fallback\"" in `packages/components/src/error-boundary/fallback.tsx:34` and `packages/components/src/error-boundary/fallback.tsx:59`.
