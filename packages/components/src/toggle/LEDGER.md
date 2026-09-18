# Behaviour ledger: `toggle`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A styled two-state toggle button with variant-dependent descendant text styling.

**Base:** `@rn-primitives/toggle` and `class-variance-authority`; no split. Shared styles contain explicit `native:` sizing and `web:` interaction modifiers.

## Lines

1. Uses larger height classes on native than the corresponding default web sizes — evidence: code: "`default: 'native:h-12 native:px-[12] h-10 px-3'`" in `packages/components/src/toggle/index.tsx:19`.
2. Uses shared `text-sm` typography instead of a separate native `text-base` override — evidence: `5d440d65b5 2025-03-14 increase font-size for native`, code: "`const toggleTextVariants = cva('text-foreground text-sm font-medium', {`" in `packages/components/src/toggle/index.tsx:31`.
