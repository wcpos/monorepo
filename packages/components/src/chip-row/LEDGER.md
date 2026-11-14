# Behaviour ledger: `chip-row`

Seeded 2026-10-28 by card 18 of the component-library review, when the row moved here from core's `screens/main/components/chip-row.tsx`. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** The pill row every list surface with filters has, and its loading frame.

**Base:** `react-native` View and ScrollView; `lib/ground`, `Skeleton`.

## Lines

1. The row is inset by the ground's gutter on every side (`useGround().p`: the page gutter in a window, 16 at the phone's screen edge, none on an edge facing another pane), so the search above and the card below share its edge, and the pills scroll horizontally inside a wrapper sized to them — evidence: owner, 2026-10-22; `index.test.tsx`, core `components/data-table/ground.test.tsx` — platform: all.
2. `ChipRowSkeleton` holds the same row at the chips' height while the pills answer, so the card under it never moves — evidence: owner, 2026-10-22 ("jarring, either load the filter bar or at least skeleton"); `index.test.tsx` — platform: all.
