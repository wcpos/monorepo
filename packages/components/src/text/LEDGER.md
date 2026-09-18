# Behaviour ledger: `text`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A styled text primitive supporting inherited text classes, child substitution, and optional HTML-entity decoding.

**Base:** `react-native` (`Text`), `@rn-primitives/slot`, `class-variance-authority`, and `html-entities`; `@rn-primitives/types` supplies props. No split; shared styling includes `web:` selection and interaction modifiers.

## Lines

1. Decodes HTML entities only for string children when explicitly requested — evidence: code: "`decodeHtml && typeof children === 'string' ? decode(children) : children;`" in `packages/components/src/text/index.tsx:33`.
2. Merges caller classes after inherited text-context classes so explicit styling takes precedence in class merging — evidence: code: "`cn(textVariants({ variant }), textClass, className)`" in `packages/components/src/text/index.tsx:36`.
