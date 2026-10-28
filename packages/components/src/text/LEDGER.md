# Behaviour ledger: `text`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A styled text primitive supporting inherited text classes, child substitution, and optional HTML-entity decoding.

**Base:** `react-native` (`Text`), `@rn-primitives/slot`, `class-variance-authority`, and `html-entities`; `@rn-primitives/types` supplies props. No split; shared styling includes `web:` selection and interaction modifiers.

## Lines

1. Decodes HTML entities only for string children when explicitly requested — evidence: code: "`decodeHtml && typeof children === 'string' ? decode(children) : children;`" in `packages/components/src/text/index.tsx:33`.
2. Merges caller classes after inherited text-context classes so explicit styling takes precedence in class merging — evidence: code: "`cn(textVariants({ variant, tabular }), textClass, className)`" in `packages/components/src/text/index.tsx:38`.
3. The type ladder is `Text`'s `variant` axis, one cva in `text/ladder.ts` (`TEXT_LADDER`): `area` 18 semibold (`text-xl`), `dialog` 16 semibold (`text-lg`), `section` 14 semibold, `subheading` 14 medium (the rank the ladder lacked; callers wrote `text-sm font-medium`), `body` 14 (the default; was `default`, which no caller passed), `key` 13 muted (`text-sm`), `help` 12 muted (`text-xs`), `caption` 12 uppercase `tracking-wide` muted, plus `link`. `tabular` adds `tabular-nums` to any rank. Caption is medium, not semibold: decision 9 ruled the table head medium (table line 11). A `Text` whose classes restate help, key, subheading or caption is a site in the ratchet `packages/eslint/tests/text-ladder-fence.test.mjs`; the generated baseline `packages/eslint/text-ladder-allowlist.json` (146 files, 358 sites on 2026-10-28; subheading is fenced both as the legacy `text-sm font-medium` and as `text-base font-medium`) only shrinks — evidence: card 6 of the 2026-10-28 component-library review; the ladder board `2026-10-25-heading-label-disclosure-ladder.html`; test `text/ladder.test.ts`.
