# Behaviour ledger: `stat`

Seeded 2026-10-28 when the stat header moved here from core's `screens/main/health/components/` (no domain imports) with the edge-surface desktop slice of card 18 (2026-10-28). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** One number with its label, and the stat row that opens a Store health tab.

**Base:** `react-native` Pressable and View (the library's own raw pressable, which the uniwind ratchet exempts here); `HStack`, `Text`.

## Lines

1. A stat with `onPress` doubles as a filter control (Store health's idiom: the stats are the primary filters), announced as a button by its label — evidence: Logs and Database tabs — platform: all.
2. The label is the ladder's help rank (`Text variant="help"`), not a restated class string — evidence: the text-ladder fence (`packages/eslint/text-ladder-allowlist.json` lost its entry with the move) — platform: all.
3. `StatHeader` puts the stats left and the actions right over a hairline, and wraps on a narrow screen — evidence: Logs and Database tabs — platform: all.
