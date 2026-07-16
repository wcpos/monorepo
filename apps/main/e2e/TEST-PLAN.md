# WCPOS E2E Test Plan

Inventory of the Playwright web suite in `apps/main/e2e/` — 119 tests across 15 spec files.
Regenerated from the spec files themselves (see #691 for the audit that found the previous
version stale). If you add, remove, or rename tests, update this file.

The suite defines four Playwright projects (`apps/main/playwright.config.ts`):
`free-unauthenticated`, `free-authenticated`, `pro-unauthenticated`, `pro-authenticated`.
Individual specs are limited by `testMatch`/`testIgnore`: `auth.spec.ts` runs only in the
two unauthenticated projects, while all other specs run in the two authenticated projects.
Specs marked **pro only** or **free only** below skip themselves on the other variant via
`getStoreVariant()`. Authenticated specs use the `authenticatedTest` fixture from
`fixtures.ts`, which restores a saved login and lands on the POS screen.

Selector policy: use stable `testID("some-id")` selectors for app UI. Avoid localized
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
- [x] Navigate to Logs page
- [x] Navigate to Support page
- [x] Navigate to a page and back to POS

### header.spec.ts (authenticated) — 4 tests

Header (free + pro):

- [x] User menu trigger visible
- [x] User menu dropdown opens
- [x] Settings modal opens from user menu

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

### products-page.spec.ts — Products drawer page — 10 tests

Products Page (pro only):

- [x] Navigate to Products page, see product table with count
- [x] Stock and price columns visible (≥3 column headers)
- [x] Clicking the Name column header reorders rows (sort toggle)
- [x] Search products on Products page
- [x] Product actions menu (Edit/Sync/Delete)
- [x] Expand variable product to show variations
- [x] Variation actions menu with Edit/Sync/Delete
- [x] Collapse expanded variable product

Products Page (free only):

- [x] Upgrade overlay shown
- [x] View Demo button visible

### pos-cart.spec.ts (authenticated, free + pro) — 13 tests

POS Cart:

- [x] Guest customer shown by default
- [x] Add product to cart shows Checkout button
- [x] Update quantity via numpad
- [x] Numpad accepts multiple digits without resetting
- [x] Add multiple different products
- [x] Void order clears the cart
- [x] Subtotal visible in cart totals
- [x] Cart total shown in Checkout button

POS Cart — Add Items Menu (the cart "+" dropdown):

- [x] Dropdown shows Misc Product, Fee, and Shipping menu items
- [x] Add fee via the dropdown menu
- [x] Add shipping via the dropdown menu
- [x] Add miscellaneous product via the dropdown menu
- [x] Close the add-item dialog (Escape) without adding

### pos-checkout.spec.ts (authenticated, free + pro) — 11 tests

Order Actions:

- [x] Save order to server (success toast)
- [x] Add order note
- [x] Open order meta dialog

Multiple Orders:

- [x] Create new order via tab (new cart is empty)

POS Checkout:

- [x] Open checkout modal
- [x] Order total shown in checkout (cancel + process payment buttons visible)
- [x] Cancel checkout returns to cart
- [x] Complete an order (process payment, receipt or POS screen appears)
- [x] Auto-print receipt after checkout when the cart settings enable auto show/print (print button auto-triggered and disabled)

Payment gateway routing (top-level tests, network-stubbed):

- [x] Built-in POS gateways use the legacy webview even when `supports_checkout=true` (no contract-checkout API calls)
- [x] Falls back to the legacy webview when `supports_checkout=false`

### pos-refunds.spec.ts (pro only, network-stubbed) — 2 tests

Both tests create a completed order, open `/orders/refund/:uuid`, and intercept the refunds
API to assert the submitted payload:

- [x] Refund to cash for a non-cash order submits `refund_destination=cash`, `api_refund=false`
- [x] Refund to original method (provider refunds supported) submits `refund_destination=original_method`, `api_refund=true`

### pos-variations.spec.ts (authenticated, free + pro) — 9 tests

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
- [x] Adding the same variation twice increments quantity to 2

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

### settings.spec.ts (authenticated, free + pro) — 10 tests

Settings Modal:

- [x] Open settings and show tabs
- [x] General settings tab
- [x] Tax settings tab
- [x] Barcode Scanning tab
- [x] Keyboard Shortcuts tab
- [x] Theme tab
- [x] Close settings modal (route-based; closes via back navigation)

Language Settings:

- [x] Language set in General settings; combobox opens and is searchable
- [x] Change language loads translations from CDN (jsdelivr fetch asserted)
- [x] Language persists after closing and reopening settings (no re-fetch for same locale)

### logs.spec.ts (authenticated, free + pro) — 2 tests

- [x] Logs table shown with ≥3 columns
- [x] Search logs

---

## Future Test Ideas

Lower-priority tests that would add depth but are harder to automate reliably:

- "Enter Demo Store" button triggers full OAuth flow
- Logout via user menu returns to connect screen
- Session persists across page reload
- Previously connected stores persist as site cards
- Remove site / remove user with confirmation dialogs
- Inline edit stock quantity on Products page (pro)
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
- Refund flow end-to-end against a real store (current tests stub the refunds API)
- Theme switching persists
- Barcode scanning adds product
- Offline indicator shown when network drops
- Tax calculations correct in cart totals
- Currency formatting matches store settings
