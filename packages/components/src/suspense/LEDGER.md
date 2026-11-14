# Behaviour ledger: `suspense`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A React Suspense boundary with development-only fallback diagnostics.

**Base:** `react` (`React.Suspense`) and `react-native` (`Text`); no split. The environment branch is "`process.env.NODE_ENV === 'development'`", not a platform branch.

## Lines

1. Records fallback timing directly in mount/unmount callbacks instead of triggering another state/effect cycle — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "Timing logic lives directly in the callbacks — no state-as-trigger needed" in `packages/components/src/suspense/suspense.tsx:51`.
2. Substitutes “Loading ...” for a falsy fallback in the development wrapper — evidence: code: "`return fallback || <Text>Loading ...</Text>;`" in `packages/components/src/suspense/suspense.tsx:17`.
