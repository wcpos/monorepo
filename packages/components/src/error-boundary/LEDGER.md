# Behaviour ledger: `error-boundary`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A react-error-boundary wrapper with a default dismissible error display.

**Base:** `react-error-boundary`, composed with local layout, text, icon, and tooltip components; no split.

## Lines

1. Narrow containers or very long errors show the message in a tooltip instead of inline — evidence: code: "if (containerWidth < 200 || errorMessage.length > 1000)" in `packages/components/src/error-boundary/fallback.tsx:31`.
2. Both fallback layouts expose the same stable test identifier — evidence: `029fad548c 2026-04-30 Enforce stable testIDs in E2E tests`, code: "testID=\"error-boundary-fallback\"" in `packages/components/src/error-boundary/fallback.tsx:34` and `packages/components/src/error-boundary/fallback.tsx:59`.
3. Reports every render exception the boundary catches once, with `SCREEN_RENDER_FAILED` and the component stack retained, and still invokes the caller's `onError` — a replacement that keeps only the fallback display silently drops persisted and Sentry reporting of caught render failures — evidence: `33f0d8e1af 2026-09-16 fix(app): report boundary-caught render errors to Sentry; route an incomplete store session back to the store list (#2112)`, code: `"code: ERROR_CODES.SCREEN_RENDER_FAILED,"` in `packages/components/src/error-boundary/index.tsx:36`, `"onError?.(error, info);"` at `:55`. _(added 2026-09-18 after seeding, from the Codex review of monorepo#2160; the behaviour landed after the source ledger's 2026-09-12 read)_
