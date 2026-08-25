# WCPOS E2E Test Plan

Inventory of the Playwright web suite in `apps/main/e2e/` — 121 tests across 15 spec files.
Regenerated from the spec files themselves (see #691 for the audit that found the previous
version stale). If you add, remove, or rename tests, update this file.

The Playwright suite defines four projects (`apps/main/playwright.config.ts`):
`free-unauthenticated`, `free-authenticated`, `pro-unauthenticated`, `pro-authenticated`,
plus the opt-in `pro-cold-start` profile described below.
`auth.spec.ts` runs in the two unauthenticated projects; all other specs run in the two
authenticated projects (`*.cold.spec.ts` excluded).
Specs marked **pro only** or **free only** below skip themselves on the other variant via
`getStoreVariant()`. Authenticated specs use the `authenticatedTest` fixture from
`fixtures.ts`, which restores a saved login and lands on the POS screen.

Selector policy: select app UI via stable testIDs with `getByTestId('some-id')`. Avoid localized
text and named role selectors; structural role locators without a name are allowed (see
repo `CLAUDE.md`).

## Current Coverage

### auth.spec.ts (unauthenticated, free + pro) — 8 tests

Connect Screen:

- [x] Display URL input, Connect button, and Demo Store button
- [x] Connect button disabled when URL empty
- [x] Connect button enabled when URL entered
- [x] Invalid store URL does not show site card
- [x] Valid store URL shows site card with "Logged in users"
- [x] Add user button visible after store discovery

Unauthenticated Navigation:

- [x] Unauthenticated visit shows connect screen
- [x] Unknown routes show connect screen or not-found screen

### navigation.spec.ts (authenticated, free + pro) — 7 tests

Authenticated Navigation:

- [x] POS screen visible after login
- [x] Responsive on mobile viewport (375x667)
- [x] Responsive on desktop viewport (1920x1080)

Drawer Navigation:

- [x] All sidebar navigation buttons present (≥7: POS, Products, Orders, Customers, Reports, Logs, Support)
- [x] Navigate to Logs inside Store health
- [x] Navigate to Support page
- [x] Navigate to a page and back to POS

### header.spec.ts (authenticated) — 4 tests

Header (free + pro):

- [x] User menu trigger visible
- [x] User menu dropdown opens
- [x] Settings area opens from user menu

Upgrade Banner (free only):

- [x] Upgrade banner shown for free users

### products.spec.ts — POS products panel (authenticated, free + pro) — 12 tests

The POS product panel defaults to **grid (tile) view**; tests cover both views and the toggle.

- [x] Product tiles shown in grid view by default, with "Showing X of Y" counter
- [x] View mode toggle button visible
- [x] Switch from grid view to table view (column headers appear)
- [x] Switch from table view back to grid view
- [x] Search products by name
- [x] Clear search restores full product list
- [x] "No products found" for nonsense search
- [x] Product count updates after search
- [x] Add simple product to cart by clicking its tile (grid view)
- [x] Variable product tiles shown in grid view
- [x] Variation popover opens when clicking a variable product tile (grid view)
- [x] Add product to cart via row add-to-cart button (table view)

### product-category-filter.spec.ts — category filter pill (authenticated, free + pro) — 1 test

Added after 2026-08-23, when the POS showed "No products found" for the Clothing
category on dev-pro and nothing in CI had an opinion. The client was right — the
store's whole catalogue had lost its taxonomy to the importer's translated-header
trap — but the filter bar carried no testIDs at all, so neither a client
regression nor a rotted fixture had anywhere to show up.

- [x] Filtering by a category the SERVER says is populated: the window reaches the
      wire carrying that category, the grid stays non-empty, a known non-member
      disappears, and every rendered product is one the store puts in that category
      (a set relation — the grid is title-sorted and virtualized, so WHICH members
      are on screen is not the spec's business)

Store-agnostic: the category, the member and the negative control are all discovered
per run. A store where no category holds a product **skips with that sentence** —
which is the signal that was missing while two dev stores sat category-less.

### products-page.spec.ts — Products drawer page — 12 tests

Products Page (pro only):

- [x] Navigate to Products page, see product table with count
- [x] Stock and price columns visible (≥3 column headers)
- [x] Clicking the Name column header reorders rows (sort toggle)
- [x] Search products on Products page
- [x] Product actions menu (Edit/Sync/Delete)
- [x] Expand variable product to show variations
- [x] Variation actions menu with Edit/Sync/Delete
- [x] Collapse expanded variable product
- [x] Inline edit stock quantity: server accepts, row + REST read-back updated, stock status flips to instock (#1088)
- [x] Inline edit stock quantity: forced 403 push rejection shows red snackbar and auto-reverts the cell (#1088, #1082)

Products Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### pos-cart.spec.ts (authenticated, free + pro) — 14 tests

POS Cart:

- [x] Guest customer shown by default
- [x] Add product to cart shows Checkout button
- [x] Update quantity via numpad
- [x] Numpad accepts multiple digits without resetting
- [x] Add multiple different products
- [x] Void order clears the cart
- [x] Subtotal visible in cart totals
- [x] Cart total shown in Checkout button

POS Cart — save to server parity (live store, writes):

- [x] Plain one-product cart saves with identical totals (rate-set, cart_tax, total) and no
      divergence banner (the woocommerce-pos#1545 regression oracle; see Money-oracle
      doctrine below)

POS Cart — Add Items Menu (the cart "+" dropdown):

- [x] Dropdown shows Misc Product, Fee, and Shipping menu items
- [x] Add fee via the dropdown menu
- [x] Add shipping via the dropdown menu
- [x] Add miscellaneous product via the dropdown menu
- [x] Close the add-item dialog (Escape) without adding

### pos-money-oracle.spec.ts (authenticated, free + pro) — 6 tests

POS money oracle — save to server parity (live store, writes):

- [x] Fee line saves with identical per-rate taxes, on an amount whose tax is sub-cent
      (the order-111919 regression oracle)
- [x] Shipping line saves with identical per-rate taxes, on a sub-cent amount
- [x] Misc product priced to a sub-cent tax saves with identical per-rate taxes
- [x] Product + fee + shipping together save with identical money throughout (the
      cross-line case: `cart_tax`/`total_tax` aggregate over all three line types, so a
      per-line error that cancels on a single-line cart still shows here)
- [x] Negative fee is taxed from its OWN class — locks the POS override, NOT WooCommerce's
      apportionment (see the negative-fee note below)
- [x] Mixed-tax-class cart: standard + reduced-rate + untaxed lines in one sale, every
      line's per-rate taxes compared (needs `e2e/scripts/tax-class-fixtures.php`; skips
      with a reason on an unprovisioned store)

### pos-checkout.spec.ts (authenticated, free + pro) — 12 tests

Order Actions:

- [x] Save order to server (success toast)
- [x] Add order note
- [x] Open order meta dialog

Multiple Orders:

- [x] Create new order via tab (new cart is empty)

POS Checkout:

- [x] Open checkout modal
- [x] Order total shown in checkout (modal amount equals the cart's Pay button amount, non-zero)
- [x] Cancel checkout returns to cart
- [x] Payment disabled when the server omits the payment link
- [x] Auto-print receipt after checkout when the cart settings enable auto show/print (print button auto-triggered and disabled)

Real payment against the live store (**writes**, see "Live-store write discipline" below):

- [x] Completes a real payment and reads the order back from the store REST API: order
      exists and carries this run's label, `date_paid` is set and the status is not a
      failure state, line-item count and quantities match the cart, line-item
      `subtotal`/`total` match what the client sent, tax fields come back at full 6dp
      stored precision (#946), and **the amount charged equals the amount the checkout
      modal showed the cashier**

Payment gateway routing (top-level tests, network-stubbed):

- [x] Built-in POS gateways use the legacy webview even when `supports_checkout=true` (no contract-checkout API calls)
- [x] Falls back to the legacy webview when `supports_checkout=false`

### pos-refunds.spec.ts (pro only) — 3 tests

Two **contract** tests build an order, open `/orders/refund/:uuid`, and intercept the
refunds API to assert the submitted payload. They stub the gateway list deliberately — a
single live store advertises one capability set, so the `supports_provider_refunds`
matrix is not reachable against dev-next. Their order never reaches the server and no
payment is taken:

- [x] Refund to cash for a non-cash order submits `refund_destination=cash`, `api_refund=false`
- [x] Refund to original method (provider refunds supported) submits `refund_destination=original_method`, `api_refund=true`

One **real** test against the live store (**writes**, see below), with no stubs at all:

- [x] Completes a real payment, refunds part of it, and reads the refund back from the
      store: the order carries this run's label, `refunds[]` holds exactly the one refund,
      recorded as a negative amount at full 6dp precision

### pos-variations.spec.ts (authenticated, free + pro) — 10 tests

Variable product handling in the POS products **table view** (tests switch to table view
via the toggle if needed):

- [x] Variable products show popover (chevron) button instead of add-to-cart
- [x] Open variation popover via chevron button
- [x] Add variation to cart via popover attribute selection (success toast)
- [x] Expand link shown on variable product name
- [x] Expand variable product row to show variations
- [x] Add variation to cart via expanded row "+" button (success toast)
- [x] Collapse expanded variable product row
- [x] Add multiple variations to cart
- [x] Expanded variation row renders the image the /wcpos/v2/variations response carried
      (src read from the live payload, then asserted on that variation's row — #1577)
- [x] Adding the same variation twice increments quantity to 2

### pos-coupon-apply.spec.ts — coupon application parity (pro + writer gated) — 1 test

- [x] Create-and-find percent probe coupon → apply via cart UI → save → coupon_lines,
      discount/total/cart_tax parity, rate-set equality; banner-absence parked on
      woocommerce-pos#1548 (see Money-oracle doctrine)

### coupons.spec.ts — Coupons drawer page — 6 tests

Coupons Page (pro only):

- [x] Navigate to Coupons page, see coupon list search
- [x] Coupon data or empty state shown
- [x] Search coupons
- [x] Add coupon button on page

Coupons Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### customers.spec.ts — 12 tests

Customers in POS (free + pro):

- [x] Guest shown as default customer
- [x] Clicking customer name opens customer address dialog

Add Customer from Cart (pro only):

- [x] Add-customer menu item enabled
- [x] Open add customer dialog from cart
- [x] Customer form fields visible in dialog

Add Customer from Cart (free only):

- [x] Add-customer menu item disabled

Customers Page (pro only):

- [x] Navigate to Customers page, see search input
- [x] Customer data or empty state shown
- [x] Search customers
- [x] Add customer button on page

Customers Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### orders.spec.ts — Orders drawer page — 8 tests

Orders Page (pro only):

- [x] Navigate to Orders page, see search input
- [x] Order columns visible (≥2 column headers)
- [x] Orders data or empty state shown
- [x] Search orders
- [x] Filter pills visible
- [x] Order actions menu opens (skips when no orders exist)

Orders Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### reports.spec.ts — Reports drawer page — 6 tests

Reports Page (pro only):

- [x] Navigate to Reports page, see content
- [x] Filter pills visible
- [x] Report content shown (table or controls)
- [x] Print button present

Reports Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### settings.spec.ts (authenticated, free + pro) — 9 tests

Settings Modal:

- [x] Open settings and show page navigation
- [x] General settings page
- [x] Tax settings page
- [x] Barcode Scanning tab
- [x] Theme tab
- [x] Leave settings area (route-based; closes via back navigation)

Language Settings:

- [x] Language set in General settings; combobox opens and is searchable
- [x] Change language loads translations from CDN (jsdelivr fetch asserted)
- [x] Language persists after closing and reopening settings (no re-fetch for same locale)

### logs.spec.ts (authenticated, free + pro) — 2 tests

- [x] Logs table shown with ≥3 columns
- [x] Search logs

---

## Live-store write discipline

Most specs only read. The two "real" specs above **create orders on the shared live store**
(dev-next), which every shard and the occasional human also use. There is no ephemeral
store, so they follow one contract, implemented in `e2e/order-lifecycle.ts`:

1. **Label.** Every created order gets a globally unique run label (CI run id + attempt +
   a per-order UUID) stamped into `customer_note`. Uniqueness is per ORDER, not per file,
   so parallel shards and retries cannot collide.
2. **Assert only on your own records.** The order id comes from the push ack for the order
   under test, the ack is correlated against the checkout route's uuid, and the label is
   re-checked on every readback. No spec asserts on "the newest order" or on global counts.
3. **Clean up, and say what you made.** Cleanup runs in a Playwright **fixture teardown**
   (not a `finally`) so it still runs when a test times out, and orders are registered for
   cleanup as soon as the server acks them — not at the end of the happy path. The demo
   cashier cannot hard-DELETE, so cleanup sets the order to `cancelled` (`trash` is
   rejected); it refuses to touch any order whose note is not this run's label, never
   throws, and always prints and attaches the created order ids so a leak is traceable.

`readOrder` probes the REST API through Playwright's `APIRequestContext`, which page route
stubs cannot touch, and retries transient 5xx — dev-next is a real host under load from six
shards.

## Money-oracle doctrine: parity is the invariant, drift is an alarm

Every spec that creates or mutates an order asserts **totals parity**: the amounts the POS
rang up (line taxes, tax-line rate SET, cart_tax, order total) equal the amounts the server
recorded, and the "your store changed this order's totals" banner
(`order-totals-changed-banner`) does NOT appear on a plain sale.

This section exists because its absence cost us. The server-calc-is-truth rule ("the
server's math wins; the POS mirrors it; divergence → cashier alert") was misread as "the
server's numbers may legitimately differ, so don't compare them." An earlier
`pos-checkout.spec.ts` measured a real divergence (client tax 4.090909 → server 9.163636;
total 45.00 → 50.07) and wrote it into the spec as "dev-next applies a surcharge when the
order is paid." It was not a surcharge. It was a live bug — the v2 push create dropped
`_pos_store` before the server's tax calculation, so multi-store orders were taxed from the
site base (GB VAT 20% + compound 2% ≡ ×1.224 — exactly 45.00 → 50.07) — shipped invisible
because the one oracle that would have caught it had been talked out of the spec
(woocommerce-pos#1545).

The rules:

1. **Server-calc-is-truth is about AUTHORITY, not tolerance.** The server's answer is the
   one that counts — and on a correctly configured store it MUST equal the POS's answer.
   Both compute the same rates from the same tax location. Equality is the invariant;
   authority only decides who wins when the invariant breaks.
2. **Rate-SET parity, not just amount parity.** A tax-location bug swaps which rates apply;
   compare `tax_lines[].rate_id` sets, so a near-miss on amounts cannot slip through.
3. **Any tolerated divergence is a named, narrowly-scoped exception** in the spec, with the
   mechanism that causes it (e.g. a specific gateway fee extension) — never a blanket "the
   server may recalculate differently." If a parity assertion fails against a store, the
   default reading is REGRESSION, not environment quirk; prove the mechanism before
   loosening the oracle.

   Currently-named exceptions:

   **woocommerce-pos#1548 — CLOSED 2026-08-11, both assertions RE-ARMED.** Kept here
   as history, not as a live exception. The v2-lane acks used to serve
   `tax_lines[].tax_total` unrounded, so the totals-changed banner fired on any sale
   whose tax was not 2dp-clean, and both banner-absence assertions were parked. The
   client now emits `tax_lines` at WooCommerce storage precision (mono#1117) and both
   assertions are live again — `pos-cart.spec.ts` and `pos-coupon-apply.spec.ts`.

   This paragraph claimed they were still parked for 13 days after the issue closed.
   A named exception is a debt with an owner: when its issue closes, the doc that
   names it is part of what re-arms.

   **The microunit "tie"** (`expectTaxParity` in `order-lifecycle.ts`): tolerates a
   one-microunit (0.000001) difference on server-COMPUTED tax amounts at 6dp storage
   precision. Display money (2dp) is exact; two microunits fails.

   It was recorded as an unavoidable half-way rounding tie between PHP's float path and
   the client's decimal path. **On the line-level fields, it was not a tie — it was a
   bug, and it is fixed** (2026-08-24). WooCommerce derives a line's `total_tax` from the
   STORED per-rate array: round each rate to storage precision, THEN sum. This package
   rounded the raw multi-rate total instead — `round(a + b)` against `round(a) + round(b)`.
   Identical on a single-rate store, one microunit apart on a two-rate one. Measured on
   dev-pro: a 1.00 inclusive fee at 10% + 2.2% sent 0.108734 against the store's 0.108735,
   and EVERY such sale raised the totals-changed banner. See `sumStoredLineTax` in
   `packages/order-math/src/cart-line.ts`.

   The tolerance stays, because only the line-level source is proven eliminated — the
   2026-08-08 CI observation was on `cart_tax`, an order-level aggregate this fix does
   not touch. Treat any surviving microunit as an unexplained divergence to chase to its
   mechanism, exactly as this one turned out to be, and NOT as a known cost of doing
   business. That reading is what kept it alive for sixteen days.

4. **Parity assertions are store-agnostic by construction** — they compare the two sides of
   the same sale, never fixture values — so they belong in every order-writing spec at no
   cost to the any-store contract.
5. **Every LINE TYPE the POS can author must reach the oracle, on amounts that can
   actually fail.** Added 2026-08-24 after order 111919 on dev-free (CHECKOUT401):
   a 1.00 tax-inclusive fee at 10% pushed `fee_lines[…].taxes[6].total = 0.090000`
   against the server's `0.090909`, and the cashier got the banner on a correctly rung
   sale. The parity oracle was armed and passing throughout. It could not see it:

   - **Line-type coverage.** Every parity assertion ran on a cart of products only. Fees
     and shipping had E2E coverage that stopped at "the line appeared in the cart" — no
     save, no push, no comparison.
   - **Discriminating amounts.** Per-rate rounding is only observable when a line's tax
     is NOT a whole number of cents. A store priced 7.00 and 2.00 at 10% yields 0.70 and
     0.20 — identical under the correct rule and under the bug. The suite's fee and
     shipping unit fixtures had the same defect (10 @ 20% = 2), so 566 green unit tests
     said nothing about it either.

   A third form of the same blindness surfaced on 2026-08-24 and is worth naming
   separately: **a fixture can exist and still be unreachable.** Both dev stores carried
   `reduced-rate` and `zero-rate` tax classes with real rates behind them — and not one
   of ~2,050 published products used either, nor had any tax status but `taxable`. Every
   money assertion the suite had ever made ran on the standard class alone, and nothing
   said so. Provisioned by `e2e/scripts/tax-class-fixtures.php`; the store-side contract
   is `wcpos-infra/docs/specs/2026-08-24-dev-store-tax-profile.md`.

   And a fourth, caught by the fix for the third: **dev-pro's reduced-rate rate was
   scoped GB while its POS outlets are US:AL**, so the reduced-rate fixture rang up
   untaxed at the till and the new mixed-class spec passed on the wrong evidence. Its
   coverage assertion had accepted "more than one distinct rate set", which a taxed line
   beside an untaxed one satisfies without ever applying a second rate. It now requires
   two distinct NON-EMPTY rate sets. On a multi-store site, where the store taxes is not
   where the till is.

   `pos-money-oracle.spec.ts` closes both: it MINTS its own adversarial amounts through
   the POS UI (misc product, fee, shipping all take a cashier-entered amount) rather than
   depending on catalogue content, and then DECLARES whether the run actually produced a
   sub-cent tax component. A run that did not is reported as uncovered, not counted as
   proof — `assertDiscriminating`. New fixtures for line taxes, unit or E2E, must use an
   amount whose tax is not a whole cent.

## Cold-start profile (thin local catalogue) — #991

Every project above runs against a fully-synced tiny demo catalogue, so a query that
silently falls back to **local residents only** still passes. That blind spot is how #950
(variations search had no remote lane) and the #941–#945 filtered-browse family reached
production. The `pro-cold-start` project removes the local shortcut.

Mechanism (`e2e/cold-start.ts`, both halves deterministic — no sleeps):

1. `globalSetup` runs a **second** OAuth bootstrap with bulk catalogue sync already
   starved and `waitForCatalogue: false`, and exports it to `.auth-state/pro-cold.json`.
   The snapshot is a genuine RxDB-consistent login with empty catalogue collections.
2. Every cold test reinstalls the same route stub, so the catalogue cannot refill. Only
   the **bulk** lanes over `/wcpos/v2/products` and `/wcpos/v2/customers` are answered
   locally (empty page, huge `X-WP-Total` so the completeness gate can never claim the
   catalogue is fully resident). Requests carrying `include=`, `search=` or `sku=`, and
   the whole `/wcpos/v2/variations` route, reach the real server untouched.

Run it:

```sh
E2E_COLD_START=1 npx playwright test --project=pro-cold-start
```

Specs opt in by file name: `*.cold.spec.ts`, using `coldStartTest` instead of
`authenticatedTest`. Keep the subset small — the extra bootstrap costs a full OAuth round.

### variation-sku-search.cold.spec.ts — 2 tests

- [x] The local catalogue starts (and stays) empty — self-test for the profile
- [x] Searching a variation SKU pulls the non-resident variation from the server
      (skips with an explicit reason until `wcpos/v2/variations?search=` is deployed —
      wcpos/woocommerce-pos#1441 — and PR #987 is in the bundle; the gate probes the live
      endpoint rather than hard-coding a skip, and reuses the probe's response to
      discover a real variation SKU)

### Candidates for the same profile

- **Filtered browse** (#941–#945): tag / brand / featured / on-sale / stock pills
  against a thin DB — the exact regression class where a filtered window that never
  reached the wire looked fine locally. The CATEGORY pill is covered on the normal
  profile by `product-category-filter.spec.ts`; the remaining pills follow the same
  shape, and every pill now carries a `filter-pill-<field>` testID.
- **Customer search**: `/wcpos/v2/customers` has the same census-completeness gate as
  products, so a missing remote lane is equally invisible on a full local DB.
- **Barcode scan of a never-seen item**: the scan path resolves by SKU/barcode and must
  create remote demand; on a full catalogue it always hits locally.
- **Sort change on a large catalogue**: a re-sort must re-seed a server-ordered browse
  window rather than re-sorting the resident slice (ADR 0027 §2 / #909).
- **Infinite scroll past the cold seed**: scrolling beyond the seeded window must fetch
  the next page instead of stopping at the residents.

---

## Future Test Ideas

Lower-priority tests that would add depth but are harder to automate reliably:

- "Enter Demo Store" button triggers full OAuth flow
- Logout via user menu returns to connect screen
- Session persists across page reload
- Previously connected stores persist as site cards
- Remove site / remove user with confirmation dialogs
- Inline edit price on Products page (pro)
- Delete product with confirmation dialog (pro)
- Re-open order from Orders page (pro)
- View receipt from Orders page (pro)
- Delete order with confirmation dialog (pro)
- Apply a coupon to a cart order (pro)
- Create / edit coupon form on Coupons page (pro)
- Fill and submit new customer form (pro)
- Delete customer with checkbox confirmation (pro)
- Select orders in Reports table (pro)
- Date range filter on Orders/Reports (pro)
- Customer/Cashier filter on Orders/Reports (pro)
- Split line item into multiple rows
- Edit line item via ellipsis dialog
- Edit fee name and amount
- Remove fee/shipping from cart
- Select and assign existing customer to order
- Edit and save customer billing/shipping from cart
- Switch between multiple open orders
- Complete order with selected customer
- Full refund (not just partial) and refund-to-original-method against a real store
- Theme switching persists
- Barcode scanning adds product
- Offline indicator shown when network drops
- Tax calculations correct in cart totals
- Currency formatting matches store settings
