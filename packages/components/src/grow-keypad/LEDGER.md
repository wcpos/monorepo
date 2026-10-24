# Behaviour ledger: `grow-keypad`

Seeded 2026-10-24 when the shell was lifted out of `quantity-keypad` for the price keypad (Paul 2026-10-24, price-keypad-variants board, variant 1). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3.

**Job:** The one shell both keypads grow from: the trigger that grows in place into an anchored panel or the phone sheet, the grid, focus, the physical keyboard and Done. Package-internal; `QuantityKeypad` is its caller, the price keypad its next.

**Base:** `popover`, `button`, `icon`, `text`; `react-native` View and Pressable for the flat keys. The entry (what was typed, what commits) is the caller's.

## Lines

1. Anchored rows are 48 px tall and the first row lands on the trigger (`sideOffset` of the trigger's height plus half the difference); the panel overhangs rather than shifting (`avoidCollisions={false}`) — evidence: `quantity-keypad` lines 2 and 3 as origin.
2. Measured once per open: when every row would not fit below the trigger, the panel opens upward with the first row last, landing on the trigger; `data-grow` says which — evidence: `quantity-keypad` line 3 as origin.
3. The panel, not its first key, holds focus (on open, after every key press, and on the phone sheet once it has risen); the physical keyboard types digits, `.`, `,` or the store's separator as `decimal`, Backspace, and Enter as Done unless a focused key takes it; Escape closes discarding — evidence: `quantity-keypad` line 9 as origin.
4. Every key has a role, an accessible name and a stable testID; ✓ is `numpad-done-button`, a digit or an icon key `numpad-key-<name>` — evidence: `quantity-keypad` line 10 as origin.
5. On a phone the same rows open in the app's bottom sheet: the first row bordered, the digit and icon keys stretched and muted, Done as the filled `Button` in ✓'s place — evidence: `quantity-keypad` line 11 as origin.
