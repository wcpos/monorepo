# Behaviour ledger: `list-row`

Created 2026-10-17 by Phase F2 of the 2026-10-16 component-consistency board (decision 11). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** One flush row of a list: a hairline under it, leading / body / trailing, a pressed and hovered state, and an optional current-row mark. The management lists' phone rows, closures, browse terms, open orders, the cart note, a short choice list.

**Not its job:** a bordered choice card in a picker (`list-item`), a navigation entry (`nav-item`), a tile (`tile`).

**Base:** React Native Pressable/View, `usePointer`.

## Lines

1. A row is flush: `border-b` hairline, no radius, `px-3 py-2`, body `min-w-0 flex-1` between `leading` and `trailing` so the body's text truncates and the amounts never do — evidence: the four management phone rows (`{customers,products,coupons,orders}/row.tsx`) that it replaced, each `border-border active:bg-muted min-h-14 flex-row items-center gap-3 border-b px-3`; board decision 11 ("Every hand-rolled pressable becomes a component: ListRow"); test "is a hairline-ruled row…" in `index.test.tsx`.
2. Two sizes: `default` (`min-h-14`, 56) for a two-line data row, `sm` (`min-h-row`, 44) for a one-line row, the open orders list and a short choice list — evidence: the token sheet's 44 row height (`--spacing-row`), CODING_STANDARDS § Design 2 (44 minimum); test "has 44 for a one-line row".
3. A press shows `bg-muted`; so does a hover, on a fine pointer only (a coarse pointer keeps a hover after the tap) — evidence: CODING_STANDARDS § Design 2 ("A press shows a visible pressed state within 100 ms", "No hover-only affordances"), `nav-item` line 1 for the fine-pointer gate; test "keeps hover off a coarse pointer…".
4. `selected` marks the current row: `bg-muted` and a 2 pt primary bar on the left edge; `selected={false}` keeps the bar's room transparent so the list's content lines up; unset draws no bar. It sets `aria-selected`, except on a `radio`, which carries `aria-checked` itself — evidence: the open orders list's current-order style (`open-orders-list.tsx`, board §7); test "paints the selected row…" and "leaves a radio its checked state…".
5. A disabled row is dimmed (`opacity-50`) and does not press — evidence: the closures list's offline-unavailable rows; CODING_STANDARDS § Design 5 ("Unavailable options are folded or dimmed"); test "presses, and a disabled row…".
6. A row with `onPress` is a `button` unless the caller names another role; a row without one has no role — evidence: the customers and coupons rows, which are buttons only when the cashier can edit; test "is no button without an action".
