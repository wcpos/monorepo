# Behaviour ledger: `code-chip`

Seeded 2026-10-28 when the chip moved here from core's `screens/main/health/components/` (no domain imports) with the edge-surface desktop slice of card 18 (2026-10-28). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** An error-code chip (`SYNC132`) in the Logs ledger.

**Base:** `react-native` Pressable and View (exempt from the raw-pressable ratchet inside the library); `Text`.

## Lines

1. Pressable only when the code is in the error catalogue: never a dead link — evidence: Logs ledger (`ledger.tsx`) — platform: all.
