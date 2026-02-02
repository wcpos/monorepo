# WCPOS E2E Test Plan

## Current Coverage

### auth.spec.ts (unauthenticated, free + pro)
- [x] Display URL input, Connect button, and Demo Store button
- [x] Connect button disabled when URL empty
- [x] Connect button enabled when URL entered
- [x] Invalid store URL does not show site card
- [x] Valid store URL shows site card with "Logged in users"
- [x] Add user button visible after store discovery
- [x] Unauthenticated visit shows connect screen
- [x] Unknown routes redirect to connect screen or 404

### navigation.spec.ts (authenticated, free + pro)
- [x] POS screen visible after login
- [x] Responsive on mobile viewport (375x667)
- [x] Responsive on desktop viewport (1920x1080)
- [x] All drawer items visible on desktop (POS, Products, Orders, Customers, Reports, Logs, Support)
- [x] Navigate to Logs page
- [x] Navigate to Support page
- [x] Navigate to a page and back to POS
- [x] Active drawer item changes on navigation

### header.spec.ts (authenticated, free + pro)
- [x] User menu trigger visible
- [x] User menu dropdown opens
- [x] Settings modal opens from user menu
- [x] Online status indicator present
- [x] Upgrade banner shown for free users

### products.spec.ts — POS panel (authenticated, free + pro)
- [x] Product table shows Product and Price column headers
- [x] "Showing X of Y" counter visible
- [x] Search products by name
- [x] Clear search restores full product list
- [x] "No products found" for nonsense search
- [x] Product count updates after search
- [x] Add product to cart
- [x] Variable product rows present

### products.spec.ts — Products page (pro only)
- [x] Navigate to Products page, see product table
- [x] Stock and Price columns visible
- [x] Search products on Products page
- [x] Product actions menu (Edit/Sync/Delete)

### products.spec.ts — Products page (free only)
- [x] Upgrade page shown
- [x] View Demo button visible

### pos-checkout.spec.ts — POS Cart (authenticated, free + pro)
- [x] Guest customer shown by default
- [x] Add product shows Checkout button
- [x] Update quantity via numpad
- [x] Add multiple different products
- [x] Remove product from cart
- [x] Subtotal visible in cart totals
- [x] Cart total shown in Checkout button

### pos-checkout.spec.ts — Fees & Shipping (authenticated, free + pro)
- [x] Add fee to cart
- [x] Add shipping to cart
- [x] Add miscellaneous product

### pos-checkout.spec.ts — Order Actions (authenticated, free + pro)
- [x] Void order
- [x] Save order to server
- [x] Add order note
- [x] Open order meta dialog

### pos-checkout.spec.ts — Multiple Orders (authenticated, free + pro)
- [x] Create new order via tab

### pos-checkout.spec.ts — Checkout (authenticated, free + pro)
- [x] Open checkout modal
- [x] Order total shown in checkout
- [x] Cancel checkout returns to cart
- [x] Complete an order (process payment, see receipt)
- [x] Complete order with fee added

### customers.spec.ts — POS cart (authenticated, free + pro)
- [x] Guest shown as default customer
- [x] Add customer button visible
- [x] Customer search opens

### customers.spec.ts — Add from cart (pro only)
- [x] Add customer button enabled
- [x] Open add customer dialog from cart
- [x] Customer form fields visible in dialog

### customers.spec.ts — Add from cart (free only)
- [x] Add customer button disabled

### customers.spec.ts — Customers page (pro only)
- [x] Navigate to Customers page, see search input
- [x] Customer data or empty state shown
- [x] Search customers
- [x] Add customer button on page

### customers.spec.ts — Customers page (free only)
- [x] Upgrade page shown
- [x] View Demo button visible

### orders.spec.ts — Orders page (pro only)
- [x] Navigate to Orders page, see search input
- [x] Status and Total columns visible
- [x] Orders data or empty state shown
- [x] Search orders
- [x] Filter pills visible
- [x] Order actions menu (Edit/Re-open/Delete)

### orders.spec.ts — Orders page (free only)
- [x] Upgrade page shown
- [x] View Demo button visible

### reports.spec.ts — Reports page (pro only)
- [x] Navigate to Reports page, see content
- [x] Filter pills visible
- [x] Report summary section
- [x] Print button

### reports.spec.ts — Reports page (free only)
- [x] Upgrade page shown
- [x] View Demo button visible

### settings.spec.ts (authenticated, free + pro)
- [x] Open settings and show tabs
- [x] General settings tab
- [x] Tax settings tab
- [x] Barcode Scanning tab
- [x] Keyboard Shortcuts tab
- [x] Theme tab with theme list
- [x] Close settings modal

### logs.spec.ts (authenticated, free + pro)
- [x] Navigate to Logs page, see table
- [x] Search logs

---

## Future Test Ideas

These are lower-priority tests that would add depth but are harder to automate reliably:

- "Enter Demo Store" button triggers full OAuth flow
- Logout via user menu returns to connect screen
- Session persists across page reload
- Previously connected stores persist as site cards
- Remove site / remove user with confirmation dialogs
- Inline edit stock quantity on Products page (pro)
- Inline edit price on Products page (pro)
- Expand variable product on Products page (pro)
- Delete product with confirmation dialog (pro)
- Re-open order from Orders page (pro)
- View receipt from Orders page (pro)
- Delete order with confirmation dialog (pro)
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
- Edit customer billing/shipping from cart
- Switch between multiple open orders
- Complete order with selected customer
- Theme switching persists
- Barcode scanning adds product
- Offline indicator shown when network drops
- Tax calculations correct in cart totals
- Currency formatting matches store settings
