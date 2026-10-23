# Behaviour ledger: `quantity-keypad`

Seeded 2026-10-24 with the component, from decision 36 of the 2026-09-12 language prototype (Paul, 2026-09-17). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3.

**Job:** The cart's quantity box, which grows in place into a stepper and keypad on web and opens the phone sheet below the phone width.

**Base:** `popover` (portal, outside-press layer, Escape, focus return, the phone sheet), `button`, `icon`, `text`; `react-native` View and Pressable for the flat keys. Behaviour lives in the pure `reducer.ts`.

## Lines

1. The box at rest is the outline `Button` the cart drew before, with the caller's classes and testID unchanged, so `cart-quantity-input` still finds the trigger — evidence: this PR / decision 36; test "opens on a press" in `index.test.tsx`.
2. Anchored, the panel is a 3 × 5 grid of 48 px cells (Material's minimum target), 144 wide, flat (`OVERLAY_PANEL.anchored`, no padding, no shadow), with the first row's middle cell over the box so the number does not move; it overhangs the cart's edge rather than shifting (`avoidCollisions={false}`) — evidence: this PR / decision 36; decision 11 of 2026-10-16 (anchored panels carry no shadow).
3. Measured once per open: when five rows would leave the window below the box, the panel opens upward with the rows reversed, the stepper row landing on the box; `data-grow` says which — evidence: this PR / decision 36; test "grows down from the box, and up when the panel would leave the window".
4. The panel grows from the box with a 180 ms clip-path (`quantity-grow`, `quantity-grow-up` in `global.css`) and leaves on the popover's own `pop-out` — evidence: this PR / decision 36.
5. Typing replaces the number: the first digit takes the shown quantity's place, later digits append, backspace to empty shows the stored quantity again, and a lone 0 never commits — evidence: this PR / decision 36; tests in `reducer.test.ts`.
6. − and + commit at once and the panel stays open, counting from the number shown, so a second press before the store catches up still steps — evidence: this PR / decision 36; test "+ at 3 commits 4 at once".
7. − at 1 is the trash (`delete`, destructive, named by the caller's remove label): it calls `onRemove` and closes — evidence: this PR / decision 36; test "− at 1 is the trash".
8. Done, Enter, an outside press and the trigger all commit what was typed; Escape alone closes keeping the stored quantity — evidence: this PR / decision 36 ("typing on the keypad replaces the number"); tests "typing 1 2 replaces the number, and ✓ commits 12", "a press outside commits", "Escape closes and keeps the stored quantity".
9. Web: the panel, not its first key, takes focus on open, so the physical keyboard types digits, the store's decimal separator types a fraction once (up to three places), Backspace deletes, ArrowUp/ArrowDown step and Enter is Done — evidence: this PR / decision 36; test "the physical keyboard types, and Enter commits".
10. Every key has a role, an accessible name (the digit, or the caller's translated label) and a stable testID; ✓ keeps the `numpad-done-button` id the e2e suite presses — evidence: this PR; test "opens on a press, with every key named".
11. On a phone the same rows open in the app's bottom sheet: the stepper row bordered first, stretched muted keys, and Done as the filled `Button` in ✓'s place — evidence: this PR / decision 36 (the phone capture); test "on a phone it is the sheet".
