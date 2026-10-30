# Cashier sheet, register panel, store switch and the close — design spec

- **Date:** 2026-10-28
- **Status:** Approved by Paul ("as you recommend"), builder-checked, awaiting the implementation plan
- **Lane:** `next` (2.0). UI-polish phase rules apply: no new E2E, merge on review-gate green,
  fast-forward `ui-polish-live` and publish `@next` after every merge.
- **Board:** `~/Projects/wcpos-handoffs/cashier-register-map-2026-10-28.html` (the surfaces drawn
  with the app's own components; sections: today/proposed, doors, surfaces, states, flows,
  scenarios). This document is the written form of that board, amended by the builder check.
- **Base:** `origin/next` after wcpos/monorepo#3018 (the cashier entry refactor: `CashierEntry`
  owns the avatar and the one `UserSheet` host on the rail and in the bar).
- **Companion work (same day):** the Closures session reshapes `ClosurePanel`
  (`packages/core/src/screens/main/reports/closures/closure-panel.tsx`) to the shared header, adds a
  pushed mode and extracts `ClosureBody` (§ 7 has the interface). Free has no Closures room (ruled
  2026-10-28); the register panel's row is the only door to a closure there.

## 1. Intent

The register family on `next` is three overlays and a cart-column state machine that grew one at a
time: a cashier sheet from the right, a register panel and a store sheet from the left, four doors
that change who or where (none of which confirms), a close that jumps from the panel to the cart
column and back to a side sheet, and a closure row that leaves the POS for the Reports page. Paul,
2026-10-28: "the workflow is very fragmented and confusing".

The fix is structural, not visual: three places with one question each, one side for everything the
register owns, one confirm pattern for every switch, one header recipe, one closure component. The
visual language does not change; every surface is built from components the gallery already renders.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A cashier finds who, where and the drawer in one sheet, and changes any of them through one
   confirm that says what happens to the money and to their work before the act.
2. The register panel owns the whole close. Nothing in the cart column changes until the register
   is closed, except that selling pauses while the drawer is being counted.
3. The three panels (cashier sheet, register panel, closure pane) read the same way: identity header,
   figure tiles, detail.
4. A closure is one component wherever it is read: pushed inside the register panel, the Reports
   side panel, the written moment.

**Non-goals**

- No new visual language. No tinted hero cards, dark surfaces, monospace blocks, mascots, confetti.
- No merge of the cashier sheet and the register panel (10-23 survey, kept).
- No hand-over count (a mid-session count stamped with both names). Later, if a merchant asks.
- The Closures room itself (the Closures session's board).

**Anti-goals** (would make this a failure even if it works)

- A switch that still happens on a bare tap.
- A second session opened on a register the server already holds open (the offline trap, § 5.1).
- Two surfaces that list the same stores, registers or cashiers.
- A sale taken while the drawer is being counted.

## 3. Constraints

- Lane `next`; branch per slice off `origin/next`; each PR ≤ 600 added production lines; review
  rounds end at 5.
- Components only: `Dialog`/`DialogContent side` with `usePanelSide`, `DialogHeader`/`DialogTitle`/
  `DialogDescription`, `DialogFooter` slots (never a `Button` in a footer), `AlertDialog` +
  `AlertDialogFooter`, `MenuRow` (choice with the check), `Notice`, `Badge tinted`, `StatusBadge`,
  `RadioGroup`, `Avatar`, `AmountFigure`, the `Derivation` rail, the pane-stack push. The closure
  sheet's figure tile recipe (`border-border rounded-lg border px-3 py-2.5`, label
  `text-muted-foreground text-sm`, `AmountFigure size="tile"`) is the figure tile everywhere.
- Tones use the tone map's vocabulary (`packages/components/src/lib/tone.ts`): a closure's result
  over = `ok`, short = `bad`, exact = `muted`; Unsynced / Corrected = `warning`. `destructive` is an
  action's variant (Sign out, Void), never a state's (#3024).
- Every string translated (`packages/core/src/contexts/translations/locales/en/core.json`); plain
  words (float, drawer, count, close; never session, variance, threshold).
- `CODING_STANDARDS.md` § Situation → overlay row "The cashier … `UserSheet` (right panel)" changes
  to: on the POS the products side (`usePanelSide('cart')`), on every other screen the page's
  `right`. Decision 46 (2026-09-17, bell and cashier from the right) is reversed for the cashier on
  the POS only; the bell stays right. The 2026-09-11 ruling "counting → the count in the cart
  column" is reversed by § 4.5.
- Two small plugin changes on `woocommerce-pos` `next` (§ 4.5, § 4.6) ship as their own PRs before
  the client slices that read them; the client feature-detects both (an older plugin gets the
  nameless Counting card and no carry option).

## 4. The map

### 4.1 Places

| Place          | Question it answers                                         | Opened from                                                                                                                                                       | Side                                                                     |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cart column    | the register's state when there is no register to sell with | always                                                                                                                                                            | in place                                                                 |
| Register panel | what is in my drawer now and what moved it; the close       | the bar's drawer icon; the cashier sheet's drawer tile, on every screen; the empty cart's own Close register button past closing time (`checkout-close-register`) | right on every screen (Paul, 2026-10-30)                                 |
| Cashier sheet  | who am I, where am I, how do I change that                  | the avatar (`CashierEntry`: rail on lg, bar below, on every screen); the register bar's store title (Pro, >1 store)                                               | `right` on every screen (Paul, 2026-10-30; was products side on the POS) |
| The confirm    | what a switch does before it happens                        | any switch row; Sign out with an open register                                                                                                                    | centred `AlertDialog`                                                    |
| Closure pane   | one closure, read back                                      | the panel's last-closure row (pushed); Reports › Closures and the till strip (Reports side panel)                                                                 | same side as its host                                                    |
| Notifications  | the shell's inbox                                           | the bell                                                                                                                                                          | right (unchanged)                                                        |

One register-family panel is open at a time: opening the sheet while the panel is open replaces it;
the sheet's drawer tile opens the panel and closes the sheet. Away from the POS the drawer tile opens the panel in place, from the right, hosted by the avatar's entry (Paul, 2026-10-30); the close works there as on the POS, since the cart holds Pay through the session's status, not through the panel.

### 4.2 The header, one recipe

`DialogHeader` row: a 48 pt leading element · `DialogTitle` · `DialogDescription` · ×. The description
reads **place · register · when · who**, dropping whatever the title already says.

| Panel          | Leading                                   | Title                                                  | Description                                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Cashier sheet  | the cashier's `Avatar`                    | display name                                           | `UK Store · Front counter · since 13:05 · 3 h 20 m`                                                      |
| Register panel | a disc with the register glyph            | register name (`Register` when the store has one)      | `UK Store · open since 13:05 · 3 h 20 m · **Demo Cashier**` (the opener)                                 |
| Closure pane   | ‹ when pushed, then the result's ToneDisc | `Closure 12` (`Closure 12 written` only on the moment) | `UK Store · Front counter · 09:02–18:02 · **Amy Okafor**` (the closer; the opener sits on the Float row) |
| Count pane     | ‹, the register disc                      | `Close Front counter`                                  | as the register panel                                                                                    |

The register's 40 pt `AmountFigure` leaves the title and becomes the first figure tile.

### 4.3 The cashier sheet

In order, each part only when it applies. Every switch is a `MenuRow` in a band; there is no tile
row and no second list anywhere.

1. Header (4.2).
2. Figure tiles: **Your sales today** (`useSalesToday`, `n sales` under it) · **In the drawer**
   (expected cash, `opened HH:MM by <avatar>`; a door to the register panel; `Register closed · last
closure N` when closed; absent while the device is unbound).
3. `Notice warning` **n sales awaiting store** with the existing "Sent when you are signed in
   online." (replaces the hand-rolled rows; the 10-21 Notice sweep).
4. **Cashier** band: a `MenuRow` per saved cashier on this device (avatar, name), the current one
   checked; a tap on another opens the hand-over confirm. Then **Another account…** as today
   (`AddUserButton compact`, which keeps the OAuth redirect-return claim in `CashierEntry` working
   unchanged). With no other saved cashier the band is the current cashier and Another account….
5. **Store** band (Pro, >1 store): a `MenuRow` per store, the current one checked; a tap on another
   opens the store confirm.
6. **Register** band (>1 register): a `MenuRow` per register with its live state as the description
   (`Open since 09:02 · Amy Okafor`, `Closed · last closure #41`, `Counting`); the current one
   checked; disabled with `register.switch_register_blocked_cart` while a cart is attributed to this
   register. The cart-column picker stays for the unbound case.
7. A hairline, then **WordPress Admin ↗** and **Desktop App ↗** as plain `MenuRow`s, web only, shown
   to every cashier as today.
8. `DialogFooter destructive` **Sign out** (§ 4.6 when the register is open).

`switch-store-sheet.tsx` is deleted. `use-switch-store` and its blocking "Switching store…" overlay
stay and run after the confirm. The register bar's store title opens this sheet (scrolled to the
Store band) instead of the deleted sheet; with one store it stays a plain title.

### 4.4 The register panel

1. Header (4.2), with the opener's `Avatar size="sm"` and the live age from the existing minute
   stream.
2. Figure tiles: **In the drawer** (expected now) · **Session sales** (every tender, `n sales`).
   Blind cashier: the first tile is the sales count, no figure.
3. The three movement `Tile`s **Paid in** · **Paid out** · **No sale** with the icon set's
   arrow-into-drawer, arrow-out-of-drawer and drawer glyphs (not chevrons). They open the movement
   sheet as today.
4. The ledger as the `Derivation` rail: one step per term that happened (Opened HH:MM → Float; Cash
   sales · n → Taken; Cash refunds · n; Paid in · n; Paid out · n), each movement a sub-line with its
   reason, amount and **Void** (ghost), the last step **Expected in the drawer**. Zero terms are not
   drawn; the closure document keeps every term. The rail component gains a sub-line variant with an
   action.
5. **Other tenders** band and quiet rows, as today.
6. **One** last-closure row: `Closure N · yesterday 18:02 · 980,00 £` with the result as `Badge
tinted` (Exact / 2,00 £ over / 2,00 £ short; Unsynced / Corrected in `warning`). Pressing it
   pushes `ClosurePanel` with `onBack` (§ 7). The panel never lists more closures. Reprint and the
   Reports `router.push` leave the panel; they live on the pane.
7. Refused-movement `Notice bad` with Retry above the rail, surviving the close, as today.
8. `DialogFooter size="lg" intent` **Close register**, reading `Close register · it's past 17:30`
   when overdue (the 2026-09-11 "button knows the time"); disabled when closed.

Closed with a last closure: header, the closure row only, Close register disabled. Closed with
nothing: the panel and the bar's drawer icon do not render (as today).

### 4.5 The close, in one panel

1. **Close register** writes `status: 'counting'` to the session exactly as `startCounting` does
   today (the server blocks movements on a counting session) and pushes the **count pane** inside
   the panel (the pane-stack push used for the closure pane). While the session is counting the
   cart column stays in place but cannot sell: the Pay button is disabled with `Counting the
drawer`, the bar's pill reads Counting. The pane: header 4.2 with ‹; the typed count with its
   keypad and the denomination tiles (the existing `register-count` body, moved under the panel);
   `Expected N` and the result badge (hidden for a blind cashier); other tenders counted; `Notice`
   **n sales not yet on the server — the closure will record them**; `Notice` **n carts still open
   · they wait for their cashier** (warning, never a block); `DialogFooter size="lg" intent`
   **Close & print**. ‹ and × both run `backToSelling` (the session returns to `open`). Manager
   approval is the existing centred approve sheet over it.
2. **Close & print** pushes the **written moment**: `ClosureBody` with the ok ToneDisc and the title
   override `Closure N written`, the three figure tiles, `✓ Printed` or the print error with
   **Print again** (`secondary`), **Done** (`intent`).
3. **Done** closes the panel. Only now does the cart column become the Open register card.
4. The empty cart's Close register button past closing time (`checkout-close-register`) opens the
   panel directly on the count pane.

**Who is counting.** The device records that it started the count beside the register pointer
(`register-document.ts`, see § 5.1). After a reload, a session that reads `counting` with the
device's own mark reopens the count pane; without the mark it is **Counting elsewhere**: the cart
column shows a card (register name, `Counting on another till`, no action) and sales wait until the
status returns to `open`. The plugin gains `counting_by` and `counting_at` on the session row
(set by the status transition, cleared by back-to-selling and close); when present the card and
the sheet's Register band name the counter and the time; when absent (older plugin) they do not.

The cart column therefore shows only: the cart (selling, or paused while counting), **Open
register**, **Pick register**, **No register**, **Counting elsewhere**.

### 4.6 The confirm

One `AlertDialog`, four parameterisations. The confirm's button is the verb with the object on it;
cancel is the footer's cancel slot. `AlertDialogFooter` gains an optional `secondary` slot (outline,
between cancel and confirm; phone after confirm), needed only by the Sign out case.

| Trigger                        | Title · description                                                                                | Body                                                                                                                                                                                                                                                                                                                       | Footer                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A cashier row                  | **Hand the till to X?** · The POS reloads as them. The drawer stays open on Front counter.         | figure tiles **Your sales today** (`n sales · 3 h 20 m`) · **Drawer stays at** N (`opened 13:05`; `Register closed · last closure N` when closed); `Notice info` **Your n open carts and n unsent sales wait here for you.**                                                                                               | confirm **Hand over to X** · cancel                                                                     |
| A store row                    | **Switch to Y?** · The POS reloads in Y. Y's register: closed / open since … / you'll choose one.  | `RadioGroup` (only when Y's register is known and closed, § below): **Take the drawer with you** (closes Front counter at expected and opens Y's register with it as the float; default) · **Leave it open here**. When Y's register is open on another till, or unknown, one line says so and the drawer stays open here. | confirm **Switch to Y** · cancel                                                                        |
| A register row                 | **Switch to Z?** · This device moves to Z. Front counter's drawer stays open for whoever is there. | `Notice info` with Z's state (Closed · last closure #41 · You'll open it with a float / Open since … · you join it).                                                                                                                                                                                                       | confirm **Switch to Z** · cancel                                                                        |
| Sign out with an open register | **Front counter is still open at N. Close it first?**                                              | `Notice info`: a till left open stays open for the next cashier; the closure records who closed it.                                                                                                                                                                                                                        | confirm **Close register** (opens the panel on the count pane) · secondary **Sign out anyway** · cancel |

**Guards.** Every switch and Sign out are disabled with a reason while a payment is in flight
(terminal waiting, redirect gateway open): `Finish the payment first`. Hand over is disabled while
this device is counting: `Finish or abandon the count first`. Switch store, the carry and Another
account… are disabled offline: `Needs the store to switch`. Hand over to a saved cashier works
offline (§ 5.1).

**Which register in Y.** The register pointer is one per (site, store) since slice 1 (`register-document.ts`
keys `sites[siteUuid].bindings[storeId]`, read through `useRegisterDirectory(storeId).registerId`), so
switching store never drops Front counter's binding
and returning needs no second choice. Y's register in the confirm is Y's bound register, else Y's
only register, else unknown ("you'll choose one there"; no carry).

**Take the drawer with you** (disabled with _Send n sales first_ while `unsyncedCount > 0`, § 4.9) is one server act: `POST /sessions/{id}/carry { to_register_id }` on
the plugin closes the session at the server's expected cash (so a blind cashier carries the right
figure and other tills' sales are included), writes the closure with `reason: 'store_switch'` (today's
closures become `end_of_day` explicitly) and opens the target register's session with
`float_source: 'carried'` and `carried_from_closure_id`, returning both rows; the client adopts them
and then runs the store switch. A failure before the switch leaves everything as it was. The closure
pane and the Closures room badge the closure **Carried to Y**; the new register's Float step reads
`carried from UK Store`. Returning, the confirm offers **Take the drawer back** (the same act in
reverse). The client closures schema gains `reason` and the session schema `float_source` and
`carried_from_closure_id` (RxDB migration, additive).

### 4.7 The bar's pill

Unchanged in meaning; one pill, only when abnormal: Closed, Counting (own or elsewhere), Overdue,
Offline · n sales to send, No register, Choosing. A register closed on another till flips to Closed
at the next refresh with a `Notice` on the Open register card: `Front counter was closed on another
till at 17:41 by Demo Cashier`; a sale mid-capture lands on the next session.

### 4.8 Phone and platform

Under 640 every panel is a page and every push is a page push with the back arrow; the avatar sits
in the bar on both POS tabs and opens one sheet (#3018). Denomination tiles wrap to two rows. With
products on the right every register-family panel comes from the right beside the bell; one is open
at a time. The desktop title-bar strip hosts the avatar; no web links on desktop.

### 4.9 Two invariants every slice keeps

Written once here after the spec PR's review (fifteen threads, the round cap); every plan step that
touches drawer money cites them instead of restating them.

1. **A seeded session's figures are unknown until the server's baseline arrives.** `useRegisterSession`
   exposes `figuresPending` (slice 1b: the session was seeded into this store database and has no
   `server_expected_at`). Every surface that shows or acts on drawer money reads it: the register
   panel's figure tiles and rail, the cashier sheet's drawer tile and the hand-over confirm's drawer
   tile render `—` with _Figures arrive with the next sync_; Close register, `startCounting`, the
   carry and the count pane are disabled by it. No closure, count or carry is ever written from a
   pending session.
2. **Cash leaves a session only after this device's accounting for it is delivered.** A close waits on
   its accounting as the queue already does; the carry (§ 4.6) is disabled with _Send n sales first_
   while `useRegisterSession().unsyncedCount > 0`, and the confirm's description names the count.
   Slice 6 tests a reconnect with pending cash sales and movements: the carry stays disabled until the
   queue drains, then enables.

## 5. Slices, in order

Budgets are added production lines (tests, snapshots, strings, docs, migrations excluded).

1. **Device-side register state (prerequisite; split into 1a and 1b at the budget gate on 2026-10-28, ≤ 200 each).** Reproduce on dev-next with the network
   off: hand over to a saved cashier, observe the Open register card on a register the server holds
   open. Then, in `packages/query/src/register-session/register-document.ts`: the pointer becomes
   per (site, store); beside it the device keeps the bound register's open-session id, opener and
   opened-at (written whenever a session is adopted or opened) and a `counting` mark (written by
   `startCounting`, cleared by `backToSelling` and the close). The Open register card and
   `useRegisterSession` read the cached session when the store database has no row, rendering the
   register as open with figures unknown until the refresh. Unit tests for every read.
2. **The cashier sheet (≤ 450).** § 4.3, the side rule, the deleted store sheet, the bar's title
   opening the sheet, the CODING_STANDARDS overlay row, the ledger line for
   `pos/contexts/overlay-side` line 3 amended for the cashier.
3. **The confirm (≤ 400).** § 4.6 without the carry: hand over, switch register, switch store with
   "Leave it open here" only, Sign out with an open register; `AlertDialogFooter secondary`; the
   payment-in-flight and count-in-progress guards. Split 2026-10-29 at the budget gate (431 measured
   against 400; the moved `switchUser` body counts as added lines): **3a** the confirm in front of the
   three switches (≤ 400); **3b** Sign out with an open register, the three guards,
   `AlertDialogFooter secondary` (≤ 200).
4. **The register panel (≤ 450).** § 4.4: header, figure tiles, glyphs, the Derivation sub-line
   variant, the closure row pushing `ClosurePanel` (§ 7), the lg intent's time suffix.
5. **The close in the panel (≤ 500).** § 4.5: the count pane and the written moment as pushes; the
   cart column loses its counting state and gains the paused Pay and the Counting-elsewhere card;
   the empty cart's Close register opens the count pane; the closed-on-another-till Notice.
   Plugin PR first: `counting_by`, `counting_at` on the session row.
6. **Carry the drawer (plugin ≤ 250, client ≤ 350).** Plugin PR first: the carry endpoint,
   `reason` on closures, `float_source` and `carried_from_closure_id` on sessions. Then the client:
   the `RadioGroup`, the adoption of both rows, the badges, the Float step's note, the
   open-elsewhere and unknown-register guards, Take the drawer back, the schema migration.
7. **Follow-ups, each its own PR, not in this spec's budget:** the figure roll when a sale lands
   while the panel is open (filmed before it is reported); owner-only web links if asked.

Slices 2–4 are independent of each other after 1; 5 depends on 1 and 4; 6 on 1, 3 and 5.

## 6. Left to the builder

- The register disc and ToneDisc sizes; the Derivation sub-line variant's API.
- How the sheet scrolls to its Store band when opened from the bar's title (a ref and `scrollTo`,
  or the band first when opened that way).
- The pane-stack host inside the register panel for the count and the written moment, and how the
  count's state (today's `register-count` hooks) moves under the panel.
- Feature detection for the two plugin fields (presence on the session row is enough).
- Test files: `user-sheet.test.tsx`, `register-panel.test.tsx`, `register-count.test.tsx`,
  `closure-sheet.test.tsx`, `switch-store-sheet.test.tsx` (deleted; carry its switching tests into
  the confirm's), `register-bar.test.tsx`, `open-register-card.test.tsx`, `register-document`
  tests. A deleted test file needs the `Test-Removal:` trailer before the first push.

## 7. The closure component (owned by the Closures session)

From `packages/core/src/screens/main/reports/closures/closure-panel.tsx`:

- `ClosurePanel({ row, onClose, onBack?, onRecountSaved? })`. With `onBack` it renders no host: the
  header shows the back arrow instead of ×, the caller (the register panel's pane-stack) owns the
  side, width and footer host; the footer stays its own (Recount `record` where allowed, Reprint
  `secondary`; Close omitted in pushed mode).
- `ClosureBody({ row, doc, blind, corrections?, title? })` (new `closure-body.tsx`): the shared header
  content (ToneDisc by result, title, description "place · register · when · closer"), the three
  figure tiles, the drawer ladder, other tenders, session rows, the Z-report row, corrections. No
  host, no footer. Slice 5 renders it for the written moment with the title override.
- Until that PR exists, slice 4 stubs the push against today's `ClosurePanel`.

## 8. Open items

- The offline trap (§ 5.1) is inferred from `refresh.ts` and `register-document.ts`, not yet
  reproduced. Slice 1 starts with the repro; if it does not reproduce, the cached session still
  feeds the sheet's drawer tile and the counting mark, so the slice stays.
