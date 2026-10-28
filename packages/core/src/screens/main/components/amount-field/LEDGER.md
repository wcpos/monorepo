# Behaviour ledger: `amount-field`

Seeded 2026-10-28 by card 1 of the component-library architecture review, from the eleven value-entry files it replaces (`number-input`, `editable-number`, `money-input(.web)`, `currency-input(.web)`, `percent-input(.web)`, `quantity-input(.web)`, `count-input`). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number.

**Job:** Every number a cashier or owner types: money, a percentage, a line's quantity, a count (stock, a refund's quantity). One props type (`types.ts`), two adapters: the keypads on web (`amount-field.web.tsx`), the typed field on native (`amount-field.tsx`, `typed-field.tsx`); `FormAmountField` for a react-hook-form field.

**Composes:** `@wcpos/components/{price-keypad,quantity-keypad,input,button,field-box,form/common,form/aria}`.

## Lines

1. The kind decides the places: money the store's price places (or `places`, a refund's), a percentage hundredths, a quantity six, a count whole; every commit is rounded to them, so a native field never writes a fractional stock or a third decimal of a price — evidence: card 1 (the native wrappers dropped `decimals`); tests "places" in `amount-field.test.tsx`.
2. The store's decimal and thousands separators are read once (`use-amount.ts`): typed or pasted text reads with them (both present: the thousands one groups; one `.` or `,` is the decimal either way round; a space never is), unreadable text writes nothing and the stored number shows again — evidence: `number-input` parseNumber; tests "separators".
3. One commit rule: a commit equal to the stored number is never written; a focus and leave writes nothing; a typed 0 over a blank writes 0; Escape puts the stored number back; a quantity committed as 0 is its line's `onRemove` — evidence: card 1; tests "commit, cancel, no-op".
4. A blank money or percentage is not 0: it rests as `–` (or the placeholder) and writes only what is typed; a blank quantity or count is 0 — evidence: `money-input` / `price-keypad` line 10; tests.
5. `look`: `quiet` is a grid cell's text in the order's currency on the POS (the store's elsewhere), pressed to edit in place (decision 16); `field` is the form's box with the bare number, its unit beside it. A quantity or count is always the box (decision 36) — evidence: card 1; tests "quiet".
6. Native keeps what is typed while focused and remounts the field when the stored number changes while it is not (#1957) — evidence: `number-input`; test "the field keeps what is typed".
7. `FormAmountField` hands the form the committed number in the form's own type: text when the form holds the amount as text (WooCommerce's strings), a number otherwise. `live` hands it each readable draft as typed, for a form that acts only on its verb (Add fee, Add discount, Add shipping, misc product, Process refund): a tap on a native footer button does not blur the field, and the verb must neither act on the number before it nor stay disabled over it (the refund form's Platform fork is gone) — evidence: card 1; tests "FormAmountField".
8. A native field removed while focused (a phone's settings page on Back) never blurs, so its readable, changed draft lands as a blur would, once, under line 3's rule; the cleanup is a layout effect so it runs before the form's own passive cleanups unsubscribe its writer — evidence: CodeRabbit on #3017; tests "a field removed while focused lands its draft once, before the form unsubscribes", "a field blurred, then removed, does not land its draft twice" in `amount-field.test.tsx` — platform: native.
