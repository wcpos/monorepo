# Behaviour ledger: `tile`

Created 2026-10-17 by Phase F of the 2026-10-16 component-consistency board (decision 11). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A pressable tile the cashier hits by position: a denomination key, a payment method, a split option, a register movement, a theme. Equal width comes from the grid it sits in.

**Not its job:** a bordered choice laid out as a row (`list-item`, which reads this component's `TILE_SURFACE`), a flush list row (`list-row`), a button (`button`).

**Base:** React Native Pressable, `usePointer`.

## Lines

1. The surface is `TILE_SURFACE` (`lib/tile-surface.ts`): `bg-card`, hairline `border-border`, `rounded-lg` (8 pt), a press on `bg-muted`, a hover on `bg-muted` on a fine pointer only; `list-item` reads the same recipe — evidence: board decision 11 ("8 (`rounded-lg`) on every control, tile and panel"; "Tile (denomination, split item, theme, store card, payment method)"); test "is a card with a hairline border…" in `index.test.tsx`.
2. Two sizes: `tile` (`size-tile`, the 64 pt square key) and `auto` (`min-h-tile`, a column of icon and label, 64 pt or taller) — evidence: the token sheet's 64 tile height (`--spacing-tile`), CODING_STANDARDS § Design 2 ("Keys and tiles the cashier hits every sale … are at least 56 pt tall"); test "has a 64 pt square key…".
3. `selected` is the primary border on `bg-muted` with `aria-selected`; the label keeps its colour — evidence: the tender pane's payment-method tiles (`border-primary bg-muted`) and the store picker, which it replaced; the split options' `outline-primary` Button variant was deleted with it; test "marks the picked tile…".
4. `dashed` is the add-another tile: a dashed border and no surface — evidence: the auth screen's add-user button; test "has a dashed add-another tile…".
5. Its children are plain: a tile sets no text style, so a label says its own weight (`font-medium` on the labels that came from outline Buttons) — evidence: the screen suites that mock `@wcpos/components/text` with `Text` alone, which a context provider here would break.
6. Disabled is `opacity-50` and refuses the press — evidence: CODING_STANDARDS § Design 5; test "presses, and dims and refuses a press…".
7. A tile without `onPress` is no tab stop (`tabIndex={-1}`; react-native-web's Pressable ignores `focusable`); `aria-selected` is left off a `radio` by either role prop, which carries `aria-checked` — evidence: the same review on `list-row` (CodeRabbit on #2640); test "is no tab stop without an action…".
8. A press gives the same light haptic on native as a Button (`Haptics.impactAsync(Light)`, not when disabled; `disableHaptics` opts out), so the payment-method, split and register tiles that were Buttons keep their feedback — evidence: `button/index.tsx` handlePress; Codex on #2641; test "gives the light press haptic on native…".
