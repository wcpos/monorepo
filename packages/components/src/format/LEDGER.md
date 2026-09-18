# Behaviour ledger: `format`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Presentation helpers for addresses, names, dates, lists, numbers, and currency.

**Base:** `localized-address-format`, `date-fns`, `react-native` View, and local Text; no split.

## Lines

1. Addresses use localized postal ordering with family-name-first formatting for CN, JP, and TW — evidence: `bc8c2504a4 2026-05-03 Improve order modal metadata and address formatting`, code: "if (['CN', 'JP', 'TW'].includes(country || ''))" in `packages/components/src/format/address.tsx:65`.
2. Address fallback detection preserves unavailable-country fields without rejecting known formats that intentionally omit administrative areas — evidence: `c7af3f8ecf 2026-05-03 fix: address remaining PR review feedback`, code: "return Boolean(country) && !linesEqual(lines, defaultLines);" in `packages/components/src/format/address.tsx:89`.
3. Non-string list entries receive keyed fragments to avoid React key warnings — evidence: `82ff43e07e 2026-01-30 fix: address CodeRabbit review suggestions`, code: "return <React.Fragment key={index}>{item}</React.Fragment>;" in `packages/components/src/format/list.tsx:16`.
