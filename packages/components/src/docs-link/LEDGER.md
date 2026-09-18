# Behaviour ledger: `docs-link`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A consistently styled documentation link with a trailing external-link arrow.

**Base:** React and local `Button`, `ButtonText`, `HStack`, and `Icon` components, with `@wcpos/utils/open-external-url`; no split inside this folder, with platform hand-off delegated to that utility.

## Lines

1. Documentation links share one visual treatment and route through the system-browser hand-off, including Electron — evidence: `372bebd5ba 2026-08-20 feat(ui): one source of truth for totals, DocsLink component, per-hour request estimate`, code: "onPress={() => openExternalURL(href)}" in `packages/components/src/docs-link/index.tsx:33`.
