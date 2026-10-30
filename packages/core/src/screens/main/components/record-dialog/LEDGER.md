# Behaviour ledger: `screens/main/components/record-dialog`

Seeded 2026-10-28 by card 8 of the component-library review (the record dialog shell was copied nine times). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** The one shell every record edit takes: a side panel, the record's title, its own tab(s) then JSON, or a not-found state; an optional footer under the tabs.

**Composes:** `@wcpos/components/{dialog,empty-state,tabs,text,tree}`; the caller owns the `Dialog` root (`route` on a page, controlled with a trigger on the POS) and the form inside.

**Callers:** customers `edit/edit-customer.tsx`, coupons `edit/edit-coupon.tsx`, products `edit/product/modal.tsx` and `edit/variation/modal.tsx`, orders `edit/modal.tsx` (View and Edit tabs, opened on the route's `tab`), POS `cart/cells/edit-cart-item-button.tsx` (line item, fee, shipping) and `cart/order-sheet.tsx` (order details, with its footer).

## Lines

1. One panel size, `xl` (`w-160`), for every record. CODING_STANDARDS § Situation → overlay names the side panel but no size; the two in use were `xl` (customer, order) and `lg` (coupon, product, variation, the POS line and order panels), so the larger one is the size — evidence: report.txt card 8; `route-dialogs.test.tsx` widths.
2. A missing record is an `EmptyState` (the caller's `notFound` words) under the record's noun as the title; the message never sits in the `DialogTitle`, and the tabs and footer are not drawn — evidence: card 8 ("six dialogs put a message where a title goes"); `index.test.tsx` "renders a missing record…".
3. The title is decoded (`Text decodeHtml`): every caller builds it from a server-supplied name (customer, coupon code, product, variation, line, fee, shipping method) — evidence: `pos/cart/cells/LEDGER.md` line 9; the product and variation modals' decode.
4. The tab strip sits under the header inset `mx-4` and the content follows it with no gap of its own: the POS panels' `gap-4` is gone, the page panels' layout (#1975) is the one shape — evidence: card 8 ("the POS four add gap-4 — the shell decides").
5. JSON is always the last tab. `initialTab` opens the requested tab when the dialog shows it, otherwise the first (a read-only order asked for Edit opens on View) — evidence: `orders/edit/modal.test.tsx`; `index.test.tsx` "opens a tab list on the requested tab…".
6. `side` is `right` unless the caller passes one; the POS passes `usePanelSide('cart')` with the `pos` portal host — evidence: `pos/contexts/overlay-side/LEDGER.md` line 3.
7. ~~Replaces the surviving half of line 6: the panel opens from the right on every screen and `side` is not a prop; the caller passes the portal host (the POS passes `pos`) — evidence: `packages/components/src/dialog/LEDGER.md` line 28; `index.test.tsx` "opens on the right at the one size (host %s)" — platform: all.~~ — **struck 2026-10-30**: added by #3118 as the surviving half of line 6; line 6 is restored by fix/side-panels-register-family-only, so this duplicates it
