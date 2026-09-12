# WCPOS design cohesion audit — 2026-09-12

## BOTTOM LINE

The app is partially incoherent, not six unrelated designs. Its strongest foundation is shared semantic colour, reusable controls, and one main icon family. The most consequential fractures are control sizing, feedback states, and typography: register actions adopt larger targets while ordinary inputs, tabs, and preview controls remain compact; loading ranges from explicit spinners to blank boundaries; small labels bypass a unified role scale. Spacing is numerically broad but strongly concentrated, so counting utilities alone exaggerates the problem. Radius and elevation reveal competing surface grammars: raised cards, flat settings, rounded controls, circular icon buttons, and larger tender tiles coexist. Colour is mostly disciplined, with identifiable exceptions in startup, receipt warnings, paper, camera overlays, and embedded artwork. Some differences are appropriate: receipt paper must remain paper, navigation modals differ from local dialogs, and external login is not owned here. Preserve those contracts; unify repeated cashier tasks rather than flattening every component indiscriminately.

## Evidence contract and scope

- **Observed snapshot:** `research/design-cohesion`, HEAD `23f07bda620219da521927bbe8895ee96f4ea50d`; requested `next` / 1.11.0 lane. No pull, checkout, app execution, builds, or tests: this is a frozen source audit, not a visual screenshot review.
- **Observed** means source declarations/imports and lexical counts. **Inferred** means likely cashier-visible impact or dimensions derived from the authored scale. **Unverified**: actual native hit rectangles, browser zoom, theme contrast, runtime frequency, external login HTML, receipt-template HTML, extension-injected UI. No assertion of measured usability or regression.
- **Count unit:** one literal utility occurrence, not a rendered element. Comments, tests/specs and documentation are excluded from A–C/E–H. `cn()`, `cva()`, `clsx`-style strings, conditional strings and template-literal fragments are included. Base and caller overrides are both counted as declarations, not added together as effective styles. Repeated mapped products/rows count once. Native/web alternatives count separately. State prefixes are folded into the base-value row and reported separately; opacity suffixes remain distinct.
- **S vs L:** **S** = selected screen/route and reachable core UI-helper declarations; **L** = declarations in imported component-library modules, including their variant catalogue and re-exported helpers. **L is NOT proof that every variant is mounted.** Mount evidence and actually selected sizes are given in each narrative. A default `HStack` does not add another literal `gap-2` occurrence; explicit `space` props are counted separately. This distinction prevents claiming that a library-only `gap-8` appears on a cashier screen.
- **Scope graph:** 656 local modules reached, 201 with counted style utilities; shared modules deduplicated across all six groups. Follow relative and `@wcpos/components`/`@wcpos/core` UI imports and platform alternatives; stop at other packages and non-UI context/service modules. Shared application drawer/header beyond the POS/auth route shells is not part of A–C/E; D explicitly scans **all** of both requested source trees. Form/icon barrels include unused exports, so the graph is an upper-bound *definition census*, not a runtime mount census.
- **Singleton evidence:** a value occurring once cannot have two independent citations; it is marked **one-off**, with its sole location. Repeating the same citation would invent corroboration. All raw colour and shadow locations are enumerated, not just sampled.
- **No application behavior changes / regressions:** none introduced (report only). Existing inconsistencies below are observed source differences, not regressions established by old/new execution.

### Six selected surface groups and mount evidence

| Group | Boundary / mounted UI evidence | Scope notes |
|---|---|---|
| POS register | `packages/core/src/screens/main/pos/cart/index.tsx:127`; `packages/core/src/screens/main/pos/products/index.tsx:337`; `packages/core/src/screens/main/pos/cart/tabs.tsx:59`; `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx:59` | Cart, product list, open-order tabs, responsive columns/tabs and POS route destinations, including checkout/receipt stages. |
| Orders list + one order | `packages/core/src/screens/main/orders/index.tsx:127`; `packages/core/src/screens/main/orders/view/index.tsx:3`; `packages/core/src/screens/main/orders/view/modal.tsx:62` | View detail selected. Edit/refund destinations are explicitly labelled **adjacent routes** in F, not silently added to A–C counts. |
| Settings: **General** | `packages/core/src/screens/main/settings/general.tsx:198`; `packages/core/src/screens/main/settings/index.tsx:30` | SettingsPage + GeneralSettings + mounted form/select helpers. Other settings-tab re-exports excluded. |
| Connect / first run | `packages/core/src/screens/auth/connect.tsx:31`; `packages/core/src/screens/splash/index.tsx:37` | Connect/site/user selection, auth route shell, hydration splash. Credential entry itself is externally owned; see F. |
| Receipt / print preview | `packages/core/src/screens/main/receipt/index.tsx:12`; `packages/core/src/screens/main/receipt/receipt.tsx:74` | Both preview platforms, actions, selectors, email and shared WebView; not a fictional native receipt Text tree. |
| Products grid / variation picker | `packages/core/src/screens/main/pos/products/index.tsx:29`; `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx:151`; `packages/core/src/screens/main/pos/products/cells/variations-popover/index.tsx:145` | POS grid, not the separate inventory-management Products screen. This group overlaps POS; totals do not double-count it. |

### Scatter ranking (inferred, cashier impact weighted)

| Rank | Axis | Measured basis; interpretation |
|---:|---|---|
| 1 | E — control shapes | 51 dimensional utility forms, including non-controls; demonstrated control heights from `h-6` to `h-14`, plus content-sized rows. Biggest touch inconsistency. |
| 2 | I — feedback states | Six surface treatments; blank Suspense, explicit Loader, progress, muted bars, status badges and inline text coexist. |
| 3 | C — type | 16 size utilities + 4 weight utilities; 19 arbitrary-pixel size declarations; calendar has a separate numeric theme. |
| 4 | B — radius | 16 utility forms representing 8 radius families, including edge modifiers. |
| 5 | G — borders/elevation | 4 shadow strengths in reachable UI, despite flat-surface design guidance; width differences include intentional spinners. |
| 6 | F — overlays | 12 presentation/API families listed below; several share primitives or are platform adaptations, not 12 independent designs. |
| 7 | A — spacing | 87 directional utilities, but only 17 suffix values and strong concentration in gaps 1/2/4 and padding 2. |
| 8 | D — colour | 136 semantic utility/opacity forms dominate; raw/palette exceptions are bounded and separately classified. |
| 9 | H — icons | One main icon family and one shared size scale; size-to-text coupling is partial, not universal. |

## A. SPACING

**Observed:** **687 declarations = 465 S + 222 L**, **87 utility forms**, **24 total-corpus singletons**; **63 forms occur in S**. The 17 suffix values are `0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, px, auto, [9], [12]` (negative direction is retained in the full utility below). No `space-x-*` or `space-y-*` literals were found in this scope.

**Dominance is real:** `gap-2` 84, `gap-4` 62, `p-2` 57, `gap-1` 51: **254/687 = 37.0%** of all spacing declarations. This is not 87 unrelated design decisions. `gap-7` and `gap-8` each occur twice **only in HStack/VStack variant definitions**, not as screen overrides.

**Explicit stack props:** 66 declarations: `space="xs"` 41, `sm` 12, `md` 11, `lg` 2; xs→gap-1, sm→gap-2, md→gap-3, lg→gap-4 (`packages/components/src/hstack/index.tsx:11-18`; `packages/components/src/vstack/index.tsx:11-18`). Examples: xs `packages/components/src/docs-link/index.tsx:35`, `packages/components/src/radio-group/index.tsx:110`; sm `packages/components/src/radio-group/index.tsx:101`, `packages/core/src/screens/auth/components/site.tsx:103`; md `packages/core/src/screens/auth/components/site.tsx:41,83`; lg `packages/core/src/screens/auth/connect.tsx:31`, `packages/core/src/screens/main/pos/cart/ui-settings-form.tsx:74`. Both stacks default to sm (`hstack/index.tsx:25`, `vstack/index.tsx:25`, under `packages/components/src`).

**Cashier-visible mismatch:** same “no results” job gets `p-2` in the table (`packages/core/src/screens/main/components/data-table/index.tsx:262`) versus `p-4` in the grid (`packages/core/src/screens/main/pos/products/grid/index.tsx:136`): **2 treatments**. Settings deliberately uses a roomier page rhythm, `px-4 py-6 md:px-10 md:py-8` (`packages/core/src/screens/main/settings/index.tsx:31`), unlike the `p-2` Orders toolbar (`packages/core/src/screens/main/orders/index.tsx:128`); do not assume that all page density differences are defects.

### Raw / mixed spacing

| Value / count | Evidence | Interpretation |
|---|---|---|
| `padding: 8`, 1 | `packages/core/src/screens/auth/connect.tsx:27`; class `p-4` at `:33` | Raw numeric padding and utility spacing in the same screen file. |
| `padding: CANVAS_PAD_PX`, 1; constant 12, 1 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:132`, `:18`; `px-2` at `:108` | Native preview mixes physical document-canvas padding and class chrome. |
| Web canvas fit constant 12, 1 vs `p-3`, 1 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:15,52`, `:120` | Authored fit arithmetic uses 12px; rem-based padding need not be 12 web px. Possible alignment drift, not runtime-verified. |
| `paddingLeft: 10` + `paddingRight: 10`, 1 each; `marginTop: 0`, 2; `weekVerticalMargin: 2`, 1 | `packages/components/src/calendar/index.tsx:157,164-166,170` | Vendored calendar theme, not a locally class-styled layout. No spacing classes in that file, so not a same-file mixed-unit violation. |
| `margin: 2`, 1 | `packages/components/src/dnd/native/sortable-item.tsx:341` | Native DnD decoration. Its class spacing is not a mounted screen rhythm. |
| `paddingHorizontal: LIST_PADDING`, 1 | `packages/components/src/tabs/index.tsx:246`; `py-2` at `:252` | Scrollable tab measurement/padding path; same file mixes a numeric constant and classes. |
| Insets, 9 padding assignments in 7 locations | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:48,102`; `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx:100`; `apps/main/app/(app)/(drawer)/(pos)/_layout.tsx:158`; `packages/components/src/dialog/index.tsx:150`; `packages/components/src/modal/index.tsx:181`; `packages/core/src/screens/main/orders/index.tsx:125` | Safe-area-derived, not arbitrary scale drift; Dialog/Modal each set top and bottom, **9 assignments** across these locations. |
| Sheet bottom inset, 1 | `packages/components/src/lib/phone-sheet.tsx:36` plus `p-2` at `:34` | Safe-area adaptation; preserve it. |

### Complete spacing declaration census
| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `-mb-0.5` **one-off** | 1 | 0 | 1 | `packages/components/src/sort-icon/index.tsx:25`; sole occurrence |
| `-mt-0.5` **one-off** | 1 | 0 | 1 | `packages/components/src/sort-icon/index.tsx:33`; sole occurrence |
| `-mx-0.5` **one-off** | 1 | 0 | 1 | `packages/components/src/panels/index.tsx:59`; sole occurrence |
| `-mx-1` | 2 | 0 | 2 | `packages/components/src/dropdown-menu/index.tsx:198`; `packages/components/src/select/index.tsx:295` |
| `-my-0.5` | 2 | 1 | 1 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:251`; `packages/components/src/panels/index.tsx:59` |
| `gap-0` | 26 | 22 | 4 | `packages/core/src/screens/main/components/customer/tax-ids-form.tsx:115`; `packages/core/src/screens/main/components/data-table/footer.tsx:55` |
| `gap-0.5` | 7 | 5 | 2 | `packages/core/src/screens/auth/components/site.tsx:49`; `packages/core/src/screens/main/orders/view/sections/totals.tsx:66` |
| `gap-1` | 51 | 43 | 8 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:71`; `packages/core/src/screens/main/components/data-table/header.tsx:67` |
| `gap-1.5` | 5 | 3 | 2 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:67`; `packages/core/src/screens/main/orders/view/sections/header.tsx:62` |
| `gap-2` | 84 | 66 | 18 | `packages/core/src/screens/auth/components/sites.tsx:153`; `packages/core/src/screens/main/components/customer/tax-ids-form.tsx:108` |
| `gap-3` | 28 | 23 | 5 | `packages/core/src/screens/auth/components/add-user-button.tsx:88`; `packages/core/src/screens/auth/components/sites.tsx:154` |
| `gap-4` | 62 | 56 | 6 | `packages/core/src/screens/main/components/billing-address-form.tsx:49`; `packages/core/src/screens/main/components/customer/customer-form.tsx:94` |
| `gap-5` | 4 | 2 | 2 | `packages/core/src/screens/main/settings/general.tsx:199`; `packages/core/src/screens/main/settings/index.tsx:31` |
| `gap-6` | 3 | 1 | 2 | `packages/core/src/screens/main/settings/components/settings-row.tsx:48`; `packages/components/src/hstack/index.tsx:16`<br>Qualified: `md:gap-6` ×1 |
| `gap-7` | 2 | 0 | 2 | `packages/components/src/hstack/index.tsx:17`; `packages/components/src/vstack/index.tsx:17` |
| `gap-8` | 2 | 0 | 2 | `packages/components/src/hstack/index.tsx:18`; `packages/components/src/vstack/index.tsx:18` |
| `gap-x-2` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:156`; `packages/core/src/screens/main/orders/view/sections/line-items.tsx:58` |
| `gap-y-1` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:156`; `packages/core/src/screens/main/orders/view/sections/line-items.tsx:58` |
| `m-0.5` **one-off** | 1 | 0 | 1 | `packages/components/src/dnd/web/sortable-item.tsx:218`; sole occurrence |
| `m-1` | 3 | 3 | 0 | `packages/core/src/screens/main/pos/products/grid/index.tsx:126`; `packages/core/src/screens/main/pos/products/grid/product-tile.tsx:69` |
| `m-2` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:152`; sole occurrence |
| `m-4` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/legacy-tab.tsx:82`; `packages/core/src/screens/main/pos/checkout/tender/legacy-tab.tsx:86` |
| `mb-1` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:97`; `packages/core/src/screens/main/orders/view/sections/customer.tsx:105` |
| `mb-2` | 3 | 1 | 2 | `packages/core/src/screens/main/orders/view/sections/_section.tsx:60`; `packages/components/src/combobox/combobox.tsx:283` |
| `mb-3` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/_section.tsx:28`; `packages/core/src/screens/main/orders/view/sections/header.tsx:46` |
| `ml-1` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:52`; sole occurrence |
| `ml-2` | 2 | 2 | 0 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:100`; `packages/core/src/screens/main/pos/cart/add-coupon.tsx:219` |
| `ml-auto` **one-off** | 1 | 0 | 1 | `packages/components/src/dropdown-menu/index.tsx:207`; sole occurrence |
| `mr-2` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:82`; sole occurrence |
| `mt-0.5` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:155`; sole occurrence |
| `mt-1` **one-off** | 1 | 0 | 1 | `packages/components/src/dropdown-menu/index.tsx:65`; sole occurrence |
| `mt-2` | 4 | 4 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:75`; `packages/core/src/screens/main/orders/view/sections/totals.tsx:123` |
| `mx-4` | 4 | 4 | 0 | `packages/core/src/screens/main/pos/cart/buttons/edit-order-meta/index.tsx:43`; `packages/core/src/screens/main/pos/cart/cells/edit-fee-line/index.tsx:26` |
| `mx-auto` | 4 | 4 | 0 | `packages/core/src/screens/main/components/header/upgrade-notice.tsx:36`; `packages/core/src/screens/main/pos/checkout/tender/cancel-payment-view.tsx:27` |
| `my-1` | 2 | 0 | 2 | `packages/components/src/dropdown-menu/index.tsx:198`; `packages/components/src/select/index.tsx:295` |
| `p-0` | 18 | 12 | 6 | `packages/core/src/screens/main/components/header/upgrade-notice.tsx:34`; `packages/core/src/screens/main/orders/index.tsx:146` |
| `p-1` | 12 | 2 | 10 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:85`; `packages/core/src/screens/main/settings/components/settings-row.tsx:62` |
| `p-2` | 57 | 41 | 16 | `packages/core/src/screens/main/components/customer/tax-ids-form.tsx:116`; `packages/core/src/screens/main/components/data-table/footer.tsx:49` |
| `p-3` | 21 | 20 | 1 | `packages/core/src/screens/auth/components/add-user-button.tsx:88`; `packages/core/src/screens/auth/components/store-select.tsx:192` |
| `p-4` | 20 | 20 | 0 | `packages/core/src/screens/auth/components/site.tsx:83`; `packages/core/src/screens/auth/connect.tsx:33` |
| `p-6` | 3 | 0 | 3 | `packages/components/src/card/index.tsx:17`; `packages/components/src/card/index.tsx:41` |
| `pb-0` **one-off** | 1 | 0 | 1 | `packages/components/src/form/checkbox.tsx:30`; sole occurrence |
| `pb-1` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:87`; sole occurrence |
| `pb-4` | 8 | 5 | 3 | `packages/core/src/screens/main/pos/cart/switch-store-sheet.tsx:47`; `packages/core/src/screens/main/pos/cart/user-sheet.tsx:150` |
| `pb-5` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:44`; sole occurrence |
| `pl-0` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/index.tsx:100`; sole occurrence |
| `pl-10` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:108`; sole occurrence |
| `pl-2` | 3 | 0 | 3 | `packages/components/src/button/index.tsx:378`; `packages/components/src/input/index.tsx:52` |
| `pl-3` | 3 | 3 | 0 | `packages/core/src/screens/main/components/product/variation-image.tsx:37`; `packages/core/src/screens/main/orders/view/sections/totals.tsx:30` |
| `pl-4` | 2 | 0 | 2 | `packages/components/src/dialog/index.tsx:284`; `packages/components/src/modal/index.tsx:283` |
| `pl-7` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/components/header/upgrade-notice.tsx:34`; sole occurrence |
| `pl-8` | 8 | 0 | 8 | `packages/components/src/combobox/combobox.tsx:384`; `packages/components/src/dropdown-menu/index.tsx:46` |
| `pr-0` | 3 | 1 | 2 | `packages/core/src/screens/main/pos/products/index.tsx:285`; `packages/components/src/table/index.tsx:91` |
| `pr-1` **one-off** | 1 | 0 | 1 | `packages/components/src/numpad/index.tsx:68`; sole occurrence |
| `pr-2` | 7 | 0 | 7 | `packages/components/src/button/index.tsx:375`; `packages/components/src/dropdown-menu/index.tsx:136` |
| `pr-8` | 3 | 1 | 2 | `packages/core/src/screens/main/orders/view/sections/header.tsx:46`; `packages/components/src/dialog/index.tsx:284` |
| `pt-0` | 3 | 0 | 3 | `packages/components/src/card/index.tsx:41`; `packages/components/src/form/radio-group.tsx:25` |
| `pt-1` | 5 | 4 | 1 | `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:216`; `packages/core/src/screens/main/pos/cart/totals.tsx:166` |
| `pt-2` | 5 | 5 | 0 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:108`; `packages/core/src/screens/main/pos/cart/user-sheet.tsx:172` |
| `pt-3` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/totals.tsx:123`; sole occurrence |
| `pt-4` | 6 | 3 | 3 | `packages/core/src/screens/auth/components/sites.tsx:92`; `packages/core/src/screens/main/orders/view/modal.tsx:90` |
| `pt-5` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:44`; `packages/core/src/screens/main/settings/components/settings-section.tsx:28` |
| `px-0` | 6 | 4 | 2 | `packages/core/src/screens/main/pos/cart/register-bar.tsx:80`; `packages/core/src/screens/main/pos/checkout/tender/tender-checkout.tsx:141` |
| `px-0.5` | 2 | 0 | 2 | `packages/components/src/switch/index.tsx:164` |
| `px-1` | 17 | 13 | 4 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:111`; `packages/core/src/screens/main/pos/cart/cells/quantity.tsx:37` |
| `px-1.5` | 3 | 3 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:52`; `packages/core/src/screens/main/orders/view/sections/line-items.tsx:60` |
| `px-10` | 2 | 1 | 1 | `packages/core/src/screens/main/settings/index.tsx:31`; `packages/components/src/button/index.tsx:122`<br>Qualified: `md:px-10` ×1 |
| `px-2` | 16 | 4 | 12 | `packages/core/src/screens/main/pos/cart/register-bar.tsx:64`; `packages/core/src/screens/main/pos/products/meta-data-keys-field.tsx:118` |
| `px-2.5` | 2 | 1 | 1 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:67`; `packages/components/src/toggle/index.tsx:20` |
| `px-3` | 23 | 11 | 12 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:153`; `packages/core/src/screens/main/orders/view/sections/refunds.tsx:43` |
| `px-4` | 16 | 9 | 7 | `packages/core/src/screens/auth/components/add-user-button.tsx:86`; `packages/core/src/screens/auth/components/sites.tsx:92` |
| `px-5` | 4 | 3 | 1 | `packages/core/src/screens/main/orders/view/modal.tsx:42`; `packages/core/src/screens/main/orders/view/sections/_section.tsx:26` |
| `px-6` **one-off** | 1 | 0 | 1 | `packages/components/src/toggle/index.tsx:21`; sole occurrence<br>Qualified: `native:px-6` ×1 |
| `px-8` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:121`; sole occurrence |
| `px-[12]` **one-off** | 1 | 0 | 1 | `packages/components/src/toggle/index.tsx:19`; sole occurrence<br>Qualified: `native:px-[12]` ×1 |
| `px-[9]` **one-off** | 1 | 0 | 1 | `packages/components/src/toggle/index.tsx:20`; sole occurrence<br>Qualified: `native:px-[9]` ×1 |
| `px-px` **one-off** | 1 | 0 | 1 | `packages/components/src/switch/index.tsx:164`; sole occurrence |
| `py-0` | 2 | 1 | 1 | `packages/core/src/screens/main/orders/view/modal.tsx:41`; `packages/components/src/docs-link/index.tsx:32` |
| `py-0.5` | 9 | 8 | 1 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:67`; `packages/core/src/screens/main/orders/view/sections/header.tsx:52` |
| `py-1` | 9 | 5 | 4 | `packages/core/src/screens/main/orders/view/sections/payment.tsx:27`; `packages/core/src/screens/main/orders/view/sections/pos-metadata.tsx:18` |
| `py-1.5` | 17 | 1 | 16 | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:18`; `packages/components/src/combobox/combobox.tsx:352` |
| `py-2` | 19 | 8 | 11 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:67`; `packages/core/src/screens/auth/components/sites.tsx:212` |
| `py-2.5` | 4 | 4 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:153`; `packages/core/src/screens/main/orders/view/sections/refunds.tsx:43` |
| `py-3` | 6 | 6 | 0 | `packages/core/src/screens/auth/components/sites.tsx:154`; `packages/core/src/screens/main/orders/view/sections/_section.tsx:58` |
| `py-4` | 5 | 1 | 4 | `packages/core/src/screens/main/orders/view/sections/_section.tsx:26`; `packages/components/src/accordion/index.tsx:78` |
| `py-6` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/modal.tsx:42`; `packages/core/src/screens/main/settings/index.tsx:31` |
| `py-8` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/settings/index.tsx:31`; sole occurrence<br>Qualified: `md:py-8` ×1 |

## B. RADIUS

**Observed:** **171 declarations = 90 S + 81 L**, **16 forms**, **4 singletons**; **8 families**: bare `rounded`, `sm`, `md`, `lg`, `xl`, `2xl`, `full`, `none`. Edge forms do not constitute additional radii. The dominant family is md: `rounded-md` alone is 58; `rounded-full` 38; bare `rounded` 24; `rounded-lg` 13.

**Three concrete nested/different-control examples:**
1. Connect Card is `rounded-lg` (shared `packages/components/src/card/index.tsx:10`, mounted `packages/core/src/screens/auth/connect.tsx:33`); its Input and Button are `rounded-md` (`packages/components/src/input/index.tsx:39`; `packages/components/src/button/index.tsx:27`, mounted together `packages/core/src/screens/auth/components/url-input.tsx:26,41`).
2. A variable product tile is `rounded-lg` (`packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx:151`), its “variants” chip uses bare `rounded` (`:161`), and the picker panel is `rounded-md` (`packages/components/src/popover/index.tsx:54`): **3 families in one interaction**.
3. Standard Button is `rounded-md`, IconButton is `rounded-full` (`packages/components/src/button/index.tsx:27`; `packages/components/src/icon-button/index.tsx:14`); both appear in the Orders search/settings/action path (`packages/core/src/screens/main/orders/index.tsx:131-138`; `packages/core/src/screens/main/orders/cells/actions.tsx:183`).

**Do not “fix” seams:** `rounded-t-none`, `rounded-bl-none`, `rounded-br-none` on Pay/Void intentionally meet the cart boundary (`packages/core/src/screens/main/pos/cart/buttons/pay.tsx:185`; `packages/core/src/screens/main/pos/cart/buttons/void.tsx:214`). ButtonGroup/ToggleGroup flatten internal joins (`packages/components/src/button/index.tsx:375-381`; `packages/components/src/toggle-group/index.tsx:86-88`). Raw DnD `borderRadius: DOT_SIZE / 2` is one circular marker, not another container scale (`packages/components/src/dnd/native/drop-indicator.tsx:51`). Theme `--radius: 0.5rem` exists (`apps/main/global.css:191,287`), but does not make all these distinct named utility choices a single radius.

| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `rounded` | 24 | 20 | 4 | `packages/core/src/screens/auth/components/site.tsx:46`; `packages/core/src/screens/main/components/product/image.tsx:25`<br>Qualified: `native:rounded` ×1 |
| `rounded-2xl` | 5 | 5 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:85`; `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:192` |
| `rounded-b-lg` | 2 | 2 | 0 | `packages/core/src/screens/main/components/data-table/footer.tsx:49`; `packages/core/src/screens/main/components/data-table/skeleton.tsx:50` |
| `rounded-bl-none` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/buttons/pay.tsx:185`; sole occurrence |
| `rounded-br-none` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/buttons/void.tsx:214`; sole occurrence |
| `rounded-full` | 38 | 19 | 19 | `packages/core/src/screens/auth/components/add-user-button.tsx:93`; `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:67`<br>Qualified: `before:rounded-full` ×1 |
| `rounded-l-none` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:378`; `packages/components/src/toggle-group/index.tsx:88` |
| `rounded-lg` | 13 | 5 | 8 | `packages/core/src/screens/auth/components/add-user-button.tsx:88`; `packages/core/src/screens/auth/components/store-select.tsx:192` |
| `rounded-md` | 58 | 31 | 27 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:41`; `packages/core/src/screens/main/pos/cart/open-register-card.tsx:43`<br>Qualified: `web:group-hover:rounded-md` ×1 |
| `rounded-none` | 9 | 0 | 9 | `packages/components/src/button/index.tsx:95`; `packages/components/src/dialog/index.tsx:204` |
| `rounded-r-md` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:153`; sole occurrence |
| `rounded-r-none` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:375`; `packages/components/src/toggle-group/index.tsx:86` |
| `rounded-sm` | 9 | 0 | 9 | `packages/components/src/checkbox/index.tsx:17`; `packages/components/src/combobox/combobox.tsx:383` |
| `rounded-t-lg` **one-off** | 1 | 0 | 1 | `packages/components/src/card/index.tsx:17`; sole occurrence |
| `rounded-t-none` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/cart/buttons/pay.tsx:185`; `packages/core/src/screens/main/pos/cart/buttons/void.tsx:214` |
| `rounded-xl` | 3 | 3 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:90`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:261` |

## C. TYPE

**Observed:** **431 declarations = 354 S + 77 L**: **16 size utilities, 4 weight utilities**, **5 singleton forms**. `text-xs` (132) and `text-sm` (122) dominate: **254 size declarations**. **19 arbitrary-pixel size declarations**: `text-[10px]` 14, `text-[32px]` 4, `text-[9px]` 1; **16 are in S**, 3 in L. Weight utilities: bold 23, medium 47, normal 1, semibold 44.

**The premise needs correcting:** shared Text has **no size or heading/body variant scale**—only default/link; its base is `text-base`, then context/caller classes override it (`packages/components/src/text/index.tsx:13-23,36`). Therefore a screen using `className="text-sm"` is not bypassing an available Text size variant. There is nonetheless no central semantic typography-role API.

**Scale source:** `text-3xs/2xs/xs/sm` are custom rem tokens (`apps/main/global.css:29-36`); web root is 14px-equivalent, native is 16 (`:594-608`). `text-2xs` is about **11 web / 12.6 native**, not a universal 12pt; `text-xs` is about **12/13.7**. `text-3xs` exists in tokens but has **0 counted uses**. Arbitrary `10px` and `9px` do not proportionally follow that rem scale.

**Actual repeated-task drift:** product metadata uses `text-sm` in list rows (`packages/core/src/screens/main/pos/products/cells/name.tsx:38-41`, **3 declarations**) but `text-xs` in grid tiles (`packages/core/src/screens/main/pos/products/grid/product-tile.tsx:111,116,121,126,131`, **5 declarations**). Names themselves are consistently bold (`cells/name.tsx:35`; `grid/product-tile.tsx:78`, same POS products prefix). Uppercase section labels independently use `text-2xs` in settings (`packages/core/src/screens/main/settings/components/settings-section.tsx:30`) and `text-[10px]` in the order rail (`packages/core/src/screens/main/orders/view/sections/_section.tsx:60`). Large tender amounts are deliberate hierarchy, not automatically incoherence (`packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:348`; `split-view.tsx:80` in that directory).

### Literal size and weight inventory
| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `font-bold` | 23 | 21 | 2 | `packages/core/src/screens/auth/components/site.tsx:50`; `packages/core/src/screens/main/components/editable-field.tsx:100` |
| `font-medium` | 47 | 39 | 8 | `packages/core/src/screens/auth/components/add-user-button.tsx:97`; `packages/core/src/screens/auth/components/store-select.tsx:202` |
| `font-normal` **one-off** | 1 | 0 | 1 | `packages/components/src/form/toggle-group.tsx:67`; sole occurrence |
| `font-semibold` | 44 | 36 | 8 | `packages/core/src/screens/auth/components/sites.tsx:92`; `packages/core/src/screens/auth/components/store-select.tsx:166` |
| `text-2xl` | 2 | 1 | 1 | `packages/core/src/screens/main/pos/checkout/tender/ledger-pane.tsx:140`; `packages/components/src/card/index.tsx:26` |
| `text-2xs` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/settings/components/settings-section.tsx:30`; sole occurrence |
| `text-3xl` | 2 | 1 | 1 | `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:177`; `packages/components/src/button/index.tsx:204` |
| `text-4xl` | 3 | 3 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:64`; `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:177` |
| `text-5xl` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:178`; sole occurrence |
| `text-6xl` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:80`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:348` |
| `text-7xl` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:178`; sole occurrence |
| `text-8xl` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:80`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:348` |
| `text-[10px]` | 14 | 12 | 2 | `packages/core/src/screens/main/orders/view/sections/_section.tsx:60`; `packages/core/src/screens/main/orders/view/sections/customer.tsx:97` |
| `text-[32px]` | 4 | 4 | 0 | `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:59`; `packages/core/src/screens/main/pos/cart/movement-sheet.tsx:32` |
| `text-[9px]` **one-off** | 1 | 0 | 1 | `packages/components/src/avatar/index.tsx:70`; sole occurrence |
| `text-base` | 18 | 8 | 10 | `packages/core/src/screens/main/orders/view/modal.tsx:43`; `packages/core/src/screens/main/orders/view/sections/line-items.tsx:106` |
| `text-lg` | 9 | 5 | 4 | `packages/core/src/screens/main/orders/view/sections/totals.tsx:127`; `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:88` |
| `text-sm` | 122 | 91 | 31 | `packages/core/src/screens/auth/components/add-user-button.tsx:97`; `packages/core/src/screens/auth/components/store-select.tsx:172` |
| `text-xl` | 2 | 1 | 1 | `packages/core/src/screens/main/settings/index.tsx:33`; `packages/components/src/button/index.tsx:203` |
| `text-xs` | 132 | 125 | 7 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:76`; `packages/core/src/screens/auth/components/site.tsx:51` |

### Components owning type choices

**31 imported library files explicitly specify text sizes** (table below); this is not 31 separate scales. **10 define more than one distinct size**; the others fix one role. **77 S files** contain explicit text-size utilities. The two size/weight engines with non-class numeric input are not two RN Text implementations: **one Calendar component** sets 3 font-size properties and 3 font-weight properties in its vendor theme.

| Library file | Sizes owned (count; every location) |
|---|---|
| `packages/components/src/accordion/index.tsx` | `text-base` ×1 (`packages/components/src/accordion/index.tsx:97`)<br>`text-sm` ×1 (`packages/components/src/accordion/index.tsx:100`) |
| `packages/components/src/alert-dialog/index.tsx` | `text-lg` ×1 (`packages/components/src/alert-dialog/index.tsx:105`)<br>`text-base` ×1 (`packages/components/src/alert-dialog/index.tsx:121`) |
| `packages/components/src/avatar/index.tsx` | `text-[9px]` ×1 (`packages/components/src/avatar/index.tsx:70`)<br>`text-[10px]` ×1 (`packages/components/src/avatar/index.tsx:71`)<br>`text-xs` ×1 (`packages/components/src/avatar/index.tsx:72`)<br>`text-sm` ×1 (`packages/components/src/avatar/index.tsx:73`) |
| `packages/components/src/button/index.tsx` | `text-base` ×1 (`packages/components/src/button/index.tsx:136`)<br>`text-xs` ×2 (`packages/components/src/button/index.tsx:199`; `packages/components/src/button/index.tsx:200`)<br>`text-sm` ×1 (`packages/components/src/button/index.tsx:201`)<br>`text-lg` ×1 (`packages/components/src/button/index.tsx:202`)<br>`text-xl` ×1 (`packages/components/src/button/index.tsx:203`)<br>`text-3xl` ×1 (`packages/components/src/button/index.tsx:204`) |
| `packages/components/src/card/index.tsx` | `text-2xl` ×1 (`packages/components/src/card/index.tsx:26`)<br>`text-sm` ×1 (`packages/components/src/card/index.tsx:35`) |
| `packages/components/src/combobox/combobox.tsx` | `text-sm` ×3 (`packages/components/src/combobox/combobox.tsx:142`; `packages/components/src/combobox/combobox.tsx:353`; `packages/components/src/combobox/combobox.tsx:408`) |
| `packages/components/src/dialog/index.tsx` | `text-sm` ×1 (`packages/components/src/dialog/index.tsx:307`)<br>`text-lg` ×1 (`packages/components/src/dialog/index.tsx:320`) |
| `packages/components/src/dropdown-menu/index.tsx` | `text-base` ×1 (`packages/components/src/dropdown-menu/index.tsx:186`)<br>`text-xs` ×1 (`packages/components/src/dropdown-menu/index.tsx:207`) |
| `packages/components/src/dropdown-menu/item.tsx` | `text-base` ×1 (`packages/components/src/dropdown-menu/item.tsx:25`) |
| `packages/components/src/form/common.tsx` | `text-sm` ×2 (`packages/components/src/form/common.tsx:75`; `packages/components/src/form/common.tsx:98`) |
| `packages/components/src/form/toggle-group.tsx` | `text-sm` ×1 (`packages/components/src/form/toggle-group.tsx:67`) |
| `packages/components/src/form/tree-combobox.tsx` | `text-sm` ×1 (`packages/components/src/form/tree-combobox.tsx:73`) |
| `packages/components/src/input/index.tsx` | `text-base` ×1 (`packages/components/src/input/index.tsx:154`) |
| `packages/components/src/label/index.tsx` | `text-sm` ×1 (`packages/components/src/label/index.tsx:47`) |
| `packages/components/src/list-item/index.tsx` | `text-sm` ×1 (`packages/components/src/list-item/index.tsx:94`)<br>`text-xs` ×1 (`packages/components/src/list-item/index.tsx:96`) |
| `packages/components/src/modal/index.tsx` | `text-lg` ×1 (`packages/components/src/modal/index.tsx:319`) |
| `packages/components/src/radio-group/index.tsx` | `text-sm` ×1 (`packages/components/src/radio-group/index.tsx:125`) |
| `packages/components/src/select/index.tsx` | `text-sm` ×5 (`packages/components/src/select/index.tsx:126`; `packages/components/src/select/index.tsx:143`; `packages/components/src/select/index.tsx:240`; `packages/components/src/select/index.tsx:288`; `packages/components/src/select/index.tsx:303`) |
| `packages/components/src/select/select-multi.tsx` | `text-sm` ×2 (`packages/components/src/select/select-multi.tsx:125`; `packages/components/src/select/select-multi.tsx:218`) |
| `packages/components/src/select/trigger.tsx` | `text-sm` ×1 (`packages/components/src/select/trigger.tsx:29`) |
| `packages/components/src/select/trigger.web.tsx` | `text-sm` ×1 (`packages/components/src/select/trigger.web.tsx:32`) |
| `packages/components/src/sort-icon/index.tsx` | `text-base` ×2 (`packages/components/src/sort-icon/index.tsx:26`; `packages/components/src/sort-icon/index.tsx:34`) |
| `packages/components/src/status-badge/index.tsx` | `text-[10px]` ×1 (`packages/components/src/status-badge/index.tsx:25`) |
| `packages/components/src/table/index.tsx` | `text-sm` ×1 (`packages/components/src/table/index.tsx:16`)<br>`text-xs` ×1 (`packages/components/src/table/index.tsx:88`) |
| `packages/components/src/tabs/index.tsx` | `text-sm` ×1 (`packages/components/src/tabs/index.tsx:300`) |
| `packages/components/src/text/index.tsx` | `text-base` ×1 (`packages/components/src/text/index.tsx:13`) |
| `packages/components/src/textarea/index.tsx` | `text-base` ×1 (`packages/components/src/textarea/index.tsx:100`) |
| `packages/components/src/toggle/index.tsx` | `text-sm` ×1 (`packages/components/src/toggle/index.tsx:31`) |
| `packages/components/src/tooltip/index.tsx` | `text-sm` ×1 (`packages/components/src/tooltip/index.tsx:90`) |
| `packages/components/src/tooltip/index.web.tsx` | `text-sm` ×1 (`packages/components/src/tooltip/index.web.tsx:28`) |
| `packages/components/src/tree-combobox/tree-combobox.tsx` | `text-sm` ×2 (`packages/components/src/tree-combobox/tree-combobox.tsx:347`; `packages/components/src/tree-combobox/tree-combobox.tsx:443`)<br>`text-xs` ×1 (`packages/components/src/tree-combobox/tree-combobox.tsx:351`) |

**Independent non-class calendar scale:** `textDayFontWeight: '300'` / header `'300'` = **2 properties**, `textMonthFontWeight: '500'` = **1** (`packages/components/src/calendar/index.tsx:151-153`); `textDayFontSize: 14` / month 14 = **2**, header `web ? 12 : 14` = **1 conditional** (`:154-156`). These are the **only numeric font theme assignments found in the selected graph**; no literal RN `style={{fontSize:…}}` found. Calendar is mounted by the Orders date filter (`packages/core/src/screens/main/components/order/filter-bar/calendar.tsx:133`).

**Library-only scale, do not attribute to current Receipt:** `packages/components/src/print/text.tsx:9-14` defines monospace sm→xs / md→base / lg→lg (**3 sizes**). Current receipt uses document HTML through WebView (`packages/core/src/screens/main/receipt/receipt-body.tsx:99`), not this print Text component. The Avatar 9px variant is likewise an L catalogue entry, not proof a 9px avatar is visible on these screens.

## D. COLOUR

**Mostly coherent, with specific leaks.** The selected graph has **950 semantic-class declarations = 473 S + 477 L**, **136 semantic utility/opacity forms**. This count is not 136 hues: it includes text/background/border roles, state alternatives, and opacity combinations. Leading tokens: `text-muted-foreground` 161, `border-border` 76, `text-foreground` 47, `text-destructive` 39, `bg-muted` 35. Definitions are centralized in `apps/main/global.css:40-92`; default theme primary and destructive are distinct (`apps/main/global.css:161-162,186-187`).

### Actual non-token surfaces in the selected screens

| Surface / number of declarations | Evidence | Assessment |
|---|---|---|
| Splash, **1** fixed fill `#F0F4F8` | `packages/core/src/screens/splash/index.tsx:37`; compare theme-aware page `packages/core/src/screens/main/settings/index.tsx:30` and `apps/main/global.css:617-619` | Real theme bypass, including dark mode; not merely a logo asset. |
| Receipt mismatch warning, **3 palette classes** | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:18-19`: `border-amber-300 bg-amber-50 text-amber-800` | Semantic warning purpose, non-semantic palette implementation. |
| Receipt paper, **2 platform fills** | Web `bg-white`: `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:124`; native `backgroundColor: 'white'`: `receipt-preview-viewport.tsx:140` in same directory | Deliberate white-paper exception, not an app-card replacement target. |
| WebView loader, **1 white scrim** | `packages/components/src/webview/index.web.tsx:186`, mounted by `packages/core/src/screens/main/receipt/receipt-body.tsx:99` | Loading chrome bypasses theme independently of the receipt paper. |
| Camera viewfinder, **5 palette declarations** | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:193,209,214,216,221` | Black/video and white-overlay contrast: context-specific, not ordinary form surfaces. |
| Variable-tile badge, **2 palette declarations** | `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx:161-162` | Black/50 + white on a photo; justify as image-overlay exception rather than silently generalize. |
| Product placeholder, **2 encoded colours / 4 paint attributes** | `packages/core/src/screens/main/components/product/product-image-placeholder.ts:18-21` (base64; decoded SVG mirrors `:12-15`), mounted `packages/core/src/screens/main/pos/products/grid/tile-image.tsx:35-38` | `#e5e7eb` ×1 and `#9ca3af` ×3; static artwork, not token-aware. |
| Shared backdrops, **8 declarations** | Black/70 ×6: `packages/components/src/dialog/index.tsx:78,152`, `modal/index.tsx:145,184`, `alert-dialog/index.tsx:27,44`; black/50 ×2: `combobox/combobox.tsx:188`, `lib/phone-sheet.tsx:23` (all component prefixes) | Two opacity policies; distinct panel vs phone-combobox presentations. |
| Shared DnD markers / sort affordance | `bg-blue-700` + `border-blue-700`, **2**, `packages/components/src/dnd/web/drop-indicator.tsx:45`; `text-gray-300`, **2**, `packages/components/src/sort-icon/index.tsx:26,34` | Theme leaks in decorations, not six full-screen palettes. |

### Raw colour sweep: both complete source trees

**285 literal paint/palette/fixture occurrences, 90 exact lexemes**, across TS/TSX, HTML, JSON and SVG; plus the **4 encoded SVG paints** above. Case/spelling is retained (`#FFF`, `#fff`, `#ffffff` are not three perceptually distinct whites). Counts include colour values displayed as text in palette HTML and its matching JSON: **not all runtime UI**. Numeric issue references, HTML entities, product option “red”, comments and doc examples are **not** counted as paint. `currentColor`, `none`, CSS variables and transparent surfaces are not chromatic palette choices; literal `transparent` is still listed for completeness.

- Production TS/TSX raw paints: logos/icon artwork, native DnD transparency, splash, native paper, legacy report/print CSS. The logo has **4 paint lexemes** repeated across two component implementations and static SVG assets (`packages/components/src/logo/index.tsx:14-62`; `packages/components/src/logo/logo.tsx:33-81`). Do not count brand SVG colours as separate button themes.
- **6 test-only paint occurrences**, in `packages/components/src/table/pulse-row.test.tsx:7,50`, `packages/components/src/loader/loader.test.tsx:30`, `packages/core/src/screens/main/mini-apps/mini-app-host.test.tsx:51` (4 in the first file, 1 in each of the other two).
- Unmounted palette demo/JSON: `packages/core/src/contexts/theme/palettes/blue-grey.html` and `blue-grey.json`; static icon examples/assets: `packages/core/src/assets/*`. Their colours are included solely to satisfy the all-tree sweep.
- Legacy report print styles: `#000` / `#999` (`packages/core/src/screens/main/reports/report/generate-html.ts:81,104`); legacy web print border `#999` (`packages/core/src/screens/main/hooks/use-print/use-print.web.ts:29`). These are not the current selected Receipt chrome.

| Raw colour lexeme | Count | Every source location (palette/assets/tests are not screen evidence) |
|---|---:|---|
| `#000` | 2 | `packages/core/src/assets/icon-example.html:34`; `packages/core/src/screens/main/reports/report/generate-html.ts:81` |
| `#000000` **one-off** | 1 | `packages/core/src/screens/main/mini-apps/mini-app-host.test.tsx:51` |
| `#007936` **one-off** | 1 | `packages/components/src/table/pulse-row.test.tsx:50` |
| `#014D40` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:595`; `packages/core/src/contexts/theme/palettes/blue-grey.html:598`; `packages/core/src/contexts/theme/palettes/blue-grey.json:77` |
| `#035388` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:215`; `packages/core/src/contexts/theme/palettes/blue-grey.html:218`; `packages/core/src/contexts/theme/palettes/blue-grey.json:22` |
| `#044E54` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:291`; `packages/core/src/contexts/theme/palettes/blue-grey.html:294`; `packages/core/src/contexts/theme/palettes/blue-grey.json:33` |
| `#0A6C74` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:284`; `packages/core/src/contexts/theme/palettes/blue-grey.html:287`; `packages/core/src/contexts/theme/palettes/blue-grey.json:32` |
| `#0B69A3` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:208`; `packages/core/src/contexts/theme/palettes/blue-grey.html:211`; `packages/core/src/contexts/theme/palettes/blue-grey.json:21` |
| `#0C6B58` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:588`; `packages/core/src/contexts/theme/palettes/blue-grey.html:591`; `packages/core/src/contexts/theme/palettes/blue-grey.json:76` |
| `#0E7C86` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:277`; `packages/core/src/contexts/theme/palettes/blue-grey.html:280`; `packages/core/src/contexts/theme/palettes/blue-grey.json:31` |
| `#101010` **one-off** | 1 | `packages/core/src/assets/icon-example.html:20` |
| `#102A43` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:139`; `packages/core/src/contexts/theme/palettes/blue-grey.html:142`; `packages/core/src/contexts/theme/palettes/blue-grey.json:11` |
| `#123456` **one-off** | 1 | `packages/components/src/loader/loader.test.tsx:30` |
| `#127FBF` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:201`; `packages/core/src/contexts/theme/palettes/blue-grey.html:204`; `packages/core/src/contexts/theme/palettes/blue-grey.json:20` |
| `#147D64` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:581`; `packages/core/src/contexts/theme/palettes/blue-grey.html:584`; `packages/core/src/contexts/theme/palettes/blue-grey.json:75` |
| `#14919B` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:270`; `packages/core/src/contexts/theme/palettes/blue-grey.html:273`; `packages/core/src/contexts/theme/palettes/blue-grey.json:30` |
| `#1992D4` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:194`; `packages/core/src/contexts/theme/palettes/blue-grey.html:197`; `packages/core/src/contexts/theme/palettes/blue-grey.json:19` |
| `#199473` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:574`; `packages/core/src/contexts/theme/palettes/blue-grey.html:577`; `packages/core/src/contexts/theme/palettes/blue-grey.json:74` |
| `#243B53` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:132`; `packages/core/src/contexts/theme/palettes/blue-grey.html:135`; `packages/core/src/contexts/theme/palettes/blue-grey.json:10` |
| `#27AB83` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:567`; `packages/core/src/contexts/theme/palettes/blue-grey.html:570`; `packages/core/src/contexts/theme/palettes/blue-grey.json:73` |
| `#2BB0ED` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:187`; `packages/core/src/contexts/theme/palettes/blue-grey.html:190`; `packages/core/src/contexts/theme/palettes/blue-grey.json:18` |
| `#2CB1BC` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:263`; `packages/core/src/contexts/theme/palettes/blue-grey.html:266`; `packages/core/src/contexts/theme/palettes/blue-grey.json:29` |
| `#323A46` | 5 | `packages/components/src/logo/index.tsx:14`; `packages/components/src/logo/logo.tsx:33`; `packages/core/src/assets/icon.svg:3`; `packages/core/src/assets/icon-square.svg:3`; `packages/core/src/assets/icon-round.svg:9` |
| `#333` **one-off** | 1 | `packages/core/src/contexts/theme/palettes/blue-grey.html:31` |
| `#334E68` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:125`; `packages/core/src/contexts/theme/palettes/blue-grey.html:128`; `packages/core/src/contexts/theme/palettes/blue-grey.json:9` |
| `#38BEC9` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:256`; `packages/core/src/contexts/theme/palettes/blue-grey.html:259`; `packages/core/src/contexts/theme/palettes/blue-grey.json:28` |
| `#3EBD93` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:560`; `packages/core/src/contexts/theme/palettes/blue-grey.html:563`; `packages/core/src/contexts/theme/palettes/blue-grey.json:72` |
| `#40C3F7` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:180`; `packages/core/src/contexts/theme/palettes/blue-grey.html:183`; `packages/core/src/contexts/theme/palettes/blue-grey.json:17` |
| `#486581` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:118`; `packages/core/src/contexts/theme/palettes/blue-grey.html:121`; `packages/core/src/contexts/theme/palettes/blue-grey.json:8` |
| `#54D1DB` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:249`; `packages/core/src/contexts/theme/palettes/blue-grey.html:252`; `packages/core/src/contexts/theme/palettes/blue-grey.json:27` |
| `#5ED0FA` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:173`; `packages/core/src/contexts/theme/palettes/blue-grey.html:176`; `packages/core/src/contexts/theme/palettes/blue-grey.json:16` |
| `#610316` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:443`; `packages/core/src/contexts/theme/palettes/blue-grey.html:446`; `packages/core/src/contexts/theme/palettes/blue-grey.json:55` |
| `#620042` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:367`; `packages/core/src/contexts/theme/palettes/blue-grey.html:370`; `packages/core/src/contexts/theme/palettes/blue-grey.json:44` |
| `#627D98` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:111`; `packages/core/src/contexts/theme/palettes/blue-grey.html:114`; `packages/core/src/contexts/theme/palettes/blue-grey.json:7` |
| `#65D6AD` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:553`; `packages/core/src/contexts/theme/palettes/blue-grey.html:556`; `packages/core/src/contexts/theme/palettes/blue-grey.json:71` |
| `#666` **one-off** | 1 | `packages/core/src/contexts/theme/palettes/blue-grey.html:63` |
| `#81DEFD` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:166`; `packages/core/src/contexts/theme/palettes/blue-grey.html:169`; `packages/core/src/contexts/theme/palettes/blue-grey.json:15` |
| `#829AB1` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:104`; `packages/core/src/contexts/theme/palettes/blue-grey.html:107`; `packages/core/src/contexts/theme/palettes/blue-grey.json:6` |
| `#870557` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:360`; `packages/core/src/contexts/theme/palettes/blue-grey.html:363`; `packages/core/src/contexts/theme/palettes/blue-grey.json:43` |
| `#87EAF2` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:242`; `packages/core/src/contexts/theme/palettes/blue-grey.html:245`; `packages/core/src/contexts/theme/palettes/blue-grey.json:26` |
| `#8A041A` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:436`; `packages/core/src/contexts/theme/palettes/blue-grey.html:439`; `packages/core/src/contexts/theme/palettes/blue-grey.json:54` |
| `#8D2B0B` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:519`; `packages/core/src/contexts/theme/palettes/blue-grey.html:522`; `packages/core/src/contexts/theme/palettes/blue-grey.json:66` |
| `#8EEDC7` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:546`; `packages/core/src/contexts/theme/palettes/blue-grey.html:549`; `packages/core/src/contexts/theme/palettes/blue-grey.json:70` |
| `#999` | 2 | `packages/core/src/screens/main/reports/report/generate-html.ts:104`; `packages/core/src/screens/main/hooks/use-print/use-print.web.ts:29` |
| `#9FB3C8` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:97`; `packages/core/src/contexts/theme/palettes/blue-grey.html:100`; `packages/core/src/contexts/theme/palettes/blue-grey.json:5` |
| `#A30664` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:353`; `packages/core/src/contexts/theme/palettes/blue-grey.html:356`; `packages/core/src/contexts/theme/palettes/blue-grey.json:42` |
| `#AB091E` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:429`; `packages/core/src/contexts/theme/palettes/blue-grey.html:432`; `packages/core/src/contexts/theme/palettes/blue-grey.json:53` |
| `#B3ECFF` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:159`; `packages/core/src/contexts/theme/palettes/blue-grey.html:162`; `packages/core/src/contexts/theme/palettes/blue-grey.json:14` |
| `#B44D12` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:512`; `packages/core/src/contexts/theme/palettes/blue-grey.html:515`; `packages/core/src/contexts/theme/palettes/blue-grey.json:65` |
| `#BC0A6F` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:346`; `packages/core/src/contexts/theme/palettes/blue-grey.html:349`; `packages/core/src/contexts/theme/palettes/blue-grey.json:41` |
| `#BCCCDC` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:90`; `packages/core/src/contexts/theme/palettes/blue-grey.html:93`; `packages/core/src/contexts/theme/palettes/blue-grey.json:4` |
| `#BEF8FD` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:235`; `packages/core/src/contexts/theme/palettes/blue-grey.html:238`; `packages/core/src/contexts/theme/palettes/blue-grey.json:25` |
| `#C6F7E2` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:539`; `packages/core/src/contexts/theme/palettes/blue-grey.html:542`; `packages/core/src/contexts/theme/palettes/blue-grey.json:69` |
| `#CB6E17` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:505`; `packages/core/src/contexts/theme/palettes/blue-grey.html:508`; `packages/core/src/contexts/theme/palettes/blue-grey.json:64` |
| `#CD2C24` | 5 | `packages/components/src/logo/index.tsx:16`; `packages/components/src/logo/logo.tsx:35`; `packages/core/src/assets/icon.svg:4`; `packages/core/src/assets/icon-square.svg:4`; `packages/core/src/assets/icon-round.svg:10` |
| `#CF1124` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:422`; `packages/core/src/contexts/theme/palettes/blue-grey.html:425`; `packages/core/src/contexts/theme/palettes/blue-grey.json:52` |
| `#d40924` **one-off** | 1 | `packages/components/src/table/pulse-row.test.tsx:7` |
| `#D9E2EC` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:83`; `packages/core/src/contexts/theme/palettes/blue-grey.html:86`; `packages/core/src/contexts/theme/palettes/blue-grey.json:3` |
| `#DA127D` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:339`; `packages/core/src/contexts/theme/palettes/blue-grey.html:342`; `packages/core/src/contexts/theme/palettes/blue-grey.json:40` |
| `#DE911D` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:498`; `packages/core/src/contexts/theme/palettes/blue-grey.html:501`; `packages/core/src/contexts/theme/palettes/blue-grey.json:63` |
| `#E0FCFF` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:228`; `packages/core/src/contexts/theme/palettes/blue-grey.html:231`; `packages/core/src/contexts/theme/palettes/blue-grey.json:24` |
| `#E12D39` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:415`; `packages/core/src/contexts/theme/palettes/blue-grey.html:418`; `packages/core/src/contexts/theme/palettes/blue-grey.json:51` |
| `#E3F8FF` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:152`; `packages/core/src/contexts/theme/palettes/blue-grey.html:155`; `packages/core/src/contexts/theme/palettes/blue-grey.json:13` |
| `#E8368F` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:332`; `packages/core/src/contexts/theme/palettes/blue-grey.html:335`; `packages/core/src/contexts/theme/palettes/blue-grey.json:39` |
| `#eeeeee` **one-off** | 1 | `packages/components/src/table/pulse-row.test.tsx:50` |
| `#EF4E4E` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:408`; `packages/core/src/contexts/theme/palettes/blue-grey.html:411`; `packages/core/src/contexts/theme/palettes/blue-grey.json:50` |
| `#EFFCF6` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:532`; `packages/core/src/contexts/theme/palettes/blue-grey.html:535`; `packages/core/src/contexts/theme/palettes/blue-grey.json:68` |
| `#F0B429` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:491`; `packages/core/src/contexts/theme/palettes/blue-grey.html:494`; `packages/core/src/contexts/theme/palettes/blue-grey.json:62` |
| `#F0F4F8` | 4 | `packages/core/src/screens/splash/index.tsx:37`; `packages/core/src/contexts/theme/palettes/blue-grey.html:76`; `packages/core/src/contexts/theme/palettes/blue-grey.html:79`; `packages/core/src/contexts/theme/palettes/blue-grey.json:2` |
| `#F364A2` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:325`; `packages/core/src/contexts/theme/palettes/blue-grey.html:328`; `packages/core/src/contexts/theme/palettes/blue-grey.json:38` |
| `#F5E5C0` | 5 | `packages/components/src/logo/index.tsx:24`; `packages/components/src/logo/logo.tsx:43`; `packages/core/src/assets/icon.svg:10`; `packages/core/src/assets/icon-square.svg:10`; `packages/core/src/assets/icon-round.svg:16` |
| `#f5f5f5` **one-off** | 1 | `packages/core/src/contexts/theme/palettes/blue-grey.html:16` |
| `#F7C948` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:484`; `packages/core/src/contexts/theme/palettes/blue-grey.html:487`; `packages/core/src/contexts/theme/palettes/blue-grey.json:61` |
| `#F86A6A` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:401`; `packages/core/src/contexts/theme/palettes/blue-grey.html:404`; `packages/core/src/contexts/theme/palettes/blue-grey.json:49` |
| `#FADB5F` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:477`; `packages/core/src/contexts/theme/palettes/blue-grey.html:480`; `packages/core/src/contexts/theme/palettes/blue-grey.json:60` |
| `#FCE588` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:470`; `packages/core/src/contexts/theme/palettes/blue-grey.html:473`; `packages/core/src/contexts/theme/palettes/blue-grey.json:59` |
| `#FF8CBA` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:318`; `packages/core/src/contexts/theme/palettes/blue-grey.html:321`; `packages/core/src/contexts/theme/palettes/blue-grey.json:37` |
| `#FF9B9B` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:394`; `packages/core/src/contexts/theme/palettes/blue-grey.html:397`; `packages/core/src/contexts/theme/palettes/blue-grey.json:48` |
| `#FFB8D2` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:311`; `packages/core/src/contexts/theme/palettes/blue-grey.html:314`; `packages/core/src/contexts/theme/palettes/blue-grey.json:36` |
| `#FFBDBD` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:387`; `packages/core/src/contexts/theme/palettes/blue-grey.html:390`; `packages/core/src/contexts/theme/palettes/blue-grey.json:47` |
| `#FFE3E3` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:380`; `packages/core/src/contexts/theme/palettes/blue-grey.html:383`; `packages/core/src/contexts/theme/palettes/blue-grey.json:46` |
| `#FFE3EC` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:304`; `packages/core/src/contexts/theme/palettes/blue-grey.html:307`; `packages/core/src/contexts/theme/palettes/blue-grey.json:35` |
| `#fff` | 2 | `packages/core/src/assets/icon-example.html:26`; `packages/core/src/assets/icon-example.html:30` |
| `#FFF` | 38 | `packages/components/src/logo/index.tsx:36`; `packages/components/src/logo/index.tsx:45`; `packages/components/src/logo/index.tsx:54`; `packages/components/src/logo/index.tsx:60`; `packages/components/src/logo/index.tsx:62`; `packages/components/src/logo/logo.tsx:55`; `packages/components/src/logo/logo.tsx:64`; `packages/components/src/logo/logo.tsx:73`; `packages/components/src/logo/logo.tsx:79`; `packages/components/src/logo/logo.tsx:81`; `packages/components/src/icon/components/fontawesome/solid/wcpos.tsx:13`; `packages/components/src/icon/svg/fontawesome/solid/wcpos.svg:9` ×2; `packages/components/src/icon/svg/fontawesome/solid/wcpos.svg:10` ×2; `packages/components/src/icon/svg/fontawesome/solid/wcpos.svg:11` ×2; `packages/core/src/assets/icon.svg:15`; `packages/core/src/assets/icon.svg:16`; `packages/core/src/assets/icon.svg:17`; `packages/core/src/assets/icon.svg:18` ×2; `packages/core/src/assets/icon-b&w.svg:8` ×2; `packages/core/src/assets/icon-b&w.svg:9` ×2; `packages/core/src/assets/icon-b&w.svg:10` ×2; `packages/core/src/assets/icon-square.svg:15`; `packages/core/src/assets/icon-square.svg:16`; `packages/core/src/assets/icon-square.svg:17`; `packages/core/src/assets/icon-square.svg:18` ×2; `packages/core/src/assets/icon-round.svg:21`; `packages/core/src/assets/icon-round.svg:22`; `packages/core/src/assets/icon-round.svg:23`; `packages/core/src/assets/icon-round.svg:24` ×2 |
| `#FFF3C4` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:463`; `packages/core/src/contexts/theme/palettes/blue-grey.html:466`; `packages/core/src/contexts/theme/palettes/blue-grey.json:58` |
| `#FFFBEA` | 3 | `packages/core/src/contexts/theme/palettes/blue-grey.html:456`; `packages/core/src/contexts/theme/palettes/blue-grey.html:459`; `packages/core/src/contexts/theme/palettes/blue-grey.json:57` |
| `#ffffff` **one-off** | 1 | `packages/components/src/table/pulse-row.test.tsx:50` |
| `rgba(0,0,0,0.1)` **one-off** | 1 | `packages/core/src/contexts/theme/palettes/blue-grey.html:44` |
| `transparent` | 2 | `packages/components/src/dnd/native/sortable-item.tsx:340`; `packages/components/src/dnd/native/drop-indicator.tsx:54` |
| `white` | 2 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:140`; `packages/core/src/contexts/theme/palettes/blue-grey.html:41` |

### Non-semantic named/palette utilities — both source trees

**32 occurrences, 17 utility values**; **24** are in the selected graph, **8** outside (legacy print, drawer/header hover, and another settings tab). Commented-out `bg-gray-200` panel code and `fill-white` arrows are not usage. Static semantic `bg-transparent`/`text-transparent`/`border-transparent` are neutral clearing operations, not extra hues.

| Non-semantic utility | All-tree count | In selected graph | Every location |
|---|---:|---:|---|
| `bg-amber-50` **one-off** | 1 | 1 | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:18` |
| `bg-black` **one-off** | 1 | 1 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:193` |
| `bg-black/50` | 3 | 3 | `packages/components/src/combobox/combobox.tsx:188`; `packages/components/src/lib/phone-sheet.tsx:23`; `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx:161` |
| `bg-black/60` **one-off** | 1 | 1 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:214` |
| `bg-black/70` | 6 | 6 | `packages/components/src/alert-dialog/index.tsx:27`; `packages/components/src/alert-dialog/index.tsx:44`; `packages/components/src/dialog/index.tsx:78`; `packages/components/src/dialog/index.tsx:152`; `packages/components/src/modal/index.tsx:145`; `packages/components/src/modal/index.tsx:184` |
| `bg-blue-700` **one-off** | 1 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:45` |
| `bg-white` | 2 | 2 | `packages/components/src/webview/index.web.tsx:186`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:124` |
| `bg-white/10` | 4 | 0 | `packages/core/src/screens/main/components/drawer-content/drawer-item.tsx:93`; `packages/core/src/screens/main/components/drawer-content/drawer-item.tsx:133`; `packages/core/src/screens/main/components/header/notification-bell.tsx:35` ×2 |
| `border-amber-300` **one-off** | 1 | 1 | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:18` |
| `border-black` | 2 | 0 | `packages/components/src/print/text.tsx:28`; `packages/components/src/print/text.tsx:29` |
| `border-blue-700` **one-off** | 1 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:45` |
| `border-gray-400` **one-off** | 1 | 0 | `packages/components/src/print/line.tsx:5` |
| `text-amber-800` **one-off** | 1 | 1 | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:19` |
| `text-gray-300` | 2 | 2 | `packages/components/src/sort-icon/index.tsx:26`; `packages/components/src/sort-icon/index.tsx:34` |
| `text-green-600` **one-off** | 1 | 0 | `packages/core/src/screens/main/settings/printer/dialog/connection/network-fields.tsx:111` |
| `text-white` | 3 | 3 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:209`; `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:216`; `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx:162` |
| `text-white/80` **one-off** | 1 | 1 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:221` |

### Semantic utility census (selected graph)

| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `bg-accent` | 31 | 2 | 29 | `packages/core/src/screens/main/components/meta-data-form.tsx:53`; `packages/core/src/screens/main/pos/cart/register-count.tsx:47`<br>Qualified: `web:hover:bg-accent` ×5, `active:bg-accent` ×14, `web:focus:bg-accent` ×8 |
| `bg-accent/50` | 4 | 0 | 4 | `packages/components/src/combobox/combobox.tsx:383`; `packages/components/src/select/index.tsx:276`<br>Qualified: `web:hover:bg-accent/50` ×4 |
| `bg-accent/80` **one-off** | 1 | 0 | 1 | `packages/components/src/icon-button/index.tsx:18`; sole occurrence<br>Qualified: `web:hover:bg-accent/80` ×1 |
| `bg-accent/90` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:71`; `packages/components/src/button/index.tsx:88`<br>Qualified: `web:hover:bg-accent/90` ×2 |
| `bg-attention` | 6 | 1 | 5 | `packages/core/src/screens/main/components/header/upgrade-notice.tsx:33`; `packages/components/src/button/index.tsx:40`<br>Qualified: `active:bg-attention` ×2, `web:hover:bg-attention` ×1 |
| `bg-attention/10` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:152`; sole occurrence |
| `bg-attention/15` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:78`; sole occurrence |
| `bg-attention/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:62`; sole occurrence<br>Qualified: `web:hover:bg-attention/90` ×1 |
| `bg-background` | 13 | 6 | 7 | `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx:107`; `apps/main/app/(app)/(drawer)/(pos)/_layout.tsx:157` |
| `bg-background/95` | 2 | 2 | 0 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:87`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:87` |
| `bg-border` **one-off** | 1 | 0 | 1 | `packages/components/src/dropdown-menu/index.tsx:198`; sole occurrence |
| `bg-card` | 28 | 9 | 19 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:67`; `packages/core/src/screens/main/components/data-table/list-footer.tsx:16` |
| `bg-card-header` | 8 | 7 | 1 | `packages/core/src/screens/main/components/product/variable-product-row/variations/filters.tsx:41`; `packages/core/src/screens/main/orders/index.tsx:128` |
| `bg-destructive` | 9 | 1 | 8 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:46`; `packages/components/src/button/index.tsx:35`<br>Qualified: `active:bg-destructive` ×3, `web:hover:bg-destructive` ×2, `web:focus:bg-destructive` ×1 |
| `bg-destructive/10` | 9 | 9 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:45`; `packages/core/src/screens/main/pos/checkout/checkout.tsx:200` |
| `bg-destructive/15` | 4 | 0 | 4 | `packages/components/src/avatar/index.tsx:44`; `packages/components/src/button/index.tsx:76`<br>Qualified: `web:hover:bg-destructive/15` ×1 |
| `bg-destructive/5` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:43`; sole occurrence |
| `bg-destructive/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:58`; sole occurrence<br>Qualified: `web:hover:bg-destructive/90` ×1 |
| `bg-error` | 6 | 0 | 6 | `packages/components/src/button/index.tsx:42`; `packages/components/src/error-boundary/fallback.tsx:35`<br>Qualified: `active:bg-error` ×2, `web:hover:bg-error` ×1 |
| `bg-error/15` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:80`; sole occurrence |
| `bg-error/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:66`; sole occurrence<br>Qualified: `web:hover:bg-error/90` ×1 |
| `bg-footer` | 5 | 4 | 1 | `packages/core/src/screens/main/components/data-table/footer.tsx:49`; `packages/core/src/screens/main/components/data-table/skeleton.tsx:50` |
| `bg-foreground` **one-off** | 1 | 0 | 1 | `packages/components/src/dropdown-menu/index.tsx:170`; sole occurrence |
| `bg-info` | 4 | 0 | 4 | `packages/components/src/button/index.tsx:39`; `packages/components/src/button/index.tsx:60`<br>Qualified: `active:bg-info` ×2, `web:hover:bg-info` ×1 |
| `bg-info/15` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:77`; `packages/components/src/status-badge/index.tsx:16` |
| `bg-info/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:60`; sole occurrence<br>Qualified: `web:hover:bg-info/90` ×1 |
| `bg-input` **one-off** | 1 | 0 | 1 | `packages/components/src/input/index.tsx:39`; sole occurrence |
| `bg-muted` | 35 | 17 | 18 | `packages/core/src/screens/auth/components/add-user-button.tsx:86`; `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:50`<br>Qualified: `active:bg-muted` ×4, `web:hover:bg-muted` ×2, `hover:bg-muted` ×1 |
| `bg-muted-foreground` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:51`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:652` |
| `bg-muted-foreground/40` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:161`; sole occurrence |
| `bg-muted/15` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:74`; `packages/components/src/icon-button/index.tsx:20`<br>Qualified: `web:hover:bg-muted/15` ×1 |
| `bg-muted/30` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/modal.tsx:81`; sole occurrence |
| `bg-muted/40` | 5 | 4 | 1 | `packages/core/src/screens/main/pos/cart/totals.tsx:88`; `packages/core/src/screens/main/pos/cart/totals/customer-note.tsx:60` |
| `bg-muted/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:54`; sole occurrence<br>Qualified: `web:hover:bg-muted/90` ×1 |
| `bg-popover` | 12 | 0 | 12 | `packages/components/src/combobox/combobox.tsx:218`; `packages/components/src/dropdown-menu/index.tsx:65`<br>Qualified: `web:group-hover:bg-popover` ×1 |
| `bg-primary` | 16 | 0 | 16 | `packages/components/src/button/index.tsx:34`; `packages/components/src/checkbox/index.tsx:18`<br>Qualified: `active:bg-primary` ×3, `web:hover:bg-primary` ×2 |
| `bg-primary/10` | 7 | 6 | 1 | `packages/core/src/screens/auth/components/add-user-button.tsx:93`; `packages/core/src/screens/auth/components/store-select.tsx:194` |
| `bg-primary/15` | 4 | 0 | 4 | `packages/components/src/avatar/index.tsx:41`; `packages/components/src/button/index.tsx:72`<br>Qualified: `web:hover:bg-primary/15` ×1 |
| `bg-primary/5` | 4 | 4 | 0 | `packages/core/src/screens/auth/components/add-user-button.tsx:89`; `packages/core/src/screens/auth/components/store-select.tsx:195`<br>Qualified: `active:bg-primary/5` ×1, `web:hover:bg-primary/5` ×2 |
| `bg-primary/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:50`; sole occurrence<br>Qualified: `web:hover:bg-primary/90` ×1 |
| `bg-secondary` | 5 | 0 | 5 | `packages/components/src/button/index.tsx:36`; `packages/components/src/button/index.tsx:52`<br>Qualified: `active:bg-secondary` ×2, `web:hover:bg-secondary` ×1 |
| `bg-secondary/15` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:73`; `packages/components/src/icon-button/index.tsx:22`<br>Qualified: `web:hover:bg-secondary/15` ×1 |
| `bg-secondary/20` **one-off** | 1 | 0 | 1 | `packages/components/src/progress/index.tsx:31`; sole occurrence |
| `bg-secondary/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:52`; sole occurrence<br>Qualified: `web:hover:bg-secondary/90` ×1 |
| `bg-sidebar` | 5 | 5 | 0 | `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:68`; `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:75` |
| `bg-sidebar-foreground` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:103`; sole occurrence |
| `bg-sidebar-foreground/10` | 8 | 4 | 4 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:85`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:434`<br>Qualified: `web:hover:bg-sidebar-foreground/10` ×2, `active:bg-sidebar-foreground/10` ×1 |
| `bg-sidebar-foreground/15` | 3 | 2 | 1 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:217`; `packages/components/src/button/index.tsx:107`<br>Qualified: `active:bg-sidebar-foreground/15` ×1 |
| `bg-sidebar-foreground/20` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:105`; `packages/components/src/button/index.tsx:105`<br>Qualified: `web:hover:bg-sidebar-foreground/20` ×1, `active:bg-sidebar-foreground/20` ×1 |
| `bg-success` | 11 | 6 | 5 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:36`; `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:90`<br>Qualified: `active:bg-success` ×2, `web:hover:bg-success` ×1 |
| `bg-success-foreground` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:92`; sole occurrence |
| `bg-success/10` | 3 | 3 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:35`; `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:52` |
| `bg-success/15` | 4 | 0 | 4 | `packages/components/src/avatar/index.tsx:42`; `packages/components/src/button/index.tsx:75`<br>Qualified: `web:hover:bg-success/15` ×1 |
| `bg-success/20` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:368`; sole occurrence |
| `bg-success/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:56`; sole occurrence<br>Qualified: `web:hover:bg-success/90` ×1 |
| `bg-table-header` **one-off** | 1 | 0 | 1 | `packages/components/src/table/index.tsx:91`; sole occurrence |
| `bg-warning` | 5 | 1 | 4 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:41`; `packages/components/src/button/index.tsx:41`<br>Qualified: `active:bg-warning` ×2, `web:hover:bg-warning` ×1 |
| `bg-warning/10` | 3 | 2 | 1 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:40`; `packages/core/src/screens/main/pos/checkout/tender/legacy-tab.tsx:52` |
| `bg-warning/15` | 3 | 0 | 3 | `packages/components/src/avatar/index.tsx:43`; `packages/components/src/button/index.tsx:79` |
| `bg-warning/90` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:64`; sole occurrence<br>Qualified: `web:hover:bg-warning/90` ×1 |
| `border-attention` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:62`; sole occurrence |
| `border-attention/30` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:216`; `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:272` |
| `border-attention/50` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/totals-changed-banner.tsx:152`; sole occurrence |
| `border-border` | 76 | 41 | 35 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:67`; `packages/core/src/screens/auth/components/add-user-button.tsx:88`<br>Qualified: `web:group-hover:border-border` ×1 |
| `border-border/40` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:87`; sole occurrence |
| `border-border/50` | 3 | 2 | 1 | `packages/core/src/screens/main/settings/components/settings-danger-zone.tsx:27`; `packages/core/src/screens/main/settings/components/settings-section.tsx:28`<br>Qualified: `hover:border-border/50` ×1 |
| `border-border/60` | 4 | 4 | 0 | `packages/core/src/screens/main/orders/view/sections/line-items.tsx:42`; `packages/core/src/screens/main/orders/view/sections/refunds.tsx:43` |
| `border-destructive` | 8 | 7 | 1 | `packages/core/src/screens/main/pos/checkout/checkout.tsx:200`; `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:123` |
| `border-destructive/25` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:45`; sole occurrence |
| `border-destructive/40` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/products/storage-outage-banner.tsx:52`; sole occurrence |
| `border-error` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:66`; sole occurrence |
| `border-info` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:60`; sole occurrence |
| `border-input` | 2 | 0 | 2 | `packages/components/src/select/index.tsx:303`; `packages/components/src/toggle/index.tsx:16` |
| `border-l-primary` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:153`; sole occurrence |
| `border-muted` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:54`; sole occurrence |
| `border-primary` | 5 | 1 | 4 | `packages/core/src/screens/auth/components/store-select.tsx:194`; `packages/components/src/button/index.tsx:50` |
| `border-primary/40` | 2 | 2 | 0 | `packages/core/src/screens/auth/components/add-user-button.tsx:89`; `packages/core/src/screens/auth/components/store-select.tsx:195`<br>Qualified: `web:hover:border-primary/40` ×2 |
| `border-secondary` **one-off** | 1 | 0 | 1 | `packages/components/src/button/index.tsx:52`; sole occurrence |
| `border-sidebar-border` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:124`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:368` |
| `border-sidebar-foreground` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:368`; `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:225` |
| `border-sidebar-foreground/15` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`; sole occurrence |
| `border-sidebar-foreground/70` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:225`; sole occurrence |
| `border-success` | 3 | 2 | 1 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:124`; `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:200` |
| `border-success/25` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:35`; sole occurrence |
| `border-success/30` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:368`; sole occurrence |
| `border-t-sidebar-foreground/80` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`; sole occurrence |
| `border-warning` | 2 | 1 | 1 | `packages/core/src/screens/main/pos/checkout/tender/legacy-tab.tsx:52`; `packages/components/src/button/index.tsx:64` |
| `border-warning/25` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:40`; sole occurrence |
| `border-warning/40` **one-off** | 1 | 0 | 1 | `packages/components/src/list-item/index.tsx:38`; sole occurrence |
| `fill-accent-foreground` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/cells/actions.tsx:254`; sole occurrence<br>Qualified: `web:group-focus:fill-accent-foreground` ×1 |
| `fill-destructive` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/cells/actions.tsx:254`; sole occurrence |
| `fill-muted-foreground` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:100`; sole occurrence |
| `fill-primary-foreground` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/auth/components/store-select.tsx:224`; sole occurrence |
| `fill-secondary-foreground` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/totals/customer-note.tsx:63`; sole occurrence |
| `fill-warning` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/auth/components/site.tsx:104`; sole occurrence |
| `outline-attention` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:61`; `packages/components/src/button/index.tsx:163` |
| `outline-destructive` | 5 | 3 | 2 | `packages/core/src/screens/main/orders/view/modal.tsx:97`; `packages/core/src/screens/main/pos/cart/user-sheet.tsx:176` |
| `outline-error` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:65`; `packages/components/src/button/index.tsx:165` |
| `outline-info` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:59`; `packages/components/src/button/index.tsx:162` |
| `outline-muted` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:53`; `packages/components/src/button/index.tsx:159` |
| `outline-primary` | 3 | 1 | 2 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:169`; `packages/components/src/button/index.tsx:49` |
| `outline-secondary` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:51`; `packages/components/src/button/index.tsx:158` |
| `outline-success` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:55`; `packages/components/src/button/index.tsx:160` |
| `outline-warning` | 3 | 1 | 2 | `packages/core/src/screens/auth/components/wp-user.tsx:142`; `packages/components/src/button/index.tsx:63` |
| `ring-muted-foreground` **one-off** | 1 | 0 | 1 | `packages/components/src/accordion/index.tsx:78`; sole occurrence<br>Qualified: `web:focus-visible:ring-muted-foreground` ×1 |
| `ring-offset-background` | 15 | 0 | 15 | `packages/components/src/button/index.tsx:27`; `packages/components/src/checkbox/index.tsx:17`<br>Qualified: `web:ring-offset-background` ×14, `focus-visible:ring-offset-background` ×1 |
| `ring-ring` | 13 | 0 | 13 | `packages/components/src/button/index.tsx:27`; `packages/components/src/checkbox/index.tsx:17`<br>Qualified: `web:focus-visible:ring-ring` ×8, `web:ring-ring` ×1, `web:focus:ring-ring` ×3, `focus-visible:ring-ring` ×1 |
| `text-accent-foreground` | 18 | 0 | 18 | `packages/components/src/button/index.tsx:48`; `packages/components/src/combobox/combobox.tsx:353`<br>Qualified: `web:hover:text-accent-foreground` ×2, `group-active:text-accent-foreground` ×3, `web:group-hover:text-accent-foreground` ×3, `web:group-focus:text-accent-foreground` ×5, `native:text-accent-foreground` ×1, `web:group-active:text-accent-foreground` ×1 |
| `text-attention` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:184`; `packages/components/src/icon/index.tsx:53` |
| `text-attention-foreground` | 7 | 2 | 5 | `packages/core/src/screens/main/components/header/upgrade-notice.tsx:36`; `packages/components/src/button/index.tsx:62`<br>Qualified: `web:hover:text-attention-foreground` ×1, `group-active:text-attention-foreground` ×2, `web:group-hover:text-attention-foreground` ×1 |
| `text-card-foreground` | 2 | 0 | 2 | `packages/components/src/card/index.tsx:26`; `packages/components/src/card/index.tsx:40` |
| `text-destructive` | 39 | 31 | 8 | `packages/core/src/screens/auth/components/url-input.tsx:51`; `packages/core/src/screens/main/components/order/total.tsx:36` |
| `text-destructive-foreground` | 8 | 0 | 8 | `packages/components/src/button/index.tsx:58`; `packages/components/src/dropdown-menu/item.tsx:31`<br>Qualified: `web:hover:text-destructive-foreground` ×1, `group-active:text-destructive-foreground` ×2, `web:group-hover:text-destructive-foreground` ×2, `web:group-focus:text-destructive-foreground` ×1 |
| `text-error` | 6 | 4 | 2 | `packages/core/src/screens/main/components/form-errors.tsx:33`; `packages/core/src/screens/main/components/product/tax-based-on/display-current-tax-rates.tsx:125` |
| `text-error-foreground` | 9 | 0 | 9 | `packages/components/src/button/index.tsx:66`; `packages/components/src/error-boundary/fallback.tsx:40`<br>Qualified: `web:hover:text-error-foreground` ×1, `group-active:text-error-foreground` ×2, `web:group-hover:text-error-foreground` ×1 |
| `text-foreground` | 47 | 28 | 19 | `packages/core/src/screens/main/components/order/order-status-select.tsx:23`; `packages/core/src/screens/main/orders/view/modal.tsx:43` |
| `text-foreground/80` | 9 | 9 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:155`; `packages/core/src/screens/main/orders/view/sections/header.tsx:106` |
| `text-info` | 3 | 0 | 3 | `packages/components/src/button/index.tsx:182`; `packages/components/src/icon/index.tsx:51` |
| `text-info-foreground` | 5 | 0 | 5 | `packages/components/src/button/index.tsx:60`; `packages/components/src/button/index.tsx:148`<br>Qualified: `web:hover:text-info-foreground` ×1, `group-active:text-info-foreground` ×2, `web:group-hover:text-info-foreground` ×1 |
| `text-muted` | 2 | 0 | 2 | `packages/components/src/button/index.tsx:176`; `packages/components/src/loader/index.tsx:45` |
| `text-muted-foreground` | 161 | 127 | 34 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:76`; `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx:59`<br>Qualified: `web:hover:text-muted-foreground` ×1, `group-active:text-muted-foreground` ×3, `web:group-hover:text-muted-foreground` ×3, `placeholder:text-muted-foreground` ×1 |
| `text-muted-foreground/50` | 3 | 3 | 0 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:99`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:77`<br>Qualified: `disabled:text-muted-foreground/50` ×1 |
| `text-muted-foreground/70` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/line-items.tsx:78`; sole occurrence |
| `text-muted-foreground/80` | 2 | 2 | 0 | `packages/core/src/screens/main/orders/view/sections/totals.tsx:91`; `packages/core/src/screens/main/orders/view/sections/totals.tsx:112` |
| `text-popover-foreground` | 19 | 0 | 19 | `packages/components/src/combobox/combobox.tsx:197`; `packages/components/src/dropdown-menu/item.tsx:25` |
| `text-primary` | 21 | 14 | 7 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:76`; `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx:59` |
| `text-primary-foreground` | 9 | 0 | 9 | `packages/components/src/button/index.tsx:50`; `packages/components/src/checkbox/index.tsx:26`<br>Qualified: `web:hover:text-primary-foreground` ×1, `group-active:text-primary-foreground` ×2, `web:group-hover:text-primary-foreground` ×1 |
| `text-secondary` | 4 | 1 | 3 | `packages/core/src/screens/main/components/customer-select.tsx:187`; `packages/components/src/button/index.tsx:174` |
| `text-secondary-foreground` | 7 | 1 | 6 | `packages/core/src/screens/main/pos/products/cells/meta-data.tsx:46`; `packages/components/src/button/index.tsx:52`<br>Qualified: `web:hover:text-secondary-foreground` ×1, `group-active:text-secondary-foreground` ×3, `web:group-hover:text-secondary-foreground` ×1 |
| `text-sidebar` | 2 | 1 | 1 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:654`; `packages/components/src/button/index.tsx:192` |
| `text-sidebar-foreground` | 16 | 13 | 3 | `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:68`; `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:80` |
| `text-sidebar-foreground/70` | 22 | 22 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:76`; `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:311` |
| `text-success` | 12 | 7 | 5 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:37`; `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:54` |
| `text-success-foreground` | 9 | 4 | 5 | `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:177`; `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:127`<br>Qualified: `web:hover:text-success-foreground` ×1, `group-active:text-success-foreground` ×2, `web:group-hover:text-success-foreground` ×1 |
| `text-warning` | 16 | 12 | 4 | `packages/core/src/screens/auth/components/site.tsx:105`; `packages/core/src/screens/auth/components/sites.tsx:213` |
| `text-warning-foreground` | 5 | 0 | 5 | `packages/components/src/button/index.tsx:64`; `packages/components/src/button/index.tsx:150`<br>Qualified: `web:hover:text-warning-foreground` ×1, `group-active:text-warning-foreground` ×2, `web:group-hover:text-warning-foreground` ×1 |

## E. CONTROL SHAPES

**Observed source shapes; inferred physical sizes:** 197 dimensional declarations across **51 forms** (112 S / 85 L), shown below. This includes spinners, logos, separators, paper bounds and flex-layout constraints; **it is NOT a count of 197 controls**. Heights alone also do not prove 44×44 targets—width, inherited layout, native implementation and hitSlop matter.

For ordinary rem utilities, nominal native `h-n` is **4n** layout units; web at the authored 14px root is **3.5n** CSS px (`apps/main/global.css:594-608`). These are source-derived expectations, not measured points. In particular `h-11` means 44 native but roughly **38.5 web**, not a universal 44px guarantee. Arbitrary `h-[44px]` is a different contract.

### Actual control contracts and selected uses

| Control / number of defined height choices | Authored heights and nominal native units | Evidence / selected usage |
|---|---|---|
| Button: **7 size keys, 5 distinct heights** | xs `h-6`=24; compact/sm `h-9`=36; default `h-10`=40; lg `h-11`=44; xl/key `h-14`=56 | `packages/components/src/button/index.tsx:117-124`; Connect default `packages/core/src/screens/auth/components/url-input.tsx:41`; Pay lg `packages/core/src/screens/main/pos/cart/buttons/pay.tsx:182`. |
| Input: **1 default height** | `h-10`=40, `rounded-md`; custom caller may override | `packages/components/src/input/index.tsx:39`; mounted Connect `packages/core/src/screens/auth/components/url-input.tsx:26` and settings `packages/core/src/screens/main/settings/general.tsx:207` (FormInput below that row). |
| Select trigger: **1 default height / 2 platform branches** | `h-10`=40 | `packages/components/src/select/index.tsx:126,143`; receipt switchers `packages/core/src/screens/main/receipt/printer-switcher.tsx:78`, `template-switcher.tsx:60`. |
| Combobox trigger: **1 default height** | `h-10`=40 | `packages/components/src/combobox/combobox.tsx:136`; mounted General language and currency controls `packages/core/src/screens/main/components/language-select.tsx:58`, `currency-select.tsx:52`. |
| Toggle / variation option: **3 size keys, platform overrides** | default `h-10 native:h-12` (40→48 native override); sm `h-9 native:h-10`; lg `h-11 native:h-14` | `packages/components/src/toggle/index.tsx:19-21`; variation picker uses default ToggleGroupItem `packages/core/src/screens/main/pos/products/cells/variations-popover/buttons.tsx:40-48`. Literal `native:` override resolution not runtime-tested. |
| IconButton: **8 size keys**, no minimum height | Icon size + `p-2`; xs/sm use `p-1`. Default ≈18+16=34; xs≈14+8=22; sm≈16+8=24; lg≈20+16=36; 4xl≈36+16=52 native, before overrides | `packages/components/src/icon-button/index.tsx:14,25-33,87-94`; scale `packages/components/src/icon/index.tsx:56-63`. Orders actions default `packages/core/src/screens/main/orders/cells/actions.tsx:183`; product add 4xl `packages/core/src/screens/main/pos/products/cells/actions.tsx:19-23`. |
| Cart customer chip: **1 selected size** | ButtonPill xs → `h-6`=24 | `packages/core/src/screens/main/pos/cart/cart-header.tsx:81`; `packages/components/src/button/index.tsx:118` and ButtonPill forwarding at `:414`. |
| Cart tabs / generic TabsTrigger: **content-sized**, no minimum | `text-sm` + `py-1.5` (12 native vertical padding), not 44 minimum | `packages/components/src/tabs/index.tsx:300,306`; `packages/core/src/screens/main/pos/cart/tabs.tsx:62,78`. Icon-bearing tabs can differ from label-only tabs. |
| Table header: **1 explicit height**; body row: **0 fixed-height contracts** | Header `h-8`=32; cells `p-2`, height follows contents; body `minHeight:2` is NOT a 2pt row | `packages/components/src/table/index.tsx:30,79,91,107`; sortable Pressable fills header at `packages/core/src/screens/main/components/data-table/header.tsx:46-49`. `estimatedItemSize ?? 50` (`data-table/index.tsx:256`, same component prefix) is a virtualization estimate, not CSS height. |
| ListItem: **0 fixed-height contracts** | `p-3` + content; title/subtitle determine height; xs remove affordance is separately small | `packages/components/src/list-item/index.tsx:33,91-107`; auth user mounts it `packages/core/src/screens/auth/components/wp-user.tsx:161`. Do not assert every list row is under 44. |
| Select/combobox/dropdown items: **content-sized** | Typical `py-1.5` + text-sm/base, no minimum | `packages/components/src/select/index.tsx:276,288`; `packages/components/src/combobox/combobox.tsx:383,408`; `packages/components/src/dropdown-menu/item.tsx:25`. |
| Receipt zoom: **2 buttons per platform / 3 sizing declarations** | Native two `h-7 w-7`=28; web shared class `h-7 w-7`≈24.5px | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:95,118`; `receipt-preview-viewport.web.tsx:77` in same directory, used `:95,113`. |
| Textarea: **1 numeric minimum**, overridden in note form | 40 raw units; cart note `minHeight={80}` | `packages/components/src/textarea/index.tsx:19,44`; `packages/core/src/screens/main/pos/cart/buttons/edit-order-meta/form.tsx:257`. |
| Product tiles: **0 fixed-height contracts** | Width/column count controls square image plus content below | `packages/core/src/screens/main/pos/products/grid/product-tile.tsx:69-76`; `grid/variable-product-tile.tsx:151-166` in same POS products prefix. Not evidence of an undersized tile. |

**Same-screen answer, not just a catalogue:**
- **POS:** register-bar actions explicitly `h-11` (`packages/core/src/screens/main/pos/cart/register-bar.tsx:68,98,108`), customer pill `h-6` (`cart-header.tsx:81`), tabs content-sized, Pay `h-11`; opening/closing register actions `min-h-14` (`open-register-card.tsx:78`; `closure-sheet.tsx:125`, all same cart prefix). **Not one target-height policy.**
- **Orders:** search Input 40, settings/action IconButton ≈34, sortable header 32, data rows content-sized (`packages/core/src/screens/main/orders/index.tsx:131-138`; `orders/cells/actions.tsx:183`; table definitions above). **Not equal.**
- **General:** Input/Select/Combobox share 40; restore-server Button sm is 36 (`packages/core/src/screens/main/settings/components/settings-danger-zone.tsx:29-31`); row outer `py-2.5` is not the input's tap area (`settings-row.tsx:48`, same components directory). **Coherent fields, smaller action.**
- **Connect:** URL Input + default Button both 40 (`packages/core/src/screens/auth/components/url-input.tsx:26,41`). **Equal, but below native 44.**
- **Receipt:** default footer actions 40 (`packages/components/src/modal/index.tsx:111-123`; `packages/core/src/screens/main/receipt/receipt.tsx:77-79`), Select 40, zoom 28. **Not equal.**
- **Grid/picker:** grid tiles scale with columns; option toggles have the authored native 48 override, long-label Combobox remains 40 (`packages/core/src/screens/main/pos/products/cells/variations-popover/variations.tsx:139-153`). **Changing attribute length can change both shape and height.**

**Under-44 candidates supported by source:** native default/sm/xs Buttons and Inputs/Select/Combobox; xs/sm/default/lg IconButtons; sortable headers; receipt zoom; content-sized tab/menu targets without a minimum. These are candidates, not measured hit-test failures. The wrappers do not add a universal hitSlop/minimum (`packages/components/src/button/index.tsx:294-304`; `packages/components/src/icon-button/index.tsx:75-85`; `packages/components/src/pressable/index.tsx:36`). Avoid blanket conclusions about native upstream controls or mapped row heights.

### Complete dimension utility census (decorative dimensions explicitly included)
| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `h-0.5` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/header.tsx:161`; sole occurrence |
| `h-1.5` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/_status-pill.tsx:69`; sole occurrence |
| `h-10` | 13 | 3 | 10 | `packages/core/src/screens/main/pos/cart/cells/image.tsx:25`; `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:52`<br>Qualified: `native:h-10` ×1 |
| `h-11` | 17 | 15 | 2 | `packages/core/src/screens/auth/components/add-user-button.tsx:86`; `packages/core/src/screens/main/orders/view/sections/line-items.tsx:43` |
| `h-12` | 4 | 3 | 1 | `packages/core/src/screens/main/pos/cart/register-bar.tsx:64`; `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:90`<br>Qualified: `native:h-12` ×1 |
| `h-14` | 7 | 4 | 3 | `packages/core/src/screens/main/pos/cart/movement-sheet.tsx:36`; `packages/core/src/screens/main/pos/cart/register-count.tsx:47`<br>Qualified: `native:h-14` ×1 |
| `h-2` | 3 | 0 | 3 | `packages/components/src/dropdown-menu/index.tsx:170`; `packages/components/src/slider/index.tsx:43` |
| `h-2.5` | 2 | 0 | 2 | `packages/components/src/progress/index.tsx:31`; `packages/components/src/switch/index.tsx:102` |
| `h-20` | 5 | 5 | 0 | `packages/core/src/screens/main/components/product/image.tsx:25`; `packages/core/src/screens/main/components/product/variable-image.tsx:44` |
| `h-24` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:209`; `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:237` |
| `h-3` | 5 | 0 | 5 | `packages/components/src/checkbox/index.tsx:26`; `packages/components/src/switch/index.tsx:23` |
| `h-3.5` | 5 | 0 | 5 | `packages/components/src/combobox/combobox.tsx:391`; `packages/components/src/dropdown-menu/index.tsx:143` |
| `h-4` | 10 | 3 | 7 | `packages/core/src/screens/main/orders/view/sections/refunds.tsx:140`; `packages/core/src/screens/main/pos/cart/checkout-ledger.tsx:44` |
| `h-5` | 7 | 1 | 6 | `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:85`; `packages/components/src/avatar/index.tsx:31`<br>Qualified: `native:h-5` ×1 |
| `h-5.5` **one-off** | 1 | 0 | 1 | `packages/components/src/switch/index.tsx:104`; sole occurrence |
| `h-6` | 5 | 0 | 5 | `packages/components/src/button/index.tsx:118`; `packages/components/src/switch/index.tsx:25` |
| `h-7` | 4 | 3 | 1 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:95`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:77` |
| `h-8` **one-off** | 1 | 0 | 1 | `packages/components/src/table/index.tsx:91`; sole occurrence |
| `h-80` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:88`; sole occurrence |
| `h-9` | 5 | 1 | 4 | `packages/core/src/screens/auth/components/add-user-button.tsx:93`; `packages/components/src/avatar/index.tsx:33` |
| `h-[10]` **one-off** | 1 | 0 | 1 | `packages/components/src/radio-group/index.tsx:63`; sole occurrence<br>Qualified: `native:h-[10]` ×1 |
| `h-[20]` **one-off** | 1 | 0 | 1 | `packages/components/src/checkbox/index.tsx:17`; sole occurrence<br>Qualified: `native:h-[20]` ×1 |
| `h-[2px]` **one-off** | 1 | 0 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:15`; sole occurrence |
| `h-[4.25rem]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:83`; sole occurrence |
| `h-[44px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/column/checkout-column.tsx:76`; sole occurrence |
| `h-[8px]` **one-off** | 1 | 0 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:45`; sole occurrence<br>Qualified: `before:h-[8px]` ×1 |
| `h-[9px]` **one-off** | 1 | 0 | 1 | `packages/components/src/radio-group/index.tsx:63`; sole occurrence |
| `h-px` | 3 | 1 | 2 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:217`; `packages/components/src/dropdown-menu/index.tsx:198` |
| `max-h-96` | 2 | 0 | 2 | `packages/components/src/select/index.tsx:185`; `packages/components/src/select/select-multi.tsx:160` |
| `max-h-[300px]` | 2 | 0 | 2 | `packages/components/src/combobox/combobox.tsx:218`; `packages/components/src/tree-combobox/tree-combobox.tsx:400` |
| `max-h-[85%]` | 2 | 0 | 2 | `packages/components/src/dialog/index.tsx:206`; `packages/components/src/modal/index.tsx:236` |
| `min-h-0` | 21 | 21 | 0 | `apps/main/app/(app)/(drawer)/(pos)/(tabs)/index.tsx:18`; `packages/core/src/screens/main/pos/cart/add-customer.tsx:109` |
| `min-h-11` | 22 | 22 | 0 | `packages/core/src/screens/main/pos/cart/approve-sheet.tsx:64`; `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:59` |
| `min-h-14` | 11 | 11 | 0 | `packages/core/src/screens/main/pos/cart/approve-sheet.tsx:83`; `packages/core/src/screens/main/pos/cart/closure-sheet.tsx:105` |
| `min-h-4` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:173`; `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:334` |
| `min-h-56` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:562`; sole occurrence |
| `min-h-6` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:354`; sole occurrence |
| `min-h-8` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/checkout-ledger.tsx:42`; sole occurrence |
| `size-2` | 2 | 2 | 0 | `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:652`; `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:200` |
| `size-3.5` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:57`; `packages/components/src/loader/index.tsx:50` |
| `size-4` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:58`; `packages/components/src/loader/index.tsx:51` |
| `size-4.5` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:56`; `packages/components/src/loader/index.tsx:49` |
| `size-5` | 3 | 1 | 2 | `packages/core/src/screens/main/pos/checkout/tender/split-view.tsx:124`; `packages/components/src/icon/index.tsx:59` |
| `size-6` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:60`; `packages/components/src/loader/index.tsx:53` |
| `size-7` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:61`; `packages/components/src/loader/index.tsx:54` |
| `size-8` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:62`; `packages/components/src/loader/index.tsx:55` |
| `size-9` | 2 | 0 | 2 | `packages/components/src/icon/index.tsx:63`; `packages/components/src/loader/index.tsx:56` |
| `size-[112px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`; sole occurrence |
| `size-[14px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:225`; sole occurrence |
| `size-[26px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:220`; sole occurrence |
| `size-[96px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:92`; sole occurrence |

## F. OVERLAYS

**12 presentation/API families**, not twelve unrelated implementations: Dialog; route Modal/Panel; Popover; Combobox/TreeCombobox; PhoneSheetShell; Select/SelectMulti; DropdownMenu; Tooltip; Toast; AlertDialog; HoverCard; custom absolute layers. Several share `@rn-primitives` and identical tokens. **No separately mounted native `Alert.alert` or standalone `<Sheet>` was found in the selected screens.** File names ending “sheet” do not establish a new mechanism.

| Family | Mechanism / counts / two evidence points where available | Screens |
|---|---|---|
| Dialog | Local controlled state + dialog primitive (`packages/components/src/dialog/index.tsx:4,30,234`); cart customer `packages/core/src/screens/main/pos/cart/customer.tsx:41,54`; receipt email `packages/core/src/screens/main/receipt/receipt-actions.tsx:43,47` | POS local tasks, receipt email, shared settings/UI editors |
| Modal / Panel | Route-backed close uses `router.back()` (`packages/components/src/modal/index.tsx:80-83`); Panel is alias (`:341-349`), **not another engine**; Orders view `packages/core/src/screens/main/orders/view/modal.tsx:62`; Receipt `packages/core/src/screens/main/receipt/receipt.tsx:67` | Orders detail, receipt, POS route tasks |
| Popover | Primitive portal/overlay (`packages/components/src/popover/index.tsx:5,31-32`); **2 variation triggers** `packages/core/src/screens/main/pos/products/cells/variable-actions.tsx:43`, `grid/variable-product-tile.tsx:151` in same products prefix | Product list + grid variation picker |
| Combobox / TreeCombobox | Own popover presentation (`packages/components/src/combobox/combobox.tsx:213-218`; `packages/components/src/tree-combobox/tree-combobox.tsx:400`) | General language/country/customer/currency; product attributes/filter trees |
| PhoneSheetShell | **2 responsive combobox presentations:** phone sheet `packages/components/src/combobox/combobox.tsx:190-202`, larger anchored popover `:213-218`; absolute dismiss backdrop/panel `packages/components/src/lib/phone-sheet.tsx:23-36` | Phone combobox choices; not all select-like controls |
| Select / SelectMulti | Separate select/popover wrappers (`packages/components/src/select/index.tsx:173-185`; `packages/components/src/select/select-multi.tsx:160`) | Receipt's **2 selectors**, settings and form fields; not every multi-select definition is selected |
| DropdownMenu | `packages/components/src/dropdown-menu/index.tsx:4,89-90`; **2 direct selected-screen action roots**, cart `packages/core/src/screens/main/pos/cart/add-cart-items-menu.tsx:41`, Orders `packages/core/src/screens/main/orders/cells/actions.tsx:181` | Cart add-item menu and Orders actions |
| Tooltip | **2 platform implementations**: web `packages/components/src/tooltip/index.web.tsx:12-16`; native defaults off `packages/components/src/tooltip/index.tsx:19-28,73-77`; Orders note explicitly opts in `packages/core/src/screens/main/orders/cells/note.tsx:20` | POS, Orders, shared fallback/help controls; not all desktop tips appear on native |
| Toast | **1 API / 2 engines**: `sonner` web `packages/components/src/toast/sonner.web.tsx:1`; `sonner-native` `packages/components/src/toast/sonner.tsx:1`; two representative callers `packages/core/src/screens/main/pos/cart/open-register-card.tsx:32`, `packages/core/src/screens/main/receipt/email.tsx:88` | POS/receipt direct; auth/orders also logger-driven notifications |
| AlertDialog | Shared confirmation primitive `packages/components/src/alert-dialog/index.tsx:5,14`; auth removals `packages/core/src/screens/auth/components/site.tsx:112`, `wp-user.tsx:185` | Auth, Orders delete, cart send confirmation; adjacent refund/filter confirmations |
| HoverCard | **1 shared tax-explainer root** `packages/core/src/screens/main/components/product/tax-based-on/index.tsx:32,47`; mechanism `packages/components/src/hover-card/index.tsx:23-35` | POS tax-basis help; distinct from Tooltip for explanatory content |
| Custom absolute layers | Receipt zoom **2 platform declarations** `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:87`, `.web.tsx:87`; WebView loading **1** `packages/components/src/webview/index.web.tsx:185-187`; camera feedback `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:200,204,214`; splash **1** `packages/core/src/screens/splash/index.tsx:37` | Receipt, camera, first run; zoom is persistent chrome, not a dismissal modal |

### Direct root declaration counts (do not multiply by mapped rows)

| Screen-directory scope | Count | Source locations |
|---|---|---|
| POS cart | **15 Dialog; 5 Tooltip; 1 DropdownMenu; 1 AlertDialog** | Dialog roots: `packages/core/src/screens/main/pos/cart/add-cart-items-menu.tsx:100,117,139,156`; `closure-sheet.tsx:43`; `register-panel.tsx:63`; `customer.tsx:41`; `movement-sheet.tsx:172`; `approve-sheet.tsx:57`; `add-customer.tsx:128,163`; `switch-store-sheet.tsx:28`; `user-sheet.tsx:144`; `cells/edit-cart-item-button.tsx:25`; `buttons/order-meta.tsx:31` (remaining paths relative to the cart directory). Tooltip examples `cart/tabs.tsx:79`, `cart/totals/customer-note.tsx:61`; menu `cart/add-cart-items-menu.tsx:41`; alert `cart/buttons/edit-order-meta/form.tsx:301` (under POS). |
| POS products / grid + adjacent filter-editor route | **2 Popover; 3 Tooltip; 1 Modal; 1 AlertDialog** | Variation triggers above; tips `packages/core/src/screens/main/pos/products/view-mode-toggle.tsx:26`, `camera-scan-button.tsx:19`, `filter-bar/pos-filter-bar.tsx:74`; **adjacent editor**, `filter-bar/modal.tsx:41`, `filter-bar/filter-bar-list.tsx:99` (remaining paths relative to POS products). Editor is not included in the import-only style census. |
| Orders selected list/view | **2 Modal** (found/not-found branches); **1 AlertDialog; 2 Tooltip; 1 DropdownMenu** | `packages/core/src/screens/main/orders/view/modal.tsx:40,62`; `cells/actions.tsx:260`; `cells/note.tsx:20`, `cells/receipt.tsx:27`; `cells/actions.tsx:181` (remaining paths relative to Orders). |
| Orders **adjacent** edit/refund routes | **4 further Modal declarations** (2 branches each); **1 further AlertDialog** | `packages/core/src/screens/main/orders/edit/modal.tsx:27,40`; `refund/modal.tsx:23,36`; `refund/form.tsx:569` (remaining paths relative to Orders). Not part of selected view's style counts. |
| Connect | **3 AlertDialog declarations** | `packages/core/src/screens/auth/components/sites.tsx:181`; `site.tsx:112`; `wp-user.tsx:185` (same auth components directory). First two are alternate site-list layouts. |
| General | **0 direct Dialog/Modal/Tooltip/AlertDialog roots** | Wrappers instead: `packages/core/src/screens/main/settings/general.tsx:33-38`; `packages/core/src/screens/main/components/language-select.tsx:58-62`; `currency-select.tsx:52-56`. |
| Receipt | **2 Modal** branches, **1 Dialog**, **2 selected Select controls** | `packages/core/src/screens/main/receipt/receipt.tsx:39,67`; `receipt-actions.tsx:43`; `printer-switcher.tsx:78`; `template-switcher.tsx:60` (same receipt directory). |

**Same job, different presentation:** cart editing is a side Dialog (`packages/core/src/screens/main/pos/cart/cells/edit-cart-item-button.tsx:36`); email is centered Dialog (`packages/core/src/screens/main/receipt/receipt-actions.tsx:47`); order edit is route side Modal (`packages/core/src/screens/main/orders/edit/modal.tsx:40-41`). These are **3 presentations of short contextual tasks**, but navigation history is a real reason for separate APIs. More actionable: one variation attribute switches from ToggleGroup buttons to Combobox based on label length (`packages/core/src/screens/main/pos/products/cells/variations-popover/variations.tsx:139-153`), and phone Combobox becomes a sheet while Receipt Select uses its select overlay (component references above).

**Login ownership—3 platform flows, not a missing local form:** Electron IPC BrowserWindow `packages/core/src/hooks/use-wcpos-auth/index.electron.ts:73`; native system auth browser `index.ts:100-110`; web popup/redirect `index.web.ts:202-218` (same hook directory). Their remote credential UI was **not evaluated** and cannot be included in local class counts.

## G. BORDERS AND ELEVATION

**Observed:** most border colours are tokenized: `border-border` **76**, with opacity/state alternatives in D. **31 forms** in this width/style/ring/shadow table; **233 declarations** after excluding the non-style string “shadow” in the colour-name parser. These are not 31 border widths.

- **5 authored numeric width magnitudes**: zero; ordinary 1px-width border utilities; 2 (`border-2` and `border-[2px]`); 4 (`border-4`/`border-l-4`); 6 (`border-[6px]`). Evidence: `packages/components/src/button/index.tsx:48`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:77`; `packages/components/src/slider/index.tsx:46`; `packages/components/src/dnd/web/drop-indicator.tsx:45`; `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`; full table gives all forms.
- **Do not label spinner strokes as card borders:** `border-[6px]` is one terminal progress ring (`packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`), and `border-4` belongs to another decorative progress indicator (location in table).
- **Four shadow strengths** in selected UI: bare `shadow` **1**, `shadow-sm` **7**, `shadow-md` **15**, `shadow-lg` **4** = **27 declarations**. **0 RN `elevation:`, `shadowOpacity`, `shadowRadius`, `shadowOffset`, `shadowColor` assignments** found in the full non-test source sweep.
- The actual surface contradiction is **raised Card** (`packages/components/src/card/index.tsx:10`, `shadow-md`, mounted in Orders `packages/core/src/screens/main/orders/index.tsx:127`) vs **flat SettingsPage** (`packages/core/src/screens/main/settings/index.tsx:30-31`, no Card/shadow). Dialog body has no shadow (`packages/components/src/dialog/index.tsx:189`) while route Modal has `shadow-lg` (`packages/components/src/modal/index.tsx:220`): same primitive family, different elevation contract.
- Theme hairline token is declared (`apps/main/global.css:95-96,597`), but **0 `border-hairline` uses** found in the selected class census. Global border colour defaults to the theme (`apps/main/global.css:612-614`); a bare `border` is not automatically a hardcoded colour leak.

| Value (state prefixes folded) | Total | Screen/helper S | Library definition L | Evidence (two locations when available) |
|---|---:|---:|---:|---|
| `border` | 75 | 35 | 40 | `packages/core/src/screens/auth/components/add-user-button.tsx:88`; `packages/core/src/screens/auth/components/store-select.tsx:192`<br>Qualified: `web:group-hover:border` ×1 |
| `border-0` | 3 | 1 | 2 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:77`; `packages/components/src/form/toggle-group.tsx:49`<br>Qualified: `[&_tr:last-child]:border-0` ×1 |
| `border-2` | 3 | 1 | 2 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:225`; `packages/components/src/slider/index.tsx:46` |
| `border-4` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/products/camera-scanner-panel.tsx:200`; sole occurrence |
| `border-[2px]` **one-off** | 1 | 0 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:45`; sole occurrence<br>Qualified: `before:border-[2px]` ×1 |
| `border-[6px]` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx:351`; sole occurrence |
| `border-amber-300` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/receipt/mismatch-badge.tsx:18`; sole occurrence |
| `border-b` | 12 | 10 | 2 | `packages/core/src/screens/main/components/product/variable-product-row/variations/footer.tsx:63`; `packages/core/src/screens/main/orders/view/sections/_section.tsx:26`<br>Qualified: `[&_tr]:border-b` ×1 |
| `border-b-0` | 4 | 1 | 3 | `packages/core/src/screens/auth/components/sites.tsx:152`; `packages/components/src/dialog/index.tsx:206`<br>Qualified: `[&>tr]:last:border-b-0` ×1 |
| `border-blue-700` **one-off** | 1 | 0 | 1 | `packages/components/src/dnd/web/drop-indicator.tsx:45`; sole occurrence<br>Qualified: `before:border-blue-700` ×1 |
| `border-dashed` | 5 | 4 | 1 | `packages/core/src/screens/auth/components/add-user-button.tsx:88`; `packages/core/src/screens/main/pos/cart/totals.tsx:166` |
| `border-l` | 3 | 3 | 0 | `packages/core/src/screens/main/orders/view/modal.tsx:81`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:108`<br>Qualified: `sm:border-l` ×1 |
| `border-l-0` | 2 | 0 | 2 | `packages/components/src/dialog/index.tsx:205`; `packages/components/src/modal/index.tsx:235` |
| `border-l-4` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/sections/customer.tsx:153`; sole occurrence |
| `border-r` | 4 | 3 | 1 | `packages/core/src/screens/main/pos/checkout/tender/tender-checkout.tsx:127`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:108` |
| `border-r-0` | 3 | 0 | 3 | `packages/components/src/dialog/index.tsx:204`; `packages/components/src/form/toggle-group.tsx:61` |
| `border-solid` | 2 | 0 | 2 | `packages/components/src/dnd/web/drop-indicator.tsx:45`; `packages/components/src/dnd/web/sortable-item.tsx:203`<br>Qualified: `before:border-solid` ×1 |
| `border-t` | 25 | 22 | 3 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:67`; `packages/core/src/screens/auth/components/sites.tsx:151` |
| `border-t-0` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/orders/view/modal.tsx:81`; sole occurrence<br>Qualified: `sm:border-t-0` ×1 |
| `border-transparent` | 2 | 0 | 2 | `packages/components/src/dnd/web/sortable-item.tsx:49`; `packages/components/src/switch/index.tsx:19` |
| `border-y` **one-off** | 1 | 1 | 0 | `packages/core/src/screens/main/pos/cart/totals/customer-note.tsx:60`; sole occurrence |
| `outline-none` | 27 | 0 | 27 | `packages/components/src/accordion/index.tsx:78`; `packages/components/src/button/index.tsx:27`<br>Qualified: `web:focus-visible:outline-none` ×9, `web:outline-none` ×12, `web:focus:outline-none` ×4, `focus-visible:outline-none` ×1 |
| `ring-0` **one-off** | 1 | 0 | 1 | `packages/components/src/switch/index.tsx:41`; sole occurrence |
| `ring-1` **one-off** | 1 | 0 | 1 | `packages/components/src/accordion/index.tsx:78`; sole occurrence<br>Qualified: `web:focus-visible:ring-1` ×1 |
| `ring-2` | 13 | 0 | 13 | `packages/components/src/button/index.tsx:27`; `packages/components/src/checkbox/index.tsx:17`<br>Qualified: `web:focus-visible:ring-2` ×8, `web:ring-2` ×1, `web:focus:ring-2` ×3, `focus-visible:ring-2` ×1 |
| `ring-offset-1` | 4 | 0 | 4 | `packages/components/src/button/index.tsx:27`; `packages/components/src/checkbox/index.tsx:17`<br>Qualified: `web:focus-visible:ring-offset-1` ×3, `web:ring-offset-1` ×1 |
| `ring-offset-2` | 9 | 0 | 9 | `packages/components/src/radio-group/index.tsx:56`; `packages/components/src/select/index.tsx:126`<br>Qualified: `web:focus-visible:ring-offset-2` ×5, `web:focus:ring-offset-2` ×3, `focus-visible:ring-offset-2` ×1 |
| `shadow` **one-off** | 1 | 0 | 1 | `packages/components/src/slider/index.tsx:46`; sole occurrence |
| `shadow-lg` | 4 | 0 | 4 | `packages/components/src/alert-dialog/index.tsx:75`; `packages/components/src/dnd/web/sortable-item.tsx:203` |
| `shadow-md` | 15 | 1 | 14 | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:80`; `packages/components/src/card/index.tsx:10`<br>Qualified: `web:group-hover:shadow-md` ×1, `web:hover:shadow-md` ×1 |
| `shadow-sm` | 7 | 3 | 4 | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:87`; `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:87`<br>Qualified: `hover:shadow-sm` ×1 |

### Every shadow/elevation occurrence, including outside-scope library/source assets

| Shadow/elevation occurrence | Scope | Location |
|---|---|---|
| `shadow-sm` | Selected graph | `packages/components/src/tabs/index.tsx:308` |
| `shadow-sm` | Selected graph | `packages/components/src/form/toggle-group.tsx:62` |
| `shadow-md` | Selected graph | `packages/components/src/tooltip/index.tsx:94` |
| `shadow-md` | Selected graph | `packages/components/src/tooltip/index.web.tsx:32` |
| `shadow-md` | Selected graph | `packages/components/src/card/index.tsx:10` |
| `shadow-md` | Selected graph | `packages/components/src/tree-combobox/tree-combobox.tsx:400` |
| `shadow-lg` | Selected graph | `packages/components/src/alert-dialog/index.tsx:75` |
| `web:group-hover:shadow-md` | Selected graph | `packages/components/src/panels/index.tsx:51` |
| `shadow-md` | Selected graph | `packages/components/src/hover-card/index.tsx:40` |
| `shadow-md` | Selected graph | `packages/components/src/dropdown-menu/index.tsx:65` |
| `shadow-md` | Selected graph | `packages/components/src/dropdown-menu/index.tsx:113` |
| `shadow` | Selected graph | `packages/components/src/slider/index.tsx:46` |
| `shadow-md` | Selected graph | `packages/components/src/combobox/combobox.tsx:218` |
| `shadow-md` | Selected graph | `packages/components/src/popover/index.tsx:54` |
| `shadow-md` | Selected graph | `packages/components/src/switch/index.tsx:41` |
| `shadow-sm` | Selected graph | `packages/components/src/switch/index.tsx:99` |
| `shadow-md` | Selected graph | `packages/components/src/lib/phone-sheet.tsx:34` |
| `shadow-md` | Selected graph | `packages/components/src/select/index.tsx:185` |
| `shadow-md` | Selected graph | `packages/components/src/select/select-multi.tsx:160` |
| `shadow-lg` | Selected graph | `packages/components/src/modal/index.tsx:220` |
| `shadow-lg` | Selected graph | `packages/components/src/modal/index.tsx:260` |
| `hover:shadow-sm` | Selected graph | `packages/components/src/dnd/web/sortable-item.tsx:49` |
| `shadow-lg` | Selected graph | `packages/components/src/dnd/web/sortable-item.tsx:203` |
| `shadow-lg` | Outside six / asset | `packages/core/src/screens/main/components/pro-preview-overlay.tsx:76` |
| `shadow-foreground/5` | Outside six / asset | `packages/core/src/screens/main/reports/chart/tooltip.tsx:45` |
| `shadow-md` | Outside six / asset | `packages/core/src/screens/main/reports/chart/tooltip.tsx:45` |
| `web:hover:shadow-md` | Outside six / asset | `packages/core/src/screens/main/pos/products/filter-bar/filter-bar-list.tsx:46` |
| `shadow-sm` | Selected graph | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:87` |
| `shadow-sm` | Selected graph | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:87` |
| `shadow-sm` | Selected graph | `packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:124` |
| `web:hover:shadow-md` | Selected graph | `packages/core/src/screens/main/components/ui-settings/columns-form.tsx:80` |
| `box-shadow: 0 2px 4px rgba(0,0,0,0.1)` | Outside six / asset | `packages/core/src/contexts/theme/palettes/blue-grey.html:44` |

## H. ICONS

**Most coherent axis:** **1 principal icon family**, imported exclusively through the local Font Awesome solid SVG registry (`packages/components/src/icon/index.tsx:14`; registry `packages/components/src/icon/components/fontawesome/solid/index.ts:1-134`, **134 export declarations**, not 134 mounted icons). No active Lucide/vector-icons/React Icons/Heroicons imports were found in the inspected source; a commented Lucide type in Toggle is not use.

There is also **1 custom animated success tick** (`packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:93-101`, **52×52**, stroke 2.8), plus shared Loader SVG and brand Logo SVG (`packages/components/src/loader/index.tsx:112-128`; `packages/components/src/logo/index.tsx:3`). Do not manufacture “three competing icon sets” from a progress spinner and logo.

### Shared icon/loader size scale

Each value has **2 definition occurrences**, one in Icon and one in Loader:

| Size key | Utility | Nominal native / 14px-root web | Definition evidence |
|---|---|---|---|
| xs | `size-3.5` | 14 / 12.25 | `packages/components/src/icon/index.tsx:57`; `packages/components/src/loader/index.tsx:50` |
| sm | `size-4` | 16 / 14 | `packages/components/src/icon/index.tsx:58`; `packages/components/src/loader/index.tsx:51` |
| default | `size-4.5` | 18 / 15.75 | `packages/components/src/icon/index.tsx:56`; `packages/components/src/loader/index.tsx:49` |
| lg | `size-5` | 20 / 17.5 | `packages/components/src/icon/index.tsx:59`; `packages/components/src/loader/index.tsx:52` |
| xl | `size-6` | 24 / 21 | `packages/components/src/icon/index.tsx:60`; `packages/components/src/loader/index.tsx:53` |
| 2xl | `size-7` | 28 / 24.5 | `packages/components/src/icon/index.tsx:61`; `packages/components/src/loader/index.tsx:54` |
| 3xl | `size-8` | 32 / 28 | `packages/components/src/icon/index.tsx:62`; `packages/components/src/loader/index.tsx:55` |
| 4xl | `size-9` | 36 / 31.5 | `packages/components/src/icon/index.tsx:63`; `packages/components/src/loader/index.tsx:56` |

### JSX declaration counts, not runtime icon instances

**114 Icon/IconButton/Loader declarations** in the graph; forwarded props are not counted as a known fixed size. Source `className` can further override these defaults (dimensions in E).

| Component / authored size prop | Declarations | Evidence |
|---|---:|---|
| `Icon` / `omitted/default` | 51 | `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:73`; `apps/main/app/(app)/(drawer)/(pos)/(columns)/index.tsx:87` |
| `Icon` / `{size as IconProps['size']}` | 1 | `packages/components/src/button/index.tsx:252`; sole declaration |
| `Icon` / `sm` | 7 | `packages/components/src/collapsible/index.tsx:43`; `packages/core/src/screens/auth/components/add-user-button.tsx:94` |
| `Icon` / `xs` | 12 | `packages/components/src/docs-link/index.tsx:37`; `packages/components/src/sort-icon/index.tsx:21` |
| `Icon` / `4xl` | 2 | `packages/components/src/error-boundary/fallback.tsx:40`; `packages/components/src/error-boundary/fallback.tsx:63` |
| `Icon` / `{size}` | 1 | `packages/components/src/icon-button/index.tsx:87`; sole declaration |
| `Loader` / `omitted/default` | 4 | `packages/components/src/webview/index.web.tsx:187`; `packages/core/src/screens/main/components/data-table/list-footer.tsx:17` |
| `Loader` / `xs` | 2 | `packages/core/src/screens/auth/components/demo-button.tsx:123`; `packages/core/src/screens/auth/components/wp-user.tsx:138` |
| `Loader` / `forwarded size` | 2 | `packages/components/src/button/index.tsx:310`; `packages/components/src/icon/index.tsx:111` |
| `IconButton` / `omitted/default` | 18 | `packages/components/src/dialog/index.tsx:269`; `packages/components/src/modal/index.tsx:269` |
| `IconButton` / `sm` | 7 | `packages/components/src/error-boundary/fallback.tsx:49`; `packages/components/src/error-boundary/fallback.tsx:68` |
| `IconButton` / `xs` | 1 | `packages/components/src/list-item/index.tsx:105`; sole declaration |
| `IconButton` / `lg` | 2 | `packages/core/src/screens/auth/components/site.tsx:87`; `packages/core/src/screens/auth/components/sites.tsx:165` |
| `IconButton` / `4xl` | 4 | `packages/core/src/screens/main/pos/cart/cells/actions.tsx:64`; `packages/core/src/screens/main/pos/products/cells/actions.tsx:19` |

**Does size track type? Partly.** Button forwards its size key to Icon (`packages/components/src/button/index.tsx:250-253`) and separately selects label size (`:198-204`), and forwards size to its Loader (`:310-313`). Icon and Loader share all **8** size keys. However, changing a surrounding Text from sm to lg does **not** resize a standalone Icon: the icon's own `size-*` wins (`packages/components/src/icon/index.tsx:98,129-134`). `text-base` on SortIcon (`packages/components/src/sort-icon/index.tsx:26,34`) is not an icon-size rule; it still passes `size="xs"` (`:23,31`). The receipt sync badge explicitly pairs xs icon and xs text (`packages/core/src/screens/main/receipt/syncing-badge.tsx:23-24`), whereas variation feedback pairs sm icon with xs text (`packages/core/src/screens/main/pos/products/cells/variations-popover/variations.tsx:167-169`): **2 pairings**, not a universal text/icon ratio.
## I. EMPTY / LOADING / ERROR STATES

**Highly scattered:** the **6 surface groups** do not use one shared empty-state component. There is shared infrastructure (ErrorBoundary, Suspense, Loader, ComboboxEmpty), but infrastructure is not a consistent visible treatment. The following counts refer to the particular branches named, not every possible async operation in each screen.

| Surface | Empty / unavailable | Loading | Error |
|---|---|---|---|
| **POS register/cart** | **1 blank new-draft CardContent branch** `packages/core/src/screens/main/pos/cart/index.tsx:127-134`; **1 missing-binding text branch** `:113`; table maps rows without an empty-state message `packages/core/src/screens/main/pos/cart/table.tsx:315-350`. | Layout Suspense has no supplied fallback `apps/main/app/(app)/(drawer)/(pos)/_layout.tsx:115,122`; ledger **1 explicit null fallback** `packages/core/src/screens/main/pos/cart/index.tsx:122`; open-register submission uses Button loading `open-register-card.tsx:76-79` (same cart directory). | Generic boundaries at cart `index.tsx:114,154,161`; open-register failure **1 plain Text treatment**, no severity class `packages/core/src/screens/main/pos/cart/open-register-card.tsx:75`; payment errors also request notifications `cart/buttons/pay.tsx:153` under POS. |
| **Orders list/detail** | List **1 shared DataTable empty branch**, centered `p-2` + Text `packages/core/src/screens/main/components/data-table/index.tsx:261-274`; detail missing order **1 custom branch**, `px-5 py-6` + `text-base font-semibold` `packages/core/src/screens/main/orders/view/modal.tsx:38-48`. | List **1 explicit DataTableSkeleton** `packages/core/src/screens/main/orders/index.tsx:148`; it is header/footer plus **1 centered Loader**, not skeleton rows `packages/core/src/screens/main/components/data-table/skeleton.tsx:27-57`; detail refund subsection **2 muted bars** `packages/core/src/screens/main/orders/view/sections/refunds.tsx:140-141`, mounted from `orders/view/modal.tsx:159` under main. | Generic list boundary `packages/core/src/screens/main/orders/index.tsx:147`; refunds **1 custom fallback**: destructive sm error, optional local summary, outline-sm Retry `packages/core/src/screens/main/orders/view/sections/refunds.tsx:159-188`, wired `orders/view/modal.tsx:158` under main. |
| **General settings** | **0 collection-level empty states** in a fixed form; individual choice lists use shared ComboboxEmpty, e.g. `packages/core/src/screens/main/components/language-select.tsx:77`, `currency-select.tsx:66` in that directory. | **2 boundaries without explicit fallback**: `packages/core/src/screens/main/settings/index.tsx:38-40`; `general.tsx:82-84`; restore action Button loading `general.tsx:371-375` (same settings directory). | **1 FormErrors mount** `packages/core/src/screens/main/settings/general.tsx:200`; shared heading `text-error` + bullet Text `packages/core/src/screens/main/components/form-errors.tsx:33-37`; outer generic boundary `settings/index.tsx:38`; restore catch logs `settings/general.tsx:181-188` under main. |
| **Connect / first run** | **1 no-sites branch returns null** `packages/core/src/screens/auth/components/sites.tsx:74-75`; URL card and demo remain `packages/core/src/screens/auth/connect.tsx:33-41`. | Site Suspense **no explicit fallback** `packages/core/src/screens/auth/connect.tsx:37`; connect Button loading `auth/components/url-input.tsx:45` under screens; startup **1 Logo + Progress treatment** `packages/core/src/screens/splash/index.tsx:37-41`, mounted `packages/core/src/contexts/hydration-providers.tsx:31`. | URL **1 inline destructive-sm error + conditional DocsLink** `packages/core/src/screens/auth/components/url-input.tsx:50-65`; site list generic boundary `packages/core/src/screens/auth/connect.tsx:36`. |
| **Receipt / preview** | Missing order uses **1 ModalTitle branch** `packages/core/src/screens/main/receipt/receipt.tsx:37-47`; unavailable document **1 muted bordered centered panel** `packages/core/src/screens/main/receipt/receipt-body.tsx:82-89`. | **1 SyncingBadge component** uses rounded-full muted pill/xs label/xs loading icon `packages/core/src/screens/main/receipt/syncing-badge.tsx:21-25`, mounted `receipt-body.tsx:69`; web **1 white absolute loading scrim** `packages/components/src/webview/index.web.tsx:185-187`; print Button loading `receipt/receipt-actions.tsx:68` under main. | Generic boundary `packages/core/src/screens/main/receipt/receipt-body.tsx:67`; print catch logs `use-receipt-document.ts:213-221` in receipt; preview error records failed frame state `:296` but no new receipt-specific error panel is supplied in `previewProps` `:330-340`. **Upstream native WebView error-page behavior is not evaluated.** |
| **Grid / variation picker** | Grid **1 centered p-4 text branch** `packages/core/src/screens/main/pos/products/grid/index.tsx:135-144`; picker **1 unavailable icon + xs muted text branch** `packages/core/src/screens/main/pos/products/cells/variations-popover/variations.tsx:171-176`; search ComboboxEmpty `select.tsx:119` in same picker directory. | Initial product Suspense **no explicit fallback** `packages/core/src/screens/main/pos/products/index.tsx:338`; pending search uses a “searching” text branch `grid/index.tsx:139-140`; footer **1 Loader in p-3** `grid/grid-footer.tsx:40-44`; picker **1 loading icon + xs text branch** `cells/variations-popover/variations.tsx:165-169` (remaining paths relative to POS products). | Generic boundaries around products `packages/core/src/screens/main/pos/products/index.tsx:337` and picker `cells/variations-popover/index.tsx:145-155` in same products directory; failed/missing image uses the shared placeholder `grid/tile-image.tsx:35-38`, not a domain-error panel. |

**Important production/development split, 2 policies:** shared Suspense forwards props untouched to React in production (`packages/components/src/suspense/index.tsx:6-11`); only development supplies raw RN Text “Loading ...” if its fallback is falsy (`packages/components/src/suspense/suspense.tsx:3,17`). Therefore “every screen uses Suspense” does **not** prove consistent loading visuals, and a development screenshot is not evidence that a production blank boundary has a loader.

**What is shared:** generic ErrorBoundary Fallback has **2 layout branches** (compact/long-error vs wider), both error-coloured with warning/retry affordances (`packages/components/src/error-boundary/fallback.tsx:31-49,59-72`). This is a real reusable exception surface; it does not unify ordinary validation, unavailable combinations, printer failures, and register-opening errors. Long technical messages and English fallback headings are existing source behavior, not a newly observed runtime outage.

## J. THE TOP TEN MISMATCHES

These are **inferred visual priorities from observed source conflicts**, not screenshot-verified severity; each item identifies **two conflicting treatments**.

1. Receipt zoom is **h-7 (28 native)** while its footer actions use **default h-10 (40 native)**, making the fine control smaller than the adjacent actions (`packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:95,118`; `packages/core/src/screens/main/receipt/receipt.tsx:79`; `packages/components/src/button/index.tsx:117`).
2. A variation choice changes from **native:h-12 (48)** toggle buttons to **h-10 (40)** Combobox when its option-label character count crosses the branch threshold (`packages/core/src/screens/main/pos/products/cells/variations-popover/variations.tsx:139-153`; `packages/components/src/toggle/index.tsx:19`; `packages/components/src/combobox/combobox.tsx:136`).
3. The same product metadata is **text-sm** in the list but **text-xs** in the grid—**3 list declarations versus 5 simple-tile declarations** (`packages/core/src/screens/main/pos/products/cells/name.tsx:38-41`; `packages/core/src/screens/main/pos/products/grid/product-tile.tsx:111-131`).
4. Initial Orders loading supplies **DataTableSkeleton/Loader** while initial POS products supplies **no Suspense fallback**, so two browsing surfaces communicate waiting differently (`packages/core/src/screens/main/orders/index.tsx:148`; `packages/core/src/screens/main/components/data-table/skeleton.tsx:47`; `packages/core/src/screens/main/pos/products/index.tsx:338`).
5. A register-opening failure is **plain default Text** while a connection failure is **text-destructive text-sm**, giving two failure messages different visual urgency (`packages/core/src/screens/main/pos/cart/open-register-card.tsx:75`; `packages/core/src/screens/auth/components/url-input.tsx:51`).
6. The first-run screen uses **fixed #F0F4F8** while the settings page uses **theme bg-card**, creating one full-surface theme bypass rather than a shared light/dark treatment (`packages/core/src/screens/splash/index.tsx:37`; `packages/core/src/screens/main/settings/index.tsx:30`).
7. Orders rests in a **shadow-md Card** while General settings is a **flat ScrollView/View with no shadow**, exposing two competing surface grammars (`packages/core/src/screens/main/orders/index.tsx:127`; `packages/components/src/card/index.tsx:10`; `packages/core/src/screens/main/settings/index.tsx:30-31`).
8. The product tile uses **rounded-lg** but the register-opening “card” uses **rounded-md**, so two primary POS card-like containers do not share the same corner family (`packages/core/src/screens/main/pos/products/grid/product-tile.tsx:69`; `packages/core/src/screens/main/pos/cart/open-register-card.tsx:43`).
9. No-results content gets **p-2** in a table versus **p-4** in a grid, doubling the authored inset for the same feedback job (`packages/core/src/screens/main/components/data-table/index.tsx:262`; `packages/core/src/screens/main/pos/products/grid/index.tsx:136`).
10. Uppercase section labels use **text-2xs (about 11 web px)** in settings versus **text-[10px]** in the order rail, exposing two independently chosen tiny heading treatments (`packages/core/src/screens/main/settings/components/settings-section.tsx:30`; `packages/core/src/screens/main/orders/view/sections/_section.tsx:60`; `apps/main/global.css:31`).

## K. WHERE IT IS ALREADY COHERENT

**Do not replace the foundations.** There is **no honest claim that every surface property is identical across all six**: the splash, receipt document and responsive native controls disprove that. The coherence that spans the six groups is shared infrastructure and defaults, with explicit exceptions above.

1. **One semantic theme pipeline:** preserve the colour-role names and light/dark/theme contract (`apps/main/global.css:40-92,161-162,186-187`), rather than replacing them with a “unified” hardcoded palette; the selected graph already contains **950 semantic declarations**, with **76 S utility forms** using semantic colours.
2. **One Text base/context mechanism:** default `text-base` plus contextual overrides (`packages/components/src/text/index.tsx:13,36`) is reused by control labels and screen text; Button deliberately provides colour/size context (`packages/components/src/button/index.tsx:287-292`), so preserve that inheritance rather than adding manual foreground classes everywhere.
3. **One primary icon family and 8 shared icon/loader sizes:** `packages/components/src/icon/index.tsx:14,55-63`; `packages/components/src/loader/index.tsx:48-56`; unify the handful of usage pairings, not the entire asset system.
4. **Two layout helpers share exactly the same 8-step gap mapping and sm default:** `packages/components/src/hstack/index.tsx:10-25`; `packages/components/src/vstack/index.tsx:10-25`; **254/687** spacing declarations already concentrate on four utilities, so a new spacing system is not the first lever.
5. **A coherent form-control core exists:** Input, Button, Select and Combobox default to **h-10 / rounded-md**, despite failing the requested 44-native target expectation (`packages/components/src/input/index.tsx:39`; `button/index.tsx:27,117`; `select/index.tsx:126`; `combobox/combobox.tsx:136`, latter paths under components/src); change their shared default intentionally rather than separately styling six screens.
6. **Shared generic failure treatment:** **1 Fallback component / 2 layout branches**, reused through ErrorBoundary in all six selected groups (mounts enumerated in I; definition `packages/components/src/error-boundary/fallback.tsx:31-72`); retain the boundary contract while making domain states more consistent.
7. **Matched pairs already work as a system:** product list/grid names are both `font-bold` (`packages/core/src/screens/main/pos/products/cells/name.tsx:35`; `grid/product-tile.tsx:78`); simple/variable tiles share `m-1 rounded-lg p-2` structure (`grid/product-tile.tsx:69,76`; `grid/variable-product-tile.tsx:151,166`, relative to POS products); native/web preview intentionally preserve white paper (`packages/core/src/screens/main/receipt/components/receipt-preview-viewport.tsx:140`; `.web.tsx:124`).

These are **source-level consistency observations**, not a claim of runtime compatibility, contrast compliance, or accessibility.

## L. HARDEST TO UNIFY

1. **Overlay/navigation platform seam — two panel APIs plus platform/responsive branches.** Dialog owns local open state (`packages/components/src/dialog/index.tsx:30,228`), Modal closes navigation (`packages/components/src/modal/index.tsx:80-83`), native Modal preserves Fabric view ownership during route transitions (`:165-181`), and phone Combobox uses a separate sheet (`packages/components/src/combobox/combobox.tsx:190-218`). A visual token pass is cheap; merging mechanisms without changing back behavior, focus, keyboard avoidance and POS portal placement is expensive. Preserve the distinction unless the redesign explicitly changes navigation.
2. **Vendored calendar / native control geometry — one calendar theme API plus native-specific control variants.** Orders Calendar mounts a third-party RN calendar (`packages/components/src/calendar/index.tsx:121`; `packages/core/src/screens/main/components/order/filter-bar/calendar.tsx:133`) with **3 font-size properties, 3 font-weight properties, and explicit 10px header padding** (`packages/components/src/calendar/index.tsx:151-170`), while Toggle has **3 native size overrides** (`packages/components/src/toggle/index.tsx:19-21`). They cannot be unified just by changing Text or a common class string: vendor theme/stylesheet hooks and native interaction geometry must remain aligned. No upstream primitive code was executed or audited for hit areas.
3. **Receipt paper versus application chrome — deliberate document exception, two preview implementations.** The paper remains white on both platforms (`packages/core/src/screens/main/receipt/components/receipt-preview-viewport.web.tsx:124`; `receipt-preview-viewport.tsx:140`), rendered HTML travels through WebView (`packages/core/src/screens/main/receipt/receipt-body.tsx:99`), and paper dimensions represent **3 document formats**, not app spacing (`components/receipt-preview-viewport-utils.ts:18-21`, under receipt). The unavailable-state box is explicitly outside white paper (`receipt-body.tsx:82-89`). Unifying zoom/buttons/loader chrome is local; rewriting document typography, dark-mode paper or print layout crosses template/rendering ownership and risks changing printed output.

**Additional ownership limit, not a fourth redesign workstream:** the three external login flows in F are browser/OS/server UI. This audit cannot promise to make them match by editing local WCPOS components.

### Reproducibility / evidence collection

Read-only commands used: `git status --short`, `git branch --show-current`, `git rev-parse HEAD`; `rg --files`, `rg -n` for class/property/import patterns; `nl -ba` with bounded `sed` excerpts. In-memory Python followed local UI imports, stripped comments while preserving line numbers, extracted literal utility occurrences (including conditional/template fragments), grouped counts, and distinguished S/L. Raw-colour sweeping separately covered both full trees and decoded the known placeholder asset. No scan script or scratch artifact was written.

Useful independent spot-check patterns (apply the stated scope/exclusions, not the entire library when inferring mounts):
```sh
rg -n 'className|rounded|fontSize|FontSize|FontWeight|padding|margin' <selected-files>
rg -n 'shadow-|elevation:|shadowOpacity|shadowColor' packages/components/src packages/core/src
rg -n '<(Dialog|Modal|Popover|Tooltip|AlertDialog|HoverCard)\b' <selected-files>
```
The report is the only requested repository change; application builds, tests, device verification, external login, and server-rendered receipt visual inspection were **not run**.
