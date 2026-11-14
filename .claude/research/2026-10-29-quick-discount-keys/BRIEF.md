# Brief: the Quick Discounts setting is the price keypad's own key row

Lane: `next` (branch `feat/quick-discount-keys`, worktree
`/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/quick-discount-keys`, based on `af4e78c761`,
deps installed). Ruling: Paul 2026-10-29, "yes! B is perfect!", on
`~/Projects/wcpos-handoffs/quick-discounts-setting-2026-10-29.html` (section B and "Every state of B").
Polish phase on `next`: no E2E, no screenshots, no gallery story; cheap unit tests of the logic, typecheck
and lint green, one review pass.

## What the owner sees

In the Cart Settings side panel (`packages/core/src/screens/main/pos/cart/ui-settings-form.tsx`) the row under
the label "Quick Discounts" is no longer a text field holding `5,10,15,20`. It is the price keypad's own
quick-key row: three cells in one 48 px tall, 8 px radius, hairline-bordered row, hairlines between the
cells, each cell reading the key exactly as the cashier sees it on the price keypad: `−5%`, `−10%`, `−15%`
(the store's decimal separator: `−12,5%` on a comma store). An empty slot reads `–` in muted ink, like a
blank sale price.

Tapping a cell lights it (the keypad key's lit state, `bg-primary`) and the percent keypad grows beneath it,
exactly the keypad every percentage field already grows on web: the display row holding the draft, digits,
the separator, 0, ⌫, ✓. Typing replaces the number; ✓ or Enter saves; Esc keeps the old key. Typing `0`
clears the slot (the keypad's own remove, see below). A value above 100 is refused: the slot keeps its old
key and the help line under the row becomes the refusal sentence until the next accepted commit.

Help line under the row: "As the cashier sees them on the price keypad. Tap a key to change it."
With no keys at all: "No quick keys. The price keypad shows the digits only."

Native keeps the plain typed percent field per slot (decision 16): three `TypedField`s in the same row.

## Why (for the PR body)

The comma list could not hold `12,5` on a comma-locale store (it split on the comma), accepted four values
and drew three, dropped typos silently, and showed neither a percent nor the cashier's keys. Any
percentage is legal (12.5, 3.33, 50). The cap of three is the keypad's (`QUICK_KEYS` in
`packages/components/src/price-keypad/index.tsx`); the form draws that many slots.

## The pieces, all of which exist (read each before editing)

- `packages/components/src/price-keypad/index.tsx`: `PriceKeypad` rests its trigger as a ghost `Button`
  (quiet text) or, with `field`, as a `PressableSurface` wearing `fieldBox()`. `labels.discountKey(percent)`
  gives `−12,5%`, `labels.discount(percent)` the accessible "Discount (12,5%)". `QUICK_KEYS = 3`.
- `packages/components/src/keypad/index.tsx`: `Key` with `face="cell"` is the keypad's own cell face
  (`web:hover:bg-muted active:bg-muted`); `on` lit = `bg-primary` + `text-primary-foreground text-sm`,
  `on === false` = `text-primary text-sm`. It spreads the rest of its props onto `PressableSurface`, so as
  a `PopoverTrigger asChild` child it receives the trigger's press.
- `packages/core/src/screens/main/components/amount-field/`: `AmountField` (web: `amount-field.web.tsx`
  passes `field={props.look !== 'quiet'}` to `PriceKeypad`; native: `amount-field.tsx` renders
  `TypedField` for every `look` but `quiet`), `types.ts` (`look?: 'quiet' | 'field'`), `use-amount.ts`
  (`kind: 'percent'` → `PERCENT_PLACES` = 2 places, the store's separator; `commit(0)` calls `onRemove`
  when given; a commit resolving `false` is forgotten so it can be re-sent).
- `packages/core/src/screens/main/pos/cart/cells/ensure-number-array.ts`: reads the setting as a comma string
  OR an array, keeps 0 < n ≤ 100. `price.tsx` and `regular_price.tsx` pass its result to the cart keypads.
  Unchanged by this brief.
- `packages/core/src/screens/main/pos/cart/ui-settings-form.tsx`: the form; `schema` has
  `quickDiscounts: z.string().optional()` with the array line commented out above it; `useFormChangeHandler`
  patches only user-initiated changes.
- Labels: `common.quick_discounts` ("Quick Discounts", via `getUILabel('quickDiscounts')`),
  `pos_cart.quick_discounts_help`, `pos_cart.discount_percent_invalid` ("Enter a percentage above 0 and up to
  100") in `packages/core/src/contexts/translations/locales/en/core.json`. New keys go in that file as
  literal `t('…')` keys (the lint ratchet reads literal keys only).

## Changes

1. **`PriceKeypad` rest face.** Replace the `field?: boolean` prop with `rest?: 'text' | 'field' | 'key'`
   (default `'text'`; `'field'` is today's `field`). `'key'` rests the trigger as
   `<Key face="cell" …>` filling its cell (full width and height, text centred) with `text` =
   `labels.discountKey(value)` and `label` = `labels.discount(value)` when `value` is a number, else
   `placeholder ?? '–'` in `text-muted-foreground` (add `textClassName?: string` to `Key`, merged into its
   `Text`'s className, if nothing simpler serves). `on` = the keypad is open (lit while editing), so the
   trigger's `on` is `false` at rest (primary ink) for a value and `undefined` for a blank. The display
   row for `'key'` is inset like `'field'` (`px-3`). Update `field.test.tsx` to `rest="field"` and extend it
   with the key face: rests as the key text, blank rests muted `–`, lit while open. Ledger line 14's
   wording changes from `field` to `rest="field"`; add line 17 for the key face with the evidence above.
2. **`AmountField` look.** `types.ts`: `look?: 'quiet' | 'field' | 'key'` with one doc line ("`key`: the
   price keypad's own quick-key cell, for the Quick Discounts setting"). `amount-field.web.tsx` maps
   `look` to `rest` (`quiet` → `text`, `field`/undefined → `field`, `key` → `key`). Native needs no change
   (`key` already falls to `TypedField`); say so in a comment where `look` is read. Extend
   `amount-field.web.test.tsx` (the `rest` the mock keypad receives for each look) and
   `amount-field.test.tsx` (native `key` renders the typed field).
3. **`QuickDiscountKeys`** at `packages/core/src/screens/main/pos/cart/quick-discount-keys.tsx`:
   `{ value: number[] | string | undefined; onChange: (next: number[]) => void; label: string; testID?: string }`.
   Slots = `ensureNumberArray(value).slice(0, QUICK_KEYS)` (export `QUICK_KEYS` from the price keypad);
   slot `i` holds `slots[i]` or blank. The row: `View` `border-border bg-card h-12 flex-row overflow-hidden
   rounded-lg border`, each cell `flex-1`, `border-border border-l` from the second. Each cell is
   `<AmountField kind="percent" look="key" value={slots[i]} onCommit={…} onRemove={…}
   testID={`${testID}-${i}`} aria-labelledby={labelNativeID} />`. A commit of `n`: if `n > 100`, show the
   refusal and return `false`; else `onChange` with the slots after the change, blanks dropped (so setting
   slot 2 of `[5, 10]` to 12.5 writes `[5, 10, 12.5]`; clearing slot 0 of `[5, 10, 15]` writes `[10, 15]`
   and the row redraws with the third slot blank). `onRemove` clears the slot (a typed 0 is the keypad's
   own remove, so 0 is never refused; it empties the slot). Label, aria and message as
   `form-amount-field.tsx` does them (`FormItem`, `FormLabel` with `nativeID`, `useFormControlAria`; the
   label press focuses slot 0). Under the row one `FormDescription`: the help sentence, the "no keys"
   sentence when every slot is blank, or the refusal sentence (in `FormMessage`'s `text-bad` ink) until the
   next accepted commit. No sort: slot order is key order.
4. **The form.** `ui-settings-form.tsx`: `quickDiscounts: z.array(z.number()).max(3).optional()` (delete the
   commented line and the string line); the `FormField` renders `<QuickDiscountKeys value={field.value}
   onChange={field.onChange} label={getUILabel('quickDiscounts')} testID="cart-setting-quick-discount" />`.
   A store still carrying the legacy string reads it through `ensureNumberArray` inside the component;
   nothing is written at mount (the change handler patches user changes only); the first user change
   writes the array. Delete `pos_cart.quick_discounts_help`'s old sentence: the key keeps its name with the
   new text "As the cashier sees them on the price keypad. Tap a key to change it."; add
   `pos_cart.quick_discounts_none`: "No quick keys. The price keypad shows the digits only." The refusal
   reuses `pos_cart.discount_percent_invalid`.
5. **Tests** (new): `packages/core/src/screens/main/pos/cart/quick-discount-keys.test.tsx` (jsdom, mock
   `../../components/amount-field` the way `ui-settings-form.test.tsx` mocks its controls): three slots from
   `[5, 10]` with the third blank; a legacy `"5,10,15,20"` draws 5 · 10 · 15; commit on slot 2 writes
   `[5, 10, 12.5]`; remove on slot 0 writes `[10, 15]`; 150 is refused (`false`, `onChange` not called, the
   refusal sentence shown, cleared by the next accepted commit); all blank shows the "no keys" sentence.
   Update `ui-settings-form.test.tsx`'s mocks so the form renders (mock `./quick-discount-keys` as a
   labelled stub) and its label assertion still holds.

## Verification (from the package directories; one suite at a time; never the whole core suite)

```
cd packages/components && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec jest --maxWorkers=2 --coverage=false src/price-keypad src/keypad
cd packages/core && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec jest --maxWorkers=2 --coverage=false src/screens/main/components/amount-field src/screens/main/pos/cart/quick-discount-keys.test.tsx src/screens/main/pos/cart/ui-settings-form.test.tsx src/screens/main/pos/cart/cells/ensure-number-array.test.ts src/screens/main/pos/cart/cells/read-only.test.tsx src/screens/main/contexts/ui-settings src/seam.test.ts
cd apps/main && pnpm typecheck --force
pnpm run lint   (from the worktree root; the i18n literal-key fence and the text ladder run here)
```

Before any suite: `pgrep -fl jest` in its OWN command must print nothing. Re-run every named file after the
last commit.

## Budget and stops

Up to **300 ADDED production lines, counted after prettier** (tests, the ledger and this brief excluded).
The deletions this brief names (the `field` prop, the old schema line, the old help text) are authorised and
do not count. Stop and write `STOP.md` in this folder instead of exceeding it. Do not touch `price.tsx`,
`regular_price.tsx`, `ensure-number-array.ts`, the grow keypad or the reducers. No new env vars, no new
constants without a one-line why. No `New as Old` import aliases. Commit in this worktree only, by explicit
path; include this brief in the first commit. Do not push and do not open a PR: report back with the
commit SHAs, the test output summary and anything you judged differently from this brief and why.
