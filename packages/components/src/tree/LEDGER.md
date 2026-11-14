# Behaviour ledger: `tree`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A collapsible JSON inspector rendered through an Expo DOM component.

**Base:** `@uiw/react-json-view`, with `expo/dom` types and a `'use dom'` boundary in `tree-dom.tsx`; no split by platform filename or `Platform` branch.

## Lines

1. Hosts the JSON viewer inside an Expo DOM component with content-matched sizing — evidence: `887c39947a 2025-03-25 use dom for json tree`, code: `"'use dom';"` in `packages/components/src/tree/tree-dom.tsx:1`.
2. Forces the DOM container to full width to correct JSON viewer display — evidence: `fe08cc195d 2025-10-30 fix json viewer display`, code: `"dom={{ matchContents: true, containerStyle: { width: '100%' } }}"` in `packages/components/src/tree/index.tsx:9`.
