# Behaviour ledger: `card`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A styled content container with header, title, description, content, and footer sections.

**Base:** `react-native` View/Text and local TextClassContext; no `@rn-primitives/*` import. Platform: no split.

## Lines

1. Uses an untinted medium shadow after the native shadow adjustment — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"className={cn('border-border bg-card rounded-lg border shadow-md', className)}"` in `packages/components/src/card/index.tsx:10`.
2. Rounds the header’s top corners to match the card after the native rounding adjustment — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"return <View className={cn('flex flex-col rounded-t-lg p-6', className)} {...props} />;"` in `packages/components/src/card/index.tsx:17`.
