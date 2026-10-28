# Behaviour ledger: `keypad`

Seeded 2026-09-21 by wcpos/roadmap#360 from the component map (wcpos/roadmap#291), the register sign-off (wcpos/roadmap#287) and the scale page (wcpos/roadmap#289). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The one key (`Key`: its face, name and testID) and the grid of them, without a display or value owner; the digit rows and the separator row every keypad shares.

**Base:** `pressable-surface`; `HStack`, `Text` and `Icon`.

## Lines

1. The grid owns no value and no display, so the caller keeps its entry behaviour — evidence: map §5 (`numpad` composes it and keeps its display lines).
2. Under `shrink` the keys give way before anything else in the pane, down to the pointer floor and no further — evidence: map §5 (a height policy that gives way first).
3. An icon-only key carries a stable identifier — evidence: `numpad` line 6 as origin (`e513ffcb69`).
4. An icon-only key takes a caller-supplied accessible name; its machine value is not a name — evidence: the page-bar review on wcpos/monorepo#2188 applied here; wcpos/roadmap#360.
5. The disabled state is always an explicit boolean — evidence: `button` ledger line 1 as origin (`c99855da17`); Codex review on wcpos/monorepo#2189.
6. The digit carries the key: `text-2xl` labels and `xl` icons inside the boxed key, for cash and card keypads alike — evidence: owner walk of the pay sheet on a Pixel 10 (2026-10-13), test "lets the digit carry the key" in `packages/components/src/keypad/index.test.tsx` (since card 17: "one Key, its faces…").
7. One `Key` and one cva (`keyFace`), so a face flips in one place: `boxed` is line 6's register key (the `Keypad` grid: the tender pane, the movement sheet), `key` the price keypad's flat phone key (Paul 2026-10-24: `bg-muted`, `rounded-lg`, `min-h-ctl`, `text-xl` semibold, a press at `active:opacity-70`) on the grow keypads' phone sheet, `cell` a key under one panel's border (the anchored grow keypads, `text-lg`); a quick key is outlined, filled with the primary while lit (`aria-pressed`). Whether `boxed` gives way to `key` is Paul's ruling (line 6 is his device walk) — evidence: card 17 of the 2026-10-28 component-library review; test "one Key, its faces…".
8. One testID scheme: `<keypad testID>-key-<name>`, `keypad-key-<name>` without one; an explicit key testID wins (the price keypad's `cart-price-discount-10`); the tender keys are `checkout-keypad-key-*`, the movement keys `movement-key-*`, ✓ `keypad-key-done` — evidence: card 17 (`numpad-key-*` and `keypad-key-*` were two); test "one testID scheme…".
9. The digit rows (`DIGIT_ROWS`) and the separator row (`decimalRow`: the store's separator, 0, ⌫; 0 spans the separator's cell when there is none) are defined here once, for the tender pane, the movement sheet and both grow keypads — evidence: card 17 (three copies of the digit rows); test "without a separator there is no decimal key…".
