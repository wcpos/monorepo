# Behaviour ledger: `section`

Seeded 2026-10-28 when the section moved here from core's `screens/main/health/components/` (no domain imports) with the edge-surface desktop slice of card 18 (2026-10-28). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A line-separated page section: hairline on top, plain title, muted sub, an action at the right of the header row; never a boxed card.

**Base:** `HStack`, `VStack`, `Text`.

## Lines

1. The section is separated by a hairline, never boxed, with its action at the right of the header row — evidence: `index.test.tsx` (moved from `health/components/section.test.tsx`); callers Store health › Registers, Performance — platform: all.
