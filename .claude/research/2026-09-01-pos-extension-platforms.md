# Prior-art: POS and app extension platforms

- **Ticket**: wcpos/roadmap#124 (wayfinder map #120 — App extensibility)
- **Date**: 2026-09-01
- **Question**: What do existing POS and adjacent app platforms teach about extension architecture, for a dogfood-first WCPOS extensibility platform (first-party extensions now, public third-party API later)?
- **Method**: primary developer docs only (shopify.dev, developer.squareup.com, docs.clover.com, doc.toasttab.com, odoo.com/documentation, developer.wordpress.org, developer.woocommerce.com), surveyed 2026-09-01 via three parallel research passes. Contracts, not marketing.

---

## 1. Shopify POS UI extensions

**UI registration — the targets model.** An extension is three parts: *targets* (where it renders), *target APIs* (what it gets, scoped per target), *web components* (what it may draw). Targets follow a per-surface triple — `.block.render` (inline block), `.action.menu-item.render` (menu button), `.action.render` (the modal that button opens) — across surfaces: home smart grid (`pos.home.tile.render` / `pos.home.modal.render`), product-details, customer-details, order-details, draft-order-details, register-details, post-purchase, cart line-item details, plus a no-UI background target `pos.app.ready.data` (read-only cart observer). Declared in `shopify.extension.toml`: `api_version`, then one `[[extensions.targeting]]` block per target mapping `target` → `module`, plus feature flags like `runs_offline = true`. One tile component max per tile target; the component allowlist is target-type dependent. ([targets index](https://shopify.dev/docs/api/pos-ui-extensions/latest/targets), [overview](https://shopify.dev/docs/api/pos-ui-extensions/latest))

**Rendering model — remote-rendered, not webview.** Code is Preact/TSX, but elements are Shopify's Polaris-derived web components (`<s-tile>`, `<s-button>`, …) built on **remote-dom**; the host POS renders them as native iOS/Android UI. No arbitrary DOM/HTML; bundle capped at **64 KB**, enforced at deploy. The sibling checkout UI extensions document the isolation explicitly: each runs in a Web Worker sandbox with no `window`/DOM, limited globals, network gated behind a capability ([checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions)). The POS docs describe remote-dom + allowlist but don't state a worker sandbox — documented for checkout, inferred for POS.

**Data context.** Contextual APIs vary by target (Cart, Cart Line Item, Customer, Order, Draft Order, Product) plus standard APIs (Session, Action, Navigation, Toast, Locale, Product Search). The **Cart API** is the mutation surface: `current` is a readonly signal; writes go through curated methods — `addLineItem`, `addCustomSale`, `applyCartDiscount`, `setLineItemDiscount`, `setCustomer`, properties, `setAttributedStaff`, `bulkCartUpdate` — and callers must check `cart.editable` and handle rejection by business rules/oversell protection. ([Cart API](https://shopify.dev/docs/api/pos-ui-extensions/latest/apis/cart-api)) Auth: `shopify.session` (shop, location, staff, device, currency, posVersion) with `getSessionToken()` returning an OIDC token **for your backend only**; **Direct API access** via `fetch('shopify:admin/api/graphql.json')` hits Admin GraphQL with automatic auth, gated by declared access scopes. ([Session API](https://shopify.dev/docs/api/pos-ui-extensions/latest/target-apis/standard-apis/session-api))

**Permissions/review/distribution.** Scopes declared in app TOML; App Store review for public listing; extension-only apps (all code on-device, no backend) are restricted to custom distribution. `shopify app deploy` creates an app version replacing the active one for all installs. Merchants place tiles on the smart grid themselves.

**Versioning.** Quarterly date-named API versions, ≥12 months support, pinned per-extension via `api_version` in the TOML. Enforced hard: the CLI blocks deploys targeting versions >12 months old, and POS 9.31+ **stops running** extensions on unsupported API versions at runtime ([changelog](https://shopify.dev/changelog/end-of-compatibility-for-old-pos-ui-extensions-versions)).

**Hardware.** Extensions get narrow capability APIs: Printing (`getPrinters()`/`print()`), Scanner (subscribable scan events), Cash Drawer (`open()`, fire-and-forget, no state read), PinPad, Camera, Device, Connectivity, Storage (100 entries/extension). **Card readers/payment capture are withheld** — payment is host-only.

**History.** POS Links / cart app extensions / webview embeds were deprecated effective 2025-02-28 in favour of UI extensions (native rendering, faster load, iOS/Android parity); the webview embed survives only as a migration escape hatch. ([changelog](https://shopify.dev/changelog/pos-legacy-extensions-will-be-deprecated-in-february-2025)) Lesson: the first extension model (deep-link into a webview) got replaced wholesale within a few years.

---

## 2. Square — "your app is the POS; Square mediates payments and hardware"

**No third-party UI inside Square POS.** There is no plugin surface in the Square POS app. Four integration lanes, all of which keep foreign code off Square's register:

1. **Point of Sale API** — app-switching deep links: your app builds a charge request, the OS switches to Square POS, the seller pays in Square's UI, control returns via callback URL. Custom amounts only, no itemization, no sandbox; you must track state across the app switch yourself. ([docs](https://developer.squareup.com/docs/pos-api/what-it-does))
2. **Mobile Payments SDK** — Square's payment flow embedded inside *your* app (`AuthorizationManager`, `ReaderManager`, `PaymentManager`, `SettingsManager`); offline payments; unattended kiosk use prohibited; each SDK version supported ~2 years post-GA. Successor to **Reader SDK**, retired 2025-12-31. ([MPS](https://developer.squareup.com/docs/mobile-payments-sdk))
3. **Terminal API** — server-side hardware mediation: pair a Terminal via the Devices API device-code flow, backend creates a `TerminalCheckout` naming the device, Square's cloud routes it, outcome arrives by webhook. Per-request screen control is declarative (skip tip/signature screens); Terminal *actions* (beta) offer a fixed template vocabulary (signature, data collection, menu selection, QR) — the closest Square gets to third-party UI, and it's templates, not rendering. ([Terminal API](https://developer.squareup.com/docs/terminal-api/overview))
4. **Web Payments SDK** — browser tokenization into a `source_id` for the Payments API.

**Permissions/review/versioning.** OAuth scopes are resource-domain grained (`PAYMENTS_WRITE` spans Payments, Refunds, Cards, Terminal). App Marketplace requires prior partner approval — **five active sellers** already using the app — then QA and listing review. Versioning: `YYYY-MM-DD` versions across all APIs, pinned per-app, overridable per-request via `Square-Version` header; ~monthly releases; Beta → GA → Deprecated → Retired, breaking changes only in new dated versions. ([versioning](https://developer.squareup.com/docs/build-basics/versioning-overview))

---

## 3. Clover — the only platform hosting foreign code on the register

**On-device apps.** Third-party Android APKs run on the Clover device alongside Register. The price of hosting foreign code: **install-time-only permissions** (no runtime grants even on modern Android), no Google Mobile Services, `targetSdkVersion` frozen at ≤25 for approval, permission changes force merchant **uninstall/reinstall** after re-review, APKs can never be deleted (only superseded), HIPAA-flagged merchants blocked from apps requesting customer/inventory scopes, and hardware End-of-App-Update cliffs (Gen 1 devices frozen 2026-05-15). Permissions are REST-category read/write pairs, each requiring a written justification reviewed by DevRel. Revenue: 70/30 split, all monetization through Clover rails. ([permissions](https://docs.clover.com/dev/docs/permissions), [SDK versions](https://docs.clover.com/dev/docs/setting-android-sdk-versions))

**Register integration** is Android intents/broadcasts — the one real example of a third party getting a slot in a vendor's checkout flow ([intents-and-broadcasts](https://docs.clover.com/dev/docs/intents-and-broadcasts)):
- Activity intents (you → Clover): launch Clover screens with `EXTRA_ORDER_ID` etc.
- Broadcasts (Clover → you): `ACTION_ORDER_CREATED`, `ACTION_PAYMENT_COMPLETED`, batch closeouts.
- **Action intents (Clover → you, as UI)**: declare `ACTION_MODIFY_ORDER` in your manifest and Clover renders a button with your label on its own payment screen; tapping launches *your activity* with the order ID; you mutate the order and hand back to Clover to tender. Launch-my-activity, not draw-inside-their-screen.

**Data**: bound-service connectors (`OrderConnector`, `InventoryConnector`, `MerchantConnector`) plus ContentProvider cursors. **Hardware**: mediated through SDK classes — `PrintJob.print()`, `ReceiptRegistration` for appended receipt content, `BarcodeScanner`, cash-drawer API; never the metal.

**Semi-integration** (your POS keeps its UI, Clover device is a payment peripheral): USB Pay Display, Secure Network Pay Display (LAN `wss://`, no OAuth but Clover CA trust), Cloud Pay Display (Clover-relayed WSS, OAuth mandatory), and the SDK-less **REST Pay Display API** (payment-only, LAN offline payments supported in US). ([pay-display-apps](https://docs.clover.com/dev/docs/pay-display-apps))

---

## 4. Toast — server-side only, review-heaviest

**Partners cannot render UI in or run code on the Toast POS.** The entire partner surface is REST APIs (orders, menus, labor, stock, config, kitchen, cash) plus webhooks — and for gift cards/loyalty/tender, **outbound APIs**: the Toast POS calls *your* HTTPS endpoint mid-transaction and you return a predefined response. That inversion is Toast's substitute for on-device logic. ([API overview](https://doc.toasttab.com/doc/devguide/apiOverview.html))

**Auth**: OAuth client-credentials plus a `Toast-Restaurant-External-ID` header per request; restaurants grant access via Toast Partner Connect (grant propagation can take 15 minutes). **Scopes** are genuinely fine-grained (`orders:read` excludes guest PII; channel-scoped clients read only their own orders). **Versioning**: no dated version header; 90 days' notice for breaking changes, and since 2026-07-20 **enums are open** — new values appear without notice, consumers must tolerate unknowns. **Review**: eight gates including compliance/legal sign-off, a one-hour live certification call, single-restaurant alpha, 3–5-location beta. **Hardware**: read-only device inventory endpoint only. ([scopes](https://doc.toasttab.com/doc/devguide/apiScopes.html), [process](https://doc.toasttab.com/doc/devguide/integrationDevProcess.html))

---

## 5. Odoo POS modules — the cautionary tale plus one great hardware pattern

**No POS developer reference exists.** Odoo's official frontend docs cover only generic primitives (registries, `patch()`, OWL, assets); the POS-specific registry categories (screens, control buttons, payment methods) are undocumented source-reading territory. ([frontend reference](https://www.odoo.com/documentation/18.0/developer/reference/frontend.html))

**UI registration**: (a) **registries** — ordered key/value maps, `registry.category(name).add(key, value, {sequence, force})`, with `force` allowing any module to overwrite any key; (b) **`patch()`** from `@web/core/utils/patch` — in-place monkey-patching of any class/prototype, affecting already-created instances; constructors unpatchable (hence the `setup()` convention). QWeb templates extended by XPath inheritance; asset bundles support `remove`/`replace` directives, so a module can delete another module's files. POS JS must land in `point_of_sale._assets_pos` — using the wrong bundle fails silently. ([patching](https://www.odoo.com/documentation/17.0/developer/reference/frontend/patching_code.html), [registries](https://www.odoo.com/documentation/17.0/developer/reference/frontend/registries.html))

**Data**: POS preloads a big dataset for offline; modules widen it by overriding Python `_load_pos_data_fields`/`_load_pos_data_models`. This loader API has been **rewritten three times in four releases** (≤15 JS-side, 16 `_pos_ui_models_to_load`, 17/18 `_load_pos_data*`).

**Sandboxing: none.** Modules are trusted server-installed Python+JS with arbitrary install hooks; no permission model, no conflict detection — two modules patching the same method silently order by install sequence.

**Hardware — the IoT Box pattern.** A separate LAN device mediates printers/scales/terminals/scanners. Modules ship `iot_handlers/` (interfaces + drivers) that the box **downloads from the Odoo server at boot** — drivers are distributed as content, not device installs. The browser talks to the box directly over LAN: `new DeviceProxy({iot_ip, identifier})`, `.action(data)` browser→box, `.add_listener(cb)` box→browser via longpolling. Cloud terminals (Adyen/Stripe) bypass the box via vendor cloud. ([connect_device howto](https://www.odoo.com/documentation/18.0/developer/howtos/connect_device.html))

**Versioning**: modules pinned to annual majors, three years' support, **no deprecation shims** — even `patch()`'s own signature changed incompatibly between 16 and 17. Annual paid migration is effectively the ecosystem's business model.

---

## 6. WordPress / Gutenberg / WooCommerce — the idioms WCPOS's future devs already know

**SlotFill.** `createSlotFill` pairs a host-placed `Slot` with plugin-supplied `Fill`s; plugins register via `registerPlugin('name', { render })`. Named slots: `PluginSidebar`, `PluginDocumentSettingPanel`, `PluginPrePublishPanel`, etc. Fills are unscoped by default (render in both Post and Site editor — plugins must hand-roll scoping) and pull data themselves via `useSelect`/`useDispatch`. ([SlotFills](https://developer.wordpress.org/block-editor/reference-guides/slotfills/))

**@wordpress/hooks.** `addFilter/addAction` with mandatory `vendor/plugin/function` namespaces (enabling targeted removal). The wide-open block filters — `blocks.registerBlockType` (rewrite any block's settings), `editor.BlockEdit` (HOC-wrap *every* block's edit component) — carry documented costs: the handbook itself warns of performance regressions and of `save()` filters triggering block validation errors against stored content. Cross-plugin ordering is priority-number roulette; no conflict detection. ([block filters](https://developer.wordpress.org/block-editor/reference-guides/filters/block-filters/))

**Block registration.** `block.json` metadata with its own `apiVersion`; per-asset fields (`editorScript`/`script`/`viewScript`); frontend assets load only when the block is on the page.

**WooCommerce Blocks checkout — the deliberately constrained variant.** Woo retreated from the wide-open editor surface for Cart/Checkout ([extensibility overview](https://developer.woocommerce.com/docs/block-development/getting-started/extensibility-overview/)):
- **Fixed named slots** (`ExperimentalOrderMeta`, `ExperimentalDiscountsMeta`, …) registered with `registerPlugin(..., { scope: 'woocommerce-checkout' })`; fills are **handed** `cart`/`extensions`/`context` as props rather than reaching into stores.
- **Enumerated filter registry**: `registerCheckoutFilters(namespace, {...})` over a closed list (`cartItemPrice`, `itemName`, `totalLabel`, `placeOrderButtonLabel`, …); misbehaving filters show a visible error to logged-in admins.
- **Namespaced server data**: `ExtendSchema::register_endpoint_data` adds data under your namespace on Store API responses; client-side cart mutation is **deliberately blocked** — writes go through `ExtendSchema::register_update_callback` + `extensionCartUpdate`.
- **`registerPaymentMethod(config)`**: typed contract (`canMakePayment`, `supports.features`), event-observer lifecycle (`onCheckoutValidation`, `onPaymentSetup`, `onCheckoutSuccess/Fail`), **immutable `cartData` (mutating it errors)**, observer return values arriving server-side as `payment_data`.

**Versioning/deprecation.** `@wordpress/deprecated` gives one-time console warnings (`since`/`alternative`/`hint`) plus a subscribable `deprecated` action — a real runtime deprecation channel. The `__experimental` prefix is now officially a legacy convention to avoid: ~280 experimental APIs leaked into Core by mid-2022, plugins depended on them, and they became de facto public API under BC policy. The replacement is `@wordpress/private-apis` — `lock()`/`unlock()` with an explicit consent string that can change in a minor release, keeping unstable APIs usable by core packages but inaccessible to third parties. ([private-apis](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-private-apis/))

**Sandboxing: none** — all plugin JS shares the page context; the only containment WordPress has ever achieved is Woo-checkout-style API narrowing.

---

## Cross-platform comparison

| | Shopify POS | Square | Clover | Toast | Odoo POS | Gutenberg / Woo Checkout |
|---|---|---|---|---|---|---|
| 3rd-party code on register | Yes, sandboxed remote-render | No | Yes, full APK | No | Yes, unsandboxed | Yes, unsandboxed (Woo: narrowed API) |
| UI injection | config-declared targets, component allowlist | none (templated Terminal screens) | intent slots (launch-your-activity) | none (POS calls your webhook) | registries + `patch()` monkey-patching | SlotFill + hooks; Woo: fixed slots + enumerated filters |
| Data handed to extension | per-target typed APIs; readonly signals | your data, their payment rail | bound-service connectors | REST + outbound calls | pull anything from patched store | pull via stores; Woo: **immutable props** |
| Write path | curated Cart API methods | n/a | connectors | REST | unrestricted | Woo: blocked except `extensionCartUpdate` callback |
| Hardware | narrow capability APIs; payment withheld | server-side Terminal API | SDK classes | none | IoT Box (LAN device, server-shipped drivers) | n/a |
| Versioning | quarterly pinned versions, runtime-enforced sunset | dated `Square-Version`, per-app pin | frozen targetSdk, device EOAU cliffs | 90-day notice, open enums | annual majors, no shims, 3 loader rewrites | `@wordpress/deprecated`, private-apis lock |

---

## Patterns worth stealing (dogfood-first)

**1. Shopify's contract shape: named targets declared in config, per-target typed APIs, curated write methods.** This is the best-in-class model and — crucially — it's separable from the sandbox. For the dogfood phase, first-party extensions can run in-process (like Gutenberg plugins do), but should still register through target strings (`pos.cart.block`, `pos.product.action`, …) declared in a manifest, receive readonly data scoped to their target, and mutate only through curated methods (the Cart API idiom: `addLineItem`, `applyDiscount`, with `editable` checks and rejectable writes). If the contract is target + typed API from day one, the later third-party hardening (worker/remote rendering, permissions, review) slots in *under* an unchanged contract. Shopify's own history proves the contract outlives the isolation mechanism (webview → remote-dom under stable-ish surfaces).

**2. Woo Checkout's discipline, spoken in the dialect the audience knows.** WCPOS's future third-party devs are WooCommerce plugin authors; `registerPlugin` + named slots + `registerCheckoutFilters` + `registerPaymentMethod` is their native idiom — and it happens to encode exactly the right constraints: fills handed **immutable data as props** (not free store access), an **enumerated filter registry** (not wrap-every-component HOCs), **namespaced extension data** on API responses, and writes forced through a registered callback. Adopting this shape gives WCPOS both a familiar API and the containment Woo learned to retrofit. `registerPaymentMethod`'s typed lifecycle (canMakePayment → validation/setup/success observers) is the direct template for WCPOS gateway extensions.

**3. Hardware as host-owned capability APIs, never the metal — with the IoT Box as the LAN pattern.** Every platform that exposes hardware does it as narrow verbs (Shopify: `print()`, scan events, `drawer.open()` fire-and-forget; Clover: `PrintJob`, `ReceiptRegistration`). Payment capture is withheld everywhere except via the host's own rail. WCPOS should define capability APIs (print, scan-subscribe, drawer-open, receipt-append) that first-party extensions consume now, so the mediation layer exists before third parties arrive. For reaching LAN hardware from a web/RN client, Odoo's IoT Box is the strongest documented pattern: a local bridge with an action + event-listener API, whose drivers are shipped from the server as content rather than installed on the device. Clover's REST Pay Display (SDK-less LAN payment peripheral) is the same idea for terminals.

**4. Versioning machinery before the first public API, and a hard private/public line during dogfood.** Steal three specific mechanisms: (a) Shopify's per-extension pinned `api_version` with an enforced sunset window — extensions declare what they were built against and the host refuses to run fossils; (b) `@wordpress/deprecated`-style runtime deprecation warnings as a channel, not just changelog entries; (c) `@wordpress/private-apis`-style lock/unlock for everything during the dogfood phase — WP's ~280 leaked `__experimental` APIs becoming permanent public surface is the single most expensive documented failure in this survey, and dogfood-first is maximally exposed to it (first-party extensions will happily use internal APIs; without a lock, those internals ARE the public API the day the platform opens). Also: open enums / tolerant readers (Toast's 2026 policy) as a data-contract norm.

## Failure modes to avoid

- **The Odoo trap: patch-anything with no contract.** Monkey-patching + `force`-overwritable registries + undocumented internal surfaces = every internal refactor breaks the ecosystem, loader APIs rewritten 3× in 4 releases, and annual paid migration as the business model. If first-party WCPOS extensions extend by importing internals, this is the default outcome. The dogfood phase must eat through the same registration/data contract third parties will get.
- **The WP `__experimental` leak.** Anything reachable becomes load-bearing. Gate dogfood-phase APIs behind an explicit private-API lock so opening the platform later is a decision, not an archaeology project.
- **Wrap-everything filters.** `editor.BlockEdit`-style "HOC over every component" hooks carry documented perf and validation hazards and no conflict detection. Enumerate filter points (Woo's closed `registerCheckoutFilters` list) instead of exposing a generic hook bus over rendering.
- **Hosting arbitrary foreign code is the expensive lane.** Clover — the only platform that runs third-party APKs on the register — pays with install-time-only permissions, a frozen SDK level, uninstall/reinstall on permission changes, and device EOAU cliffs; Square and Toast simply refuse. Don't promise arbitrary-code hosting; promise targets + capability APIs.
- **First extension models get replaced — keep v1 small.** Shopify killed POS Links/webviews (2025); Square retired Reader SDK (2025). A minimal surface (few targets, few capability APIs) is cheap to deprecate and re-platform; a wide one is forever.
- **Payment capture in extension hands.** No surveyed platform allows it. Payment stays host-mediated (gateway extensions integrate via a typed lifecycle à la `registerPaymentMethod`, not raw capture).

## Answer in one line

Adopt Shopify's contract shape (config-declared targets + per-target typed readonly data + curated write methods) expressed in the Woo-checkout dialect WCPOS devs already know (named slots, immutable props, enumerated filters, `registerPaymentMethod`-style typed lifecycles), mediate all hardware through host-owned capability APIs (IoT-box pattern for LAN devices), and install versioning + a private-API lock during the dogfood phase — because the documented billion-dollar failures are Odoo's patch-anything migration treadmill and WordPress's `__experimental` APIs leaking into permanent public surface.
