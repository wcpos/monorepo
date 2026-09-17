# The mockup-to-library concordance

_Produced 2026-09-18 for [wcpos/roadmap#337](https://github.com/wcpos/roadmap/issues/337) (part of
[#282](https://github.com/wcpos/roadmap/issues/282)). Branch: `research/mockup-concordance`, cut from
`origin/next` at `aebda38456`._

**Findings, not decisions.** #291 decides the map with Paul; this is its evidence, row by row.
Nothing here proposes removing anything: where the drawing has no home for a learned behaviour it is
written as a question.

## What was read

- The prototype decisions: `docs/prototypes/2026-09-12-language/pos-register/README.md` (whole) and
  `docs/prototypes/2026-09-12-language/README.md` — "The tokens, as drawn" plus every numbered
  decision 1–51 (the file numbers them out of order; 18–24 sit after 40).
- The prototype's CSS vocabulary: the `<style>` block of `pos-register/index.html` extracted whole
  (813 long lines / 145 KB), read by selector group. The 390 KB HTML body was **not** read except
  for targeted greps (`segt`, tab markup).
- Captures (tablet light regular unless noted): `open`, `tender`, `panel`, `table`, `many-orders`,
  `split`, `closed`, `counting`, `loading`, `line-actions`, `cart-settings`, `paid`, `settings`,
  `offline`; `phone-light-regular-open`, `phone-light-regular-tender`;
  `orders/screens/desktop-light-regular-{default,open}`;
  `reports/screens/desktop-light-regular-{today,closure}`.
- The library on `origin/next`: all 58 folders of `packages/components/src` listed; ~20 read in
  full. The composed pieces under `packages/core/src/screens/main/pos/**`,
  `packages/core/src/screens/main/components/**`, `orders/**`, `reports/**` — imports and render
  bodies read for every piece cited below.
- The behaviour ledger: `origin/research/component-ledger:.claude/research/2026-09-12-component-behaviour-ledger.md`.
- `.claude/rules/design.mdc` (whole).

**Not read / not covered, honestly:** the prototype's JavaScript (state model, event handlers) — the
behaviour claims about the drawing come from the READMEs and the captures, not from its code; the
`board-*.html` workshop boards (they are the record of rejected options, not the design); dark,
compact and spacious captures; the personality themes' token blocks; `reports/AUDIT-2026-09-17.md`;
the `settings`, `connect`, `receipt`, `products` screens of #288, which are **not drawn yet** — so
the settings, auth, customers, coupons and health screens have no concordance rows at all. No
runtime was opened and nothing was measured; every "today" claim is a source reading.

**Ledger citation convention:** the ledger numbers nothing, so `button #5` means the fifth bullet of
the `### button` section's **Behaviour ledger** list, in the ledger's own order.

## At a glance

| Verdict | Rows |
|---|---:|
| restyle only | 28 |
| behaviour differs | 26 (25 plain + 1 "→ new sub-parts") |
| no component, new | 6 (5 plain + 1 composed) |
| two candidates, judgement call | 4 (3 plain + 1 "→ new") |
| **total** | **64** |

**Judgement-call rows** (4): `.chip`/`.pill` family · `.keys`/`.k` keypad · `.notice`/`.alert`
banner · `.segt` segmented control (which lands on "new" either way — the call is whether it is a new
primitive or a restyled `toggle-group`). A fifth call sits outside the table and is #282's own open
question: **where the rebuilt composed pieces live** — the cart line, tender tile, register bar and
tab strip are under `packages/core/src/screens/main/pos/**` today, not in `@wcpos/components`.

**No-component-new rows** (6 in the table, 7 new things once `.segt` is counted — it is filed under
the judgement call but lands on "new" either way): `.st` status dot + label · `.stamp` PAID ·
`.ordlist` open-orders takeover (composed) · `.crumb` breadcrumb + `.pane` slide · Print bill · the
reports donut (`.rp-panel` share charts) · `.segt` segmented control. The `.tile` in-cart count and
stock badge are new **sub-parts of an existing tile**, not a new component, so they are filed under
"behaviour differs → new sub-parts".

**Top ledger lines at risk** — learned behaviour the drawing touches hardest:

1. `button #5` "Separates compact label typography from the smaller xs hit area" (`compact: 'h-9'`,
   `button/index.tsx:107`) — the drawing's floored `--ctl` replaces every hand-set height; the
   compact **type** decision must survive the height change, not ride on it.
2. `tabs #1–#6` (centre the selected tab, re-centre after container and content resize, the "+"
   tab after a void) — the drawn strip scrolls with a count button pinned left and `+` pinned right
   (README decision 17), so the centring code meets new pinned siblings.
3. `table #6–#7` (remove-pulse re-entrancy latch, released after cancellation or settlement;
   `cells/actions.tsx` comment, monorepo#1693) — the drawn line has **no × button**; removal moves
   to a swipe on the total. The latch's owner changes.
4. `dialog #4–#8` / `modal #4`, `#11`, `#12` (side presentations, web wrapper flattening, exit
   toward the edge, autofocus after the slide, footer outside the scroll body, named portal hosts so
   POS panels do not cover the nav drawer) — every drawn overlay is a side presentation.
5. `virtualized-list #7`, `#8`, `#13` (suppress end-reached on zero-sized hidden containers,
   recheck on resize, bottom-edge tolerance) — the drawn table slides sideways behind a breadcrumb
   (decision 32/38), which is a hidden-then-visible container by another name.
6. `select #1–#3` (touch/pen opening through `onPress`, pointer type captured at `pointerdown`,
   stale touch state cleared) — the drawn filter chips open menus on touch; this is the iPad
   double-toggle fix.
7. `numpad #2` "Runs initial selection only on mount so the third digit does not overwrite the
   preceding digits" — the drawn quantity keypad and the split Amount/Percent keypads are new
   keypad surfaces that must not re-learn this.
8. `input #1`/`#2`, `numpad #1` (50 ms delayed autofocus) — the drawing's focus story (decision 1
   of cut 2: focus the name, Tab to price, Enter saves, Esc cancels) is drawn, not implemented.

---

## Concordance

### Primitives — controls

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.btn` (+`.p` primary, `.q` quiet, `.d` destructive, `.xl`), height `max(--ctl,--floor)` | `packages/components/src/button/index.tsx` | restyle only | Heights become tokens; today `h-10`/`compact: h-9` (`button/index.tsx:107`) sit under the 44 pt floor. `.xl` = the tile token, not a size step. | `button` #2, #3, #5, #6, #7, #8, #13 | Does `.q` map to `ghost` or to `ghost-quiet`? Both exist (`#6`, `#7`) and the drawing has one quiet button. |
| `.ibtn` square icon button | `packages/components/src/icon-button/index.tsx` | restyle only | Size becomes `max(--ctl,--floor)`; `.ibtn.on` tints primary — there is no "on" state today. | `icon-button` #1, #3, #4 | — |
| `.chip`, `.pill`, `.pill.split` (label + × with a divider), `.pill.clr`, `.pill.na` (dimmed, reason in tooltip) | `ButtonPill` in `packages/components/src/button/index.tsx:400-430`; `packages/core/src/screens/main/pos/products/filter-bar/pos-filter-bar.tsx:5` | two candidates, judgement call | `ButtonPill` is a Button with a remove affordance; the drawing has two distinct things — a **chip** (filter, two-state, `.chip.on`) and a **pill** (a read-only status/count mark). `.pill.na` (on but not applicable at this level, decision 40) exists nowhere. | `button` #9, #10, #11, #12 | One `Chip` with variants, or keep `ButtonPill` and add a separate read-only `Pill`? Suggestion: **one `Chip` primitive with `selectable` / `removable` / `disabledReason`**, and `ButtonPill` kept as its removable form so `#9`–`#12` are not re-derived. |
| `.in` text field, `.search` with leading glyph | `packages/components/src/input/index.tsx`; `packages/core/src/screens/main/components/query-search-input.tsx` | restyle only | Focus ring becomes `border-color + 1px ring`; height floors. | `input` #1–#6 | — |
| `.segt` segmented control (split mode, Payments \| Legacy, reports Sales \| Closures, chart mode, settings rows) | nothing exactly; nearest `packages/components/src/tabs/index.tsx` and `packages/components/src/toggle-group/index.tsx` | two candidates, judgement call → new | Nine distinct uses in the drawing. `tabs` carries the scroll-centring ledger it does not need here; `toggle-group` has 2 ledger lines and no usage counted in the census. | `tabs` #9 (`asSelect` small-screen fallback), `toggle-group` #1–#2 | New `SegmentedControl`, or `toggle-group` restyled? Suggestion: **a new `segmented-control`**, because a segment is a value picker, not navigation, and `tabs`' centring machinery is dead weight on it. |
| `.sw` switch | `packages/components/src/switch/index.tsx` | restyle only | 34×20 geometry vs today's native track/thumb sizes. | `switch` #1, #2, #3 | — |
| `.cb` checkbox (and the filled/indeterminate state in `cart-settings`) | `packages/components/src/checkbox/index.tsx` | restyle only | — | `checkbox` #1, #2 | — |
| `.radio` (Sort items, `tablet-light-regular-cart-settings.jpg`) | `packages/components/src/radio-group/index.tsx` | restyle only | — | `radio-group` #1, #2, #3 | — |
| `.keys` / `.k` keypad — 3×4, the part that "gives way" first (`proto-style.css` `.keys` comment) | `packages/components/src/numpad/index.tsx`; the tender keypad is its own grid at `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx:562-582` | two candidates, judgement call | Two keypads in the codebase already (`numpad` with its own Display; the tender's inline one). The drawing adds a **third** surface — the cart-quantity keypad (decision 36) at 48 px cells. | `numpad` #1–#6 | One keypad primitive for all three, or keep the tender's own? Suggestion: **one `Keypad` primitive with a flexible height policy**, `numpad` kept as `Keypad + Display`; otherwise `numpad #2` (selection on mount only) is re-learned twice. |
| `.st` status dot + label (`ok`/`warn`/`bad`/`info`/`neutral`, fixed across all five themes) | `packages/components/src/status-badge/index.tsx` — a tinted **filled pill** (`bg-success/15`, `text-[10px]`) | no component, new | Direction ruling and README decision 4: "always a dot plus a word, never a filled pill"; filled pills are on the Rejected list. The semantic set itself is unchanged. | `status-badge` #1 | `StatusBadge` is used in 16 files — is the dot+label a **new component beside it**, or does `StatusBadge` change shape under all 16 callers? Suggestion: **change `StatusBadge`'s default to dot+label** and keep the tinted pill as a `variant="solid"` for the places that earned it, so no call site moves. |
| `.stp` stepper / the quantity box that expands into a keypad (decision 36) | `packages/core/src/screens/main/components/number-input.tsx` + `.web.tsx`; `pos/cart/cells/quantity.tsx:31` | behaviour differs | Today the quantity is a `NumberInput` with `selectTextOnFocus` and a native-only `px-1` fix (comment at `quantity.tsx:33-41`). Drawn: a button that grows a 144 px keypad panel in place, overhanging the cart's left edge by 38 px, `−` at 1 becoming a trash. | `numpad` #1, #2, #4 | The overhang crosses the resizable divider. Is that acceptable at every cart width, or does it flip to the cart side below some width? Suggestion: **flip side by available space**, and say so in the spec rather than leaving it to layout. |

### Primitives — feedback

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.toast` + `.undo` (dark bar, inline at the top of the cart column) | `packages/components/src/toast/` (`sonner.web.tsx` / `sonner.tsx`); used by `pos/cart/buttons/void.tsx:119-127` with an Undo action | restyle only | Placement: the drawing anchors the toast **inside the cart column** (`.toast{position:absolute;left/right:--u*3}`), not in a global region. Decision 10: no toast on a line add — today there is none either. | `toast` #1–#6 | — |
| `.notice` / `.alert.warn` (inline banner over the products, e.g. "Offline · 3 sales waiting to sync", `tablet-light-regular-offline.jpg`) | `pos/products/storage-outage-banner.tsx`; `pos/cart/totals-changed-banner.tsx` — two hand-rolled banners, no shared primitive | two candidates, judgement call | The drawing uses one banner shape in at least four places. | none (neither banner is in the library, so neither is in the ledger) | A `banner` primitive, or leave each screen its own? Suggestion: **one `banner` primitive** with `info`/`warn`/`bad` — this is exactly rule 5's "one badge in one place". |
| `.upstrip` free-plan strip: sparkle, sentence, *See what Pro adds*, **Upgrade to Pro**, × (decision 43) | `packages/core/src/screens/main/components/header/upgrade-notice.tsx` | behaviour differs | Today it renders **inside the shared `Header`** (`components/header/index.tsx:13`) and picks one of six random strings. Drawn: app-wide at the very top, one string, a link plus a filled button, dismissed for the session. The drawn register has **no header at all**, so its current host disappears. | none | The strip is "meant to be slightly annoying". With the header gone, does it live above the rail (full width, as drawn) or inside each page? Suggestion: **above the rail, app-wide**, one mount, dismissed per session. |
| `.ndot` bell dot + the notifications side panel with an update at its head (decision 43) | `components/header/notification-bell.tsx` (a `Popover`, `w-80 max-h-96`) + `notification-panel.tsx`; mounted in the rail via `components/drawer-content/index.tsx:12` | behaviour differs | Popover today, full-height right side panel drawn; the bell **moves from the rail to the cart bar** (decision 42); the update notice and `Update now` / `Later` do not exist. | `popover` #1–#4 (leaving), `dialog` #4–#8 (arriving), `virtualized-list` #7, #8 (the panel's list) | The update notice needs a per-platform action (web: reload, desktop: restart, store on iOS/Android). Is that in scope for the language pass or its own ticket? Suggestion: **its own ticket**; draw the row, wire nothing. |
| `.empty` — a centred empty block (decision 26's doodle is still open) | `components/data-table/index.tsx:261` `ListEmptyComponent` — a single `TableRow` of text | behaviour differs | Today the empty state is one table row; the drawing is a centred block. The pending-vs-answered distinction (`#1733`, comment at `index.tsx:262-265`) must survive. | `virtualized-list` #12 (rearm pagination when a populated list becomes empty) | The doodle was left open at decision 29 ("still open"). Draw one for 1.11, or ship the empty block without it? Suggestion: **ship without**; a bad doodle is worse than none, and it can land later without a component change. |
| skeleton rows / `.tile.sk` (decision 11) | `components/data-table/skeleton.tsx` — table headers + a centred `Loader` | behaviour differs | Decision 11 replaces the spinner with still skeleton rows, no shimmer. The tile skeleton (`tablet-light-regular-loading.jpg`) has no counterpart. | `loader` #1–#4 (the spinner being replaced, not removed — it stays for other screens) | Decision 11 says this is [#308](https://github.com/wcpos/roadmap/issues/308)'s call. Is #308 still the decider, or does the language pass settle it? Suggestion: **settle it here**, and let #308 inherit it. |
| `.stamp` — the PAID rubber stamp, 380 ms slam at −8° (decision 29: keep) | nothing; the Paid moment lives in `pos/checkout/receipt-stage/receipt-stage.tsx` | no component, new | A one-off beat, not a primitive. Rule 6 requires reduce-motion. | none | Does the stamp belong in the shared library (it will be wanted on the customer display and the receipt preview) or beside the receipt stage? Suggestion: **beside the receipt stage** until a second caller exists. |
| `.steps` — Sent → On terminal → Approved → Captured | `pos/checkout/tender/terminal-leg-view.tsx`; `reader-connection.tsx` | restyle only | The strings and states are already the app's (confirmed by the register README's Inventory section). The `progress` primitive is **not** used by either. | `progress` #1–#4 (unused here today — a candidate host, not a loss) | — |

### Primitives — overlays

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.sidepanel` — full-height panel from the **left**, over the products (cart settings, edit line, order sheet; decision 46) | `packages/components/src/dialog/index.tsx` (`side: 'center' \| 'left' \| 'right' \| 'bottom'`, `DialogSide` at `:36`); side chosen by `pos/contexts/overlay-side/overlay-side.tsx` | behaviour differs | Today the side is derived from the **products column position** setting (`overlay-side.tsx:20-23`). Decision 46 makes it derive from **what the panel acts on**: cart things over the products, product things over the cart, bell and cashier from the right. | `dialog` #4, #5, #6, #7, #8; `modal` #4, #11, #12 | Decision 46's rule and today's rule disagree when the products sit on the right. Confirm the rule is "by subject, not by column"? Suggestion: **by subject**, with the column position only breaking ties. |
| `.panel` — right-side panel (bell, cashier) | same `dialog` / `modal` with `side="right"`; `pos/cart/user-sheet.tsx:9` | restyle only | 460 px vs today's `size` steps. | `dialog` #4–#8, `modal` #4 | — |
| `.sheet` — phone bottom sheet | `dialog`/`modal` `side="bottom"`; `pos/cart/closure-sheet.tsx`, `movement-sheet.tsx`, `reports/closures/recount-sheet.tsx` | restyle only | Radius `calc(--r*2)` on the top corners only. | `modal` #1, #2, #5, #6; `dialog` #1 | — |
| `.pop` — anchored popover (quantity keypad, filter menus, date picker) | `packages/components/src/popover/index.tsx`; `reports/page-bar.tsx:11` | restyle only | — | `popover` #1–#4 | — |
| `.menu` — the row `⋯` menu (orders list, `desktop-light-regular-rowmenu.jpg`) | `packages/components/src/dropdown-menu/index.tsx`; `orders/cells/actions.tsx` | restyle only | — | `dropdown-menu` #1–#3 | — |
| `.ordlist` — the open-orders list **taking the whole cart column**, own header and × (`tablet-light-regular-many-orders.jpg`, decision 17) | nothing. `pos/cart/tabs.tsx` renders a scrollable strip with no overflow list | no component, new (composed) | The strip has no `+N more`, no list, no "Recently voided". The rows carry amount, customer, status-or-age, and mark the current cart. | `tabs` #1–#6 (the strip it folds out of) | Paul ruled the open-orders list is "the one thing that takes over the cart" (decision 46). Confirm it is a takeover at **every** width, not a sheet on the phone? Suggestion: **takeover everywhere** — the phone's cart tab is already a full column. |
| `.gate` / `.gatecard` — the dimmed products stage with a message card ("Price check only until the register is open"; "No sales while the register is counting") | `pos/products/index.tsx:333` dims the stage with `opacity-40`; the cards are `pos/cart/open-register-card.tsx`, `register-picker.tsx`, `register-count.tsx` | behaviour differs | The dim exists; the **message** over it does not. Rule 5: "a disabled control says why in a few words beside it". | none | — |

### Primitives — lists and tables

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.thead` / `.th` / `.tbody` / `.tr` / `.td` — frameless table, hairline rows, hover row, resize handles in the header (decisions 5, 20a, 22, 34) | `packages/components/src/table/index.tsx`; `packages/core/src/screens/main/components/data-table/{index,header,footer}.tsx` | behaviour differs | Three deltas: (a) the frame goes — today every list sits in a `Card` (`orders/index.tsx:127`, `pos/products/index.tsx` `CardHeader`/`CardContent`); (b) zebra `table-row-alt` → hairlines; (c) **column resize by dragging the header edge does not exist** (`.th .rz` in the drawing, `S.cols` per view, 44 px floor). | `table` #1–#5; `virtualized-list` #9, #14, #15; `data-table` carries **none** (one of the ledger's nine empty components) | — |
| `.tr.rowbtn` — the whole row is the add button, `+` in the last column becomes the count (decisions 34, 35) | `pos/products/cells/actions.tsx`; `pos/products/cells/variable-actions.tsx` | behaviour differs | Today the `+` is the only target. Drawn: the row adds, the `+` shows the count, press-and-hold 450 ms opens a `− n +` popover. | `button` #1 (the Android disabled latch, on a row-sized target now), `table` #1 | Press-and-hold is a new gesture on a list row that also scrolls. Confirm 450 ms and that a scroll cancels it? Suggestion: **450 ms, cancelled by any movement past the touch slop**, and no hold on the web (hover already offers the stepper). |
| `.tile` product tile + `.tcnt` in-cart count (blue circle, top-left) + `.sold` stock badge (dark pill top-right, amber when low) + `.vbadge` variable chevron | `pos/products/grid/product-tile.tsx`; `variable-product-tile.tsx`; `tile-image.tsx` | behaviour differs → new sub-parts | Today stock and SKU are **text lines under the name** (`product-tile.tsx:120-127`); there is no in-cart count and no badge on the image. Decision 29 kept the tile badge "for a property chosen in POS Products settings (stock for now, amber when low)". | none (`product-tile` is a screen piece, not a library component) | The badge property is a setting, but only stock is drawn. Ship with stock fixed and the setting later, or build the picker now? Suggestion: **stock fixed now**, the picker when a second property is asked for. |
| `.tfoot` — `% Shop base ▾ · 12 of 1,204 · ⟳` (decision 37) | `components/data-table/footer.tsx`; `pos/products/grid/grid-footer.tsx`; `components/sync-button.tsx`; `components/product/tax-based-on.tsx` | restyle only | Copy: "Shop base address" → "Shop base", full name in the tooltip. The `data-table-count` / `data-table-loaded-count` contract (footer.tsx comment) is untouched. | none | — |
| `.line` / `.lb` cart line, `.acts` swipe strip, `.hov` desktop hover, `.line.settle` add beat (decisions 4 cut 2, 36) | `pos/cart/table.tsx` + `pos/cart/cells/*`; the add beat is `PulseTableRow` in `packages/components/src/table/pulse-row.tsx` | behaviour differs | The `×` per line (`cells/actions.tsx` → `IconButton name="circleXmark"`) disappears; removal becomes a swipe on the **total column** (80 px snap, 240 px delete) or a desktop nudge + click. The name and price become editable in place (`components/editable-field.tsx` already exists and `cells/product-name.tsx:15` imports it). | `table` #6, #7 (the remove-pulse latch and its release — the comment at `cells/actions.tsx:33-47` explains why the guard lives in `pulseRemove`); `button` #1 | With no `×`, the remove latch's owner moves from a button press to a gesture. Should the swipe's release be the single entry point into `pulseRemove`, or does the ⋯ sheet also remove? Suggestion: **one entry point** — the gesture — so the latch keeps one owner. |
| `.cart-th` — muted uppercase `QTY · ITEM · PRICE · TOTAL` over the lines (decision 3 cut 2) | `pos/cart/table.tsx:285-308` — a `TableHeader` already exists, labelled from `getUILabel`, hideable per column | restyle only | The header exists; it is the band that goes (decision 33: one header language, no tinted band — today `CardHeader className="bg-card-header"` at `pos/cart/index.tsx:129`). | none | — |
| `.orow` / `.op-orow` — list rows on tablet, table on desktop (decision 6) | `components/data-table/index.tsx` `renderItem`; `orders/index.tsx:149` | behaviour differs | One component renders a table at every width today. Decision 6 splits by pointer: rows below desktop, table at desktop. | `virtualized-list` #4, #5 (native `keyExtractor`, memoized render-item adapter) | This is constraint 2 ("web and native may have different components") expressed as a **width** split, not a platform split. Confirm the split key is width, not platform? Suggestion: **width**, since a small web window must get rows too. |
| `.list` — settings rows with `.sw`, drag handles, checkboxes (`tablet-light-regular-cart-settings.jpg`) | `components/ui-settings/columns-form.tsx`; `packages/components/src/list-item/`; `packages/components/src/dnd/` | restyle only | — | `dnd` #1–#12; `list-item` #1, #2 | — |

### Primitives — navigation

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.rail` — 56 px pale tinted rail, cashier avatar at the top, active item on a white tile, `Free` pill at the foot (decisions 2, 42, 43) | `apps/main/app/(app)/(drawer)/_layout.tsx:74` (`drawerType: 'permanent'` at `lg`, `width: 'auto'`, `backgroundColor: --color-sidebar`); `components/drawer-content/*`; `components/navigation-area/index.tsx` | behaviour differs | Today the permanent rail is **labelled** (`width: 'auto'`, `DrawerItem` with text) and navy (`--color-sidebar`); the drawing is icon-only at a fixed 56 px, pale, with the avatar where the logo is and the bell **removed** from the rail's bottom group. | none (`drawer-content` is a screen piece); `button` #6 (the `sidebar` variant it uses) | The rail loses its labels. On a 32-inch counter screen at the `spacious` step, is an icon-only rail still right, or does it widen back to labels? Suggestion: **icon-only at every step**, with the label in a tooltip — the drawing's whole point is that nothing outranks the thing about to be pressed. |
| `.tabbar` — phone bottom bar, Products \| Cart with a count badge (`phone-light-regular-open.jpg`) | `apps/main/app/(app)/(drawer)/(pos)/(tabs)/_layout.tsx` — an expo-router `Tabs` with the same two screens | behaviour differs | The bar exists; the **cart count badge** does not (`_layout.tsx:63-75` sets only a `tabBarIcon`). Haptics on tab press already match `tabs #8`. | `tabs` #8 | — |
| `.bar` — the register bar (`UK Store`, drawer glyph, **bell**; decision 42) | `pos/cart/register-bar.tsx` | behaviour differs | The avatar **leaves** for the rail top; the bell **arrives** beside the cash-drawer glyph. On the phone (no rail) the bar keeps both. The `describeRegisterBar` place/pill priority is unchanged. | `status-badge` #1 (the `pill` it renders at `register-bar.tsx:94`) | — |
| `.tabs` / `.otab` — open-order tab strip; amount over status on tablet/desktop, amount + dot on the phone; count button pinned left opening the list, `+` pinned right, fade at the scroll edge (decision 17) | `pos/cart/tabs.tsx`; `pos/cart/tab-chip.tsx`; `pos/cart/tab-title.tsx`; `packages/components/src/tabs/index.tsx` (`ScrollableTabsList`) | behaviour differs | The seven-label chip priority in `tab-chip.tsx:39-57` is exactly what the drawing shows and is preserved. New: the two-line tab, the width-driven format rule, the pinned count button, the pinned `+` (today the `+` is an ordinary `TabsTrigger` at `tabs.tsx:75`, so it scrolls away). | `tabs` #1, #2, #3, #5, #6, #7 | Decision 17 records a *Tab shows* setting in cart settings (amount and status dot · amount and customer · …) and then rules the format by width. Is the setting still wanted, or does width decide alone? Suggestion: **width alone** for 1.11; the setting is a restaurant-extension concern. |
| `.crumb` breadcrumb + `.pane` slide (`Products › Tote bag`, 280 ms, exiting pane drifts 24% and fades; grid drills in with a 22 ms stagger — decisions 32, 38, 39, 40) | nothing. Today: `pos/products/cells/variations-popover/index.tsx` (a popover) and `components/product/variable-product-row.tsx` (inline indented rows) | no component, new | Decision 38 makes slide-vs-inline a **setting** in the products panel, so both idioms stay; only the slide is new. | `virtualized-list` #6, #7, #8 (cached sizes while hidden, end-reached suppression on a zero-sized container, recheck on resize) — the exiting pane is exactly that case | — |
| `.divider` — 8 px column divider, grip always faint on touch, on hover on the desktop, primary while dragging (cut 2 point 6) | `packages/components/src/panels/index.tsx` (`PanelResizeHandle`, 8 px, `hitTargetSize`) | restyle only | Only the grip's paint changes; the 25% minimum per pane and the hit target are already there. | `panels` #1, #2, #3, #4 | — |

### Composed — cart and register

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.custrow` — one height by construction, order chip `#102476` beside the customer chip in checkout (decision 49) | `pos/cart/cart-header.tsx` | behaviour differs | Measured in the prototype: the live app jumps ~37 px into checkout because the ledger drops the headers and shrinks the customer row. Drawn: control height + padding + hairline whatever it holds. | `combobox` #1–#17 (the customer picker inside it) | — |
| `.totals` — no `Total` row; the Checkout button carries the total (decision 50) | `pos/cart/totals.tsx`; `pos/cart/buttons/pay.tsx:35` already formats the total onto the button | restyle only | The button already carries it; the duplicate row above goes. | none | — |
| Cart foot: `⋯ \| Checkout` at every width; `⋯` opens the order sheet with **Void** (red outline, left) · Print bill · Save order at its foot (decision 46) | `pos/cart/index.tsx:169-192` — an `OrderMetaButton`+`SaveButton` row, then `VoidButton` + `ButtonGroupSeparator` + `PayButton`; `pos/cart/buttons/edit-order-meta/` is the dialog | behaviour differs | The two-button row and the joined Void/Checkout group both go. Void keeps its Undo toast (`buttons/void.tsx:119-127`) and its late-outcome watch (`LATE_OUTCOME_TIMEOUT_MS`, `void.tsx:31`) — the button moves, the behaviour does not. | `button` #6, #8; `toast` #2, #5; `dialog` #4, #9 | Void inside the sheet is two taps from the cart, behind a glyph with no label. Rule 2 wants destructive actions apart from constructive ones — is the `⋯` enough separation? Suggestion: **yes**, and it is strictly safer than today's adjacency to Checkout. |
| `.note` — the order note as a row above the totals (decision 44, parked) | `pos/cart/totals/customer-note.tsx` | restyle only | Paul parked this: "the row is fine for the moment", switch stays. | none | Parked, not closed. Does the row survive the language pass unchanged? Suggestion: **yes**, restyle only; revisit when the order sheet lands. |
| Register panel — `£480.80 in the drawer`, Paid in / Paid out / No sale, method rows, X-report, last closure (`tablet-light-regular-panel.jpg`) | `pos/cart/register-panel.tsx` (a `Dialog`); `pos/cart/movement-sheet.tsx` | restyle only | Same content, same actions. | `dialog` #4–#8; `toast` #1 | — |
| Gate cards — Closed / Choose register / Counting / Overdue (`tablet-light-regular-{closed,counting}.jpg`) | `pos/cart/open-register-card.tsx`; `register-picker.tsx`; `register-count.tsx`; `closure-sheet.tsx` | restyle only | The big money field, the float/last-count chips, the over-limit warning and `Approve & close` all exist. | `button` #2, #13; `toast` #1 | — |
| **Print bill** — third action in the order sheet, "Not a receipt" band, purchase-order template (decision 41) | nothing. `pos/checkout/receipt-stage/receipt-stage.tsx` is the surface it would reuse | no component, new | Decision 41 says the plugin data (`order.needs_payment`, `order.wc_status`, `order.paid`) and the gallery's Quote/Estimate template already exist; only the wiring is missing. | none | This one crosses into the plugin (the UNPAID band in the stock receipts). Is it in the 1.11 language pass or its own ticket? Suggestion: **its own ticket**, gated behind the order sheet landing. |

### Composed — tender

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| `.pay` — the pane on the **neutral** surface, the amount at `--amt * 1.9` (decision 8) | `pos/checkout/tender/tender-pane.tsx:303` — `className="bg-sidebar text-sidebar-foreground flex-1"` | restyle only | Skin only; structure, keypad and fold are PR #259's and untouched. Every `text-sidebar-foreground/70` in the file follows the surface. | none | — |
| `.methods` — a fixed three-column grid; five in one row on tablet/desktop via `.methods.row` (rule 4) | `tender-pane.tsx:67` `className="flex-row flex-wrap gap-2"`; tiles at `:261` `h-12 shrink-0 rounded-xl` | behaviour differs | Today the tiles **wrap** and are 48 pt tall; the drawing fixes the columns, keeps order, and uses the `--tile` token (64 at regular). Rule 4 and the Rejected list both name the wrapping row. | `button` #5 (the height that changes) | — |
| `.mt.legacy` + the `Payments \| Legacy` text toggle in the header (decision 15) | `pos/checkout/tender/legacy-tab.tsx`; `pos/checkout/components/payment-webview.tsx` | restyle only | Decided: the header text toggle stays because the legacy checkout is an iframe that takes the pane. | `webview` #1–#11 (untouched, but the pane around it moves) | — |
| `.sl-ring` split ring + `.legs` chips with matching dots + Even tiles with pies (decision 50) | `pos/checkout/tender/split-view.tsx`; `pos/checkout/tender/tender-pane.tsx:329` (`checkout-split-chip`), `:361` (`checkout-plan`) | behaviour differs | Paul ruled the split **functionality** decided; only the drawing changes. The ring draws in when the chooser opens and stays while a plan or part payment exists; it is out of Amount and Percent mode. The chooser, legs, `Change split` and `Cancel payment` all exist. | none in the library; `button` #5 for the tiles | The ring is an arc chart — the first one on the POS screen, and `reports/chart` uses Skia (which loops rAF on web while mounted). Is an SVG ring acceptable rather than Skia? Suggestion: **SVG/CSS ring**, no Skia on the register. |
| `.ledger` — the payments block: paid · left bar over a ticked vertical timeline (decision 51) | `pos/checkout/tender/ledger-pane.tsx`; `pos/cart/checkout-ledger.tsx` | behaviour differs | Every fact the drawing shows (method, amount, time, status, method detail, pending legs with "next", "Paid in full", "No payments yet") is a prototype fixture, not live data. Today the ledger is a `Collapsible` list of rows. | `collapsible` #1 | The drawn block needs a **time per payment** and a cash tendered/change detail. Does the ledger row data carry those today, or is this a data ticket first? Suggestion: **check `readLedger` before speccing the view** — `tab-chip.tsx:32` reads it and only uses status and amount. |
| `.term` — the terminal moment: 112 px ring, reader card, four steps, *Cancel on terminal* | `pos/checkout/tender/terminal-leg-view.tsx`; `reader-connection.tsx` | restyle only | Strings and states confirmed as the app's by the register README's Inventory. | `collapsible` #1 | — |
| Paid stage — `Print receipt · New sale` primary, `Email receipt`, `No receipt · New sale` (`tablet-light-regular-paid.jpg`) | `pos/checkout/receipt-stage/receipt-stage.tsx` | restyle only | Plus the stamp row above (new, see `.stamp`). | `button` #2, #13 | — |

### Composed — orders

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| Frameless orders list, hairline rows, `Showing 12 of 1,248` + sync in a footer (decisions 20a, 22) | `orders/index.tsx:127` — `Card` / `CardHeader className="bg-card-header"` / `CardContent` | restyle only | The frame and the tinted header band go; the table, the footer and the count contract stay. | `card` #1, #2 (the shadow and the header rounding, both leaving) | Decision 20 also picked **grouping by day** as the default for the Date sort, and status counts "the day the counts endpoint exists". Are either in 1.11's scope? Suggestion: **neither** — land the frameless base, ticket grouping separately. |
| Status as a dot + label column (decision 4) | `components/order/status.tsx` — an `IconButton` with a `Tooltip`, icon only | behaviour differs | Costs a 172 px column; gains a status readable at arm's length and one treatment shared with the open order and the receipt. The icon also **filters** on press (`status.tsx:73`) — the drawn dot+label must keep that or lose it deliberately. | `tooltip` #1–#6 (the tooltip leaving); `status-badge` #1 | Does the dot+label cell keep the tap-to-filter behaviour? Suggestion: **keep it** — it is a learned affordance with no cost in the new drawing. |
| The open order as a **pane beside the list** (560 / 440 px), list stays live, row selected (decision 7) | `orders/view/modal.tsx:62` — `Modal side="right" size="2xl"` with its own two columns and a rail | behaviour differs | The 800 px modal becomes a pane; the list keeps its core columns and the row shows selected. The pane's foot is `Refund` + `Print receipt`, which the modal footer already has. | `modal` #4, #7, #8, #11, #12; `dialog` #4–#8 | The modal's right **rail** (customer, addresses, tax IDs, payment, POS metadata — `view/sections/customer.tsx`) does not fit a 440 px pane. Does that content stack, or move behind a disclosure? Suggestion: **stack it below the totals**, in the drawn pane's order. |
| Filter chips: two-state chip with no chevron, select with a value + chevron + ×, hairline between the groups (decision 21) | `components/order/filter-bar/*`; `pos/products/filter-bar/pos-filter-bar.tsx`; `quick-filter-button.tsx`, `quick-filter-editor.tsx` | restyle only | Decision 40 adds the multi-select group shape (`Drinks +1 ×`), which `quick-filter-*` already models. | `select` #1, #2, #3, #8, #9, #11; `button` #9–#12 | — |
| Row `⋯` menu | `orders/cells/actions.tsx` | restyle only | — | `dropdown-menu` #1–#3 | — |

### Composed — reports

The Reports design is **not signed off** (Paul, 2026-09-17: it "sucks") and is being reworked in a
sibling session, so these rows name the page, not a settled drawing.

| Drawn element | Covers it today | Verdict | Behaviour delta | Ledger lines touched | Question for Paul |
|---|---|---|---|---|---|
| The till strip above the hero — register · open since · cashier, a step line of the cash level through the session, X-report, chevron into Closures (decision 47, C3) | `reports/closures/session-card.tsx`; `reports/closures/session-cards.tsx` | behaviour differs | Today a card in the Closures room; drawn as a slim full-width strip above the hero, outside the date. | none | — |
| Hero: amount, signed delta chip opening a comparison menu, date as the card's title opening a picker (decision 47) | `reports/page-bar.tsx` — a `Tabs` period switch plus a `Calendar` in a `Popover` | behaviour differs | The scope row folds into the hero's title; register and store move to the bar; the bordered chips go. | `calendar` #1–#4; `popover` #1–#4; `tabs` #1–#9 (the period Tabs leaving) | — |
| Chart: `By hour \| Running total` behind one toggle, busiest bucket labelled with its amount and order count, comparison as a dashed line, tax off the chart (decision 47) | `reports/chart/chart.tsx` — victory-native `StackedBar` on Skia; `chart/index.web.tsx` is a separate file | behaviour differs | A running-total line, a dashed comparison series and a labelled bar are all new series types. | none (charts are not in `packages/components`) | Skia's web canvas re-arms rAF for every mounted chart. With eight cards plus the hero chart on one page, is a non-Skia web path required? Suggestion: **yes** — make the web chart path a stated requirement of the reports ticket, not a discovery. |
| Eight cards: `Orders` summary with a status bar; `Payments`, `Cashiers`, `Categories`, `Where sold` as thick donuts with the total in the middle; `Taxes`, `Refunds` as cards with a proportional bar (decision 47) | `reports/report/index.tsx`; `reports/orders/index.tsx`; `reports/report/template.tsx` (the X-report print) | no component, new | The donut, the proportional bar and the five-colour categorical set (`--c1`…`--c5`, currently scoped to the reports CSS) do not exist. | none | The five categorical colours "move to the shared tokens if it stands". Do they become part of the token sheet now, or stay report-scoped? Suggestion: **report-scoped** until a second screen needs them; the direction's ruling is that colour carries meaning, and a categorical set carries none. |
| The closure panel — closure as recorded, Recount, Reprint | `reports/closures/closure-panel.tsx` (a `Dialog`); `recount-sheet.tsx` | restyle only | Decision 47's open pick: detail panels open from the **right** on Reports (there is no cart to return to). | `dialog` #4–#8 | Confirm right-side panels on Reports, against the register's "panels come from the side opposite their subject" rule? Suggestion: **right**, and say in the spec that the register's rule is a register rule, not an app rule. |

---

## Questions for Paul

One per line; each suggestion is a **suggestion**, not a decision.

1. **`.q` quiet button** — `ghost` or `ghost-quiet`? Both exist (`button` ledger #6, #7). _Suggestion: `ghost-quiet` for text-only actions, `ghost` for icon buttons._
2. **Chip vs pill** — one `Chip` primitive with variants, or keep `ButtonPill` and add a read-only `Pill`? _Suggestion: one `Chip`, with `ButtonPill` kept as its removable form so `button` #9–#12 are not re-derived._
3. **`.segt` segmented control** — new primitive, or restyle `toggle-group`? _Suggestion: a new `segmented-control`; a segment picks a value, it does not navigate._
4. **Keypads** — one `Keypad` primitive for the tender, the cart quantity and the split modes, or three? _Suggestion: one, with `numpad` = `Keypad + Display`._
5. **`.st` dot + label vs `StatusBadge`** — a new component beside it, or change `StatusBadge`'s default shape under all 16 call sites? _Suggestion: change the default, keep the tinted pill as `variant="solid"`._
6. **Banner** — one `banner` primitive, or leave `storage-outage-banner` and `totals-changed-banner` separate? _Suggestion: one primitive; this is rule 5's "one badge in one place"._
7. **The quantity keypad's 38 px overhang** across the resizable divider — acceptable at every cart width? _Suggestion: flip the panel's side by available space, stated in the spec._
8. **The free strip with no header** — above the rail, app-wide, or per page? _Suggestion: above the rail, one mount, dismissed per session._
9. **The update notice's per-platform action** (reload / restart / store) — in the language pass or its own ticket? _Suggestion: its own ticket; draw the row, wire nothing._
10. **The empty-state doodle** (decision 29 left it open) — draw one for 1.11 or ship without? _Suggestion: ship without._
11. **Skeleton rows** — does the language pass settle #308, or does #308 still decide? _Suggestion: settle it here and let #308 inherit._
12. **The PAID stamp's home** — the shared library or beside the receipt stage? _Suggestion: beside the receipt stage until a second caller exists._
13. **Panel side rule** — by subject (decision 46) or by the products-column setting (today's `overlay-side.tsx`)? _Suggestion: by subject, with the column position only breaking ties._
14. **The open-orders takeover** — a takeover at every width, including the phone? _Suggestion: yes._
15. **Press-and-hold to add** — 450 ms, and what cancels it on a scrolling list? _Suggestion: 450 ms, cancelled past the touch slop, no hold on the web._
16. **The tile badge property** — stock fixed now, or build the property picker with it? _Suggestion: stock fixed now._
17. **Cart-line removal's single entry point** — the swipe only, or the swipe and the ⋯ sheet? _Suggestion: the swipe only, so `table` #6/#7's latch keeps one owner._
18. **Rows vs table** — is the split key **width** or **platform**? _Suggestion: width._
19. **The rail loses its labels** — icon-only at every scale step, including spacious on a 32-inch screen? _Suggestion: icon-only everywhere, label in a tooltip._
20. **Tab format** — keep the *Tab shows* setting from decision 17, or let width decide alone? _Suggestion: width alone for 1.11._
21. **Void behind the `⋯`** — is a glyph with no label enough separation for a destructive action under rule 2? _Suggestion: yes, and safer than today's adjacency to Checkout._
22. **The order note row** — survives the language pass unchanged? _Suggestion: yes, restyle only._
23. **Print bill** — in the 1.11 language pass or its own ticket (it crosses into the plugin)? _Suggestion: its own ticket, gated behind the order sheet._
24. **The split ring's renderer** — SVG/CSS, or Skia like the reports charts? _Suggestion: SVG/CSS; no Skia on the register._
25. **The payments block's facts** — does the ledger row data carry a time and a cash tendered/change detail today? _Suggestion: verify `readLedger` before speccing the view; `tab-chip.tsx` only reads status and amount._
26. **The orders list's extras** — grouping by day and status counts in 1.11, or later? _Suggestion: later; land the frameless base._
27. **Status cell tap-to-filter** — does the dot + label keep it? _Suggestion: yes._
28. **The open-order pane's rail content** at 440 px — stack it or hide it behind a disclosure? _Suggestion: stack it._
29. **Skia on the reports page** — is a non-Skia web chart path a stated requirement? _Suggestion: yes._
30. **The five categorical colours** — into the shared token sheet, or report-scoped? _Suggestion: report-scoped._
31. **Reports panels open from the right**, against the register's opposite-side rule — confirm? _Suggestion: right, and say the register's rule is a register rule._

## Two things the drawing has no home for

Written as questions per the ticket's constraint, not as proposals to remove anything.

- **The per-line `×` and its re-entrancy latch.** `packages/core/src/screens/main/pos/cart/cells/actions.tsx:33-47` documents a real defect (monorepo#1693): a quantity change fires `pulseAdd()` for the same uuid, cancelling the remove pulse, so a cell-level latch would stay set forever and the line would be unremovable. The drawing has no `×`. The behaviour still needs an owner. _Question: does the swipe's release call the same `pulseRemove`, keeping one owner?_
- **The products settings' current side rule.** `pos/contexts/overlay-side/overlay-side.tsx` derives the side from the products column position and falls to `bottom` at `sm`; decision 46 derives it from the panel's subject. Both are learned — the first from the column being movable, the second from Paul's rule that a settings panel must not cover what it configures. _Question: which wins when the products sit on the right?_
