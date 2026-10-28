# Cashier sheet, register panel, store switch and the close — design spec

- **Date:** 2026-10-28
- **Status:** Approved by Paul ("as you recommend"), awaiting the implementation plan
- **Lane:** `next` (2.0). UI-polish phase rules apply: no new E2E, merge on review-gate green,
  fast-forward `ui-polish-live` and publish `@next` after every merge.
- **Board:** `~/Projects/wcpos-handoffs/cashier-register-map-2026-10-28.html` (the surfaces drawn
  with the app's own components; sections: today/proposed, doors, surfaces, states, flows,
  scenarios). This document is the written form of that board.
- **Companion work (same day):** the Closures session reshapes `ClosurePanel`
  (`packages/core/src/screens/main/reports/closures/closure-panel.tsx`) to the shared header, adds a
  pushed mode (`onBack`) and extracts `ClosureBody`. This spec consumes that component and does not
  redraw it. Free has no Closures room (ruled 2026-10-28); the register panel's row is the only door
  to a closure there.

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
   is closed.
3. The three panels (cashier sheet, register panel, closure pane) read the same way: identity header,
   figure tiles, acts, detail.
4. A closure is one component wherever it is read: pushed inside the register panel, the Reports
   side panel, the written moment.

**Non-goals**

- No new visual language. No tinted hero cards, dark surfaces, monospace blocks, mascots, confetti.
- No merge of the cashier sheet and the register panel (10-23 survey, kept).
- No hand-over count (a mid-session count stamped with both names). Later, if a merchant asks.
- The Closures room itself (the Closures session's board).

**Anti-goals** (would make this a failure even if it works)

- A switch that still happens on a bare tap.
- A second session opened on a register the server already holds open (the offline trap, § 7).
- Two surfaces that list the same stores or registers.

## 3. Constraints

- Lane `next`; branch per slice off `origin/next`; each PR ≤ 600 added production lines; review
  rounds end at 5. Slices land after wcpos/monorepo#3018 (the cashier entry refactor), which moves
  the sheet's host.
- Components only: `Dialog`/`DialogContent side` with `usePanelSide`, `DialogHeader`/`DialogTitle`/
  `DialogDescription`, `DialogFooter` slots (never a `Button` in a footer), `AlertDialog` +
  `AlertDialogFooter confirm/cancel`, `Tile`, `MenuRow` (choice with the check), `Notice`,
  `Badge tinted`, `StatusBadge`, `RadioGroup`, `Avatar`, `AmountFigure`, the `Derivation` rail, the
  pane-stack push. The closure sheet's figure tile recipe (`border-border rounded-lg border px-3
  py-2.5`, label `text-muted-foreground text-sm`, `AmountFigure size="tile"`) is the figure tile
  everywhere.
- Tones: over = success, short = destructive, exact = muted; Unsynced / Corrected = warn. Primary is
  the theme accent, never red; red is destructive only.
- Every string translated (`packages/core/src/contexts/translations/locales/en/core.json`); plain
  words (float, drawer, count, close; never session, variance, threshold).
- `CODING_STANDARDS.md` § Situation → overlay row "The cashier … `UserSheet` (right panel)" changes
  to the products side (`usePanelSide('cart')`). Decision 46 (2026-09-17, bell and cashier from the
  right) is reversed for the cashier only; the bell stays right. The 2026-09-11 ruling "counting →
  the count in the cart column" is reversed by § 5.3.

## 4. The map

### 4.1 Places

| Place | Question it answers | Opened from | Side |
| --- | --- | --- | --- |
| Cart column | the register's state when there is no register to sell with | always | in place |
| Register panel | what is in my drawer now and what moved it; the close | the bar's drawer icon; Checkout on an empty cart past closing time | products side (`usePanelSide('cart')`) |
| Cashier sheet | who am I, where am I, how do I change that | the avatar (rail on lg, bar below); the bar's store title (Pro, >1 store) | products side |
| The confirm | what a switch does before it happens | any switch row or tile; Sign out with an open register | centred `AlertDialog` |
| Closure pane | one closure, read back | the panel's last-closure row (pushed); Reports › Closures and the till strip (Reports side panel) | same side as its host |
| Notifications | the shell's inbox | the bell | right (unchanged) |

One register-family panel is open at a time: opening the sheet from the rail while the panel is open
replaces it; the sheet's Register tile and drawer tile open the panel and close the sheet.

### 4.2 The header, one recipe

`DialogHeader` row: a 48 pt leading element · `DialogTitle` · `DialogDescription` · ×. The description
reads **place · register · when · who**, dropping whatever the title already says.

| Panel | Leading | Title | Description |
| --- | --- | --- | --- |
| Cashier sheet | the cashier's `Avatar` | display name | `UK Store · Front counter · since 13:05 · 3 h 20 m` |
| Register panel | a disc with the register glyph | register name (`Register` when the store has one) | `UK Store · open since 13:05 · 3 h 20 m · **Demo Cashier**` (the opener) |
| Closure pane | ‹ when pushed, then the result's ToneDisc | `Closure 12` (`Closure 12 written` only on the moment) | `UK Store · Front counter · 09:02–18:02 · **Amy Okafor**` (the closer; the opener sits on the Float row) |
| Count pane | ‹, the register disc | `Close Front counter` | as the register panel |

The register's 40 pt `AmountFigure` leaves the title and becomes the first figure tile.

### 4.3 The cashier sheet

In order, each part only when it applies:

1. Header (4.2).
2. Figure tiles: **Your sales today** (`useSalesToday`, `n sales` under it) · **In the drawer**
   (expected cash, `opened HH:MM by <avatar>`; a door to the register panel; absent when the device
   is unbound or the register closed, where it reads `Register closed · last closure N`).
3. Three `Tile`s: **Hand over** · **Switch store** (Pro, >1 store) · **Register**. With one store,
   two tiles.
4. `Notice warn` **n sales awaiting store** with the existing "Sent when you are signed in online."
   (replaces the hand-rolled rows; the 10-21 Notice sweep).
5. **Store** band: `MenuRow` choice per store, the current one checked; a tap on another opens the
   store confirm. Only with >1 store.
6. **Register** band: `MenuRow` per register with its live state as the description (`Open since
   09:02 · Amy Okafor`, `Closed · last closure #41`, `Counting · Demo Cashier`); the current one
   checked; disabled with `register.switch_register_blocked_cart` while a cart is attributed to this
   register. Only with >1 register. The cart-column picker stays for the unbound case.
7. A hairline, then **WordPress Admin ↗** and **Desktop App ↗** as plain `MenuRow`s, web only, shown
   to every cashier as today.
8. `DialogFooter destructive` **Sign out**.

`switch-store-sheet.tsx` is deleted. `use-switch-store` and its blocking "Switching store…" overlay
stay and run after the confirm. The register bar's store title opens this sheet (scrolled to the
Store band) instead of the deleted sheet; with one store it stays a plain title.

### 4.4 The register panel

1. Header (4.2), with the opener's `Avatar size="sm"` and the live age from the existing minute
   stream.
2. Figure tiles: **In the drawer** (expected now) · **Session sales** (every tender, `n sales`).
   Blind cashier: the first tile is the sales count, no figure.
3. Three `Tile`s **Paid in** · **Paid out** · **No sale** with the icon set's arrow-into-drawer,
   arrow-out-of-drawer and drawer glyphs (not chevrons). They open the movement sheet as today.
4. The ledger as the `Derivation` rail: one step per term that happened (Opened HH:MM → Float; Cash
   sales · n → Taken; Cash refunds · n; Paid in · n; Paid out · n), each movement a sub-line with its
   reason, amount and **Void** (ghost), the last step **Expected in the drawer**. Zero terms are not
   drawn; the closure document keeps every term. The rail component gains a sub-line variant with an
   action.
5. **Other tenders** band and quiet rows, as today.
6. **One** last-closure row: `Closure N · yesterday 18:02 · 980,00 £` with the result as `Badge
   tinted` (Exact / 2,00 £ over / 2,00 £ short; Unsynced / Corrected in warn). Pressing it pushes
   `ClosurePanel` in its pushed mode. The panel never lists more closures. Reprint and the Reports
   `router.push` leave the panel; they live on the pane.
7. Refused-movement `Notice bad` with Retry above the rail, surviving the close, as today.
8. `DialogFooter size="lg" intent` **Close register**, reading `Close register · it's past 17:30`
   when overdue (the 2026-09-11 "button knows the time"); disabled when closed.

Closed with a last closure: header, the closure row only, Close register disabled. Closed with
nothing: the panel and the bar's drawer icon do not render (as today).

### 4.5 The close, in one panel

1. **Close register** pushes the **count pane** inside the panel (the pane-stack push used for the
   closure pane): header 4.2 with ‹; the typed count with its keypad and the denomination tiles
   (the existing `register-count` body); `Expected N` and the result badge (hidden for a blind
   cashier); other tenders counted; `Notice` **n sales not yet on the server — the closure will
   record them**; `Notice` **n carts still open · they wait for their cashier** (warn, never a
   block); `DialogFooter size="lg" intent` **Close & print**. ‹ returns to the panel; × is Back to
   selling (the session stays open). Manager approval is the existing centred approve sheet over it.
2. **Close & print** pushes the **written moment**: `ClosureBody` with the ok ToneDisc, `Closure N
   written`, the three figure tiles, `✓ Printed` or the print error with **Print again**
   (`secondary`), **Done** (`intent`).
3. **Done** closes the panel. Only now does the cart column become the Open register card.
4. Checkout on an empty cart past closing time opens the panel directly on the count pane.

The cart column therefore shows only: the cart, **Open register**, **Pick register**, **No
register**, and the new **Counting elsewhere** card (another device is counting this register:
register name, who, since when, no action; sales resume when that count ends).

### 4.6 The confirm

One `AlertDialog`, four parameterisations. The confirm's button is the verb with the object on it;
cancel is the footer's cancel slot.

| Trigger | Title · description | Body | Confirm |
| --- | --- | --- | --- |
| Hand over (tile; a name in the sheet) | **Hand the till to X?** · The POS reloads as them. The drawer stays open on Front counter. | figure tiles **Your sales today** (`n sales · 3 h 20 m`) · **Drawer stays at** N (`opened 13:05`; `Register closed · last closure N` when closed); `Notice info` **Your n open carts and n unsent sales wait here for you.** | **Hand over to X** |
| Store row | **Switch to Y?** · The POS reloads in Y. Its register is closed / open since … | `RadioGroup`: **Take the drawer with you** (closes Front counter at expected and opens Y's register with it as the float; default) · **Leave it open here**. When Y's register is open on another till the radio is replaced by one line naming it and the only choice is to leave this drawer open. | **Switch to Y** |
| Register row | **Switch to Z?** · This device moves to Z. Front counter's drawer stays open for whoever is there. | `Notice info` with Z's state (Closed · last closure #41 · You'll open it with a float / Open since … · you join it). | **Switch to Z** |
| Sign out with an open register | **Front counter is still open at N. Close it first?** | `Notice info`: a till left open stays open for the next cashier; the closure records who closed it. | **Close register** (intent: opens the panel on the count pane) · **Sign out anyway** (secondary) |

Every switch and Sign out are disabled with a reason while a payment is in flight (terminal waiting,
redirect gateway open): `Finish the payment first`. Hand over is disabled while a count is in
progress: `Finish or abandon the count first`. Switch store and Someone else… are disabled offline:
`Needs the store to switch`. Hand over to a saved cashier works offline (§ 7).

**Take the drawer with you** is one act that writes two records: the closure with `reason:
'store_switch'` (today's closures are implicitly `end_of_day`; make the enum explicit) and the new
session with `float_source: 'carried'` and `carried_from_closure_id`. The closure pane and the
Closures room badge it **Carried to Y**; the new register's Float step reads `carried from UK Store`.
A blind cashier carries at the expected figure without seeing it, as a blind close does. Returning,
the confirm offers **Take the drawer back** (the same act in reverse).

### 4.7 The bar's pill

Unchanged in meaning; one pill, only when abnormal: Closed, Counting, Overdue, Offline · n sales to
send, No register, Choosing. **Counting elsewhere** reads Counting. A register closed on another
till flips to Closed at the next refresh with a `Notice` on the Open register card: `Front counter
was closed on another till at 17:41 by Demo Cashier`; a sale mid-capture lands on the next session.

### 4.8 Phone and platform

Under 640 every panel is a page and every push is a page push with the back arrow; the avatar sits
in the bar on both POS tabs and opens one sheet (#3018). Denomination tiles wrap to two rows. With
products on the right every register-family panel comes from the right beside the bell; one is open
at a time. The desktop title-bar strip hosts the avatar; no web links on desktop.

## 5. Slices, in order

Budgets are added production lines (tests, snapshots, strings, docs excluded).

1. **Offline session carry (prerequisite, ≤ 150).** Reproduce on dev-next with the network off:
   hand over to a saved cashier, observe the Open register card on a register the server holds
   open. Then: the device stores the bound register's open-session id and opener beside the
   register pointer (`use-register-binding`, `userDB`) whenever a session is adopted or opened; the
   Open register card and `useRegisterSession` read it when the store database has no session row,
   rendering the register as open (figures unknown until the refresh) rather than offering to open
   it. Unit tests for both reads.
2. **The cashier sheet (≤ 450).** § 4.3, `usePanelSide('cart')`, the deleted store sheet, the bar's
   title opening the sheet, the CODING_STANDARDS overlay row, the ledger line for
   `pos/contexts/overlay-side` line 3 amended for the cashier.
3. **The confirm (≤ 400).** § 4.6 without the carry: hand over, switch register, switch store with
   "Leave it open here" only, Sign out with an open register. The payment-in-flight and count-in-
   progress guards.
4. **The register panel (≤ 450).** § 4.4: header, figure tiles, glyphs, the Derivation sub-line
   variant, the closure row pushing `ClosurePanel` (pushed mode from the Closures session), the
   lg intent's time suffix.
5. **The close in the panel (≤ 500).** § 4.5: the count pane and the written moment as pushes;
   the cart column loses its counting state and gains Counting elsewhere; Checkout-past-close
   opens the count pane; the closed-on-another-till Notice.
6. **Carry the drawer (≤ 350).** The `RadioGroup`, the two records, the badges, the Float step's
   note, the open-elsewhere guard, Take the drawer back.
7. **Follow-ups, each its own PR, not in this spec's budget:** the figure roll when a sale lands
   while the panel is open (filmed before it is reported); the owner-only web links if asked.

Slices 2–4 are independent of each other after 1; 5 depends on 4; 6 on 3 and 5.

## 6. Left to the builder

- Exact component for the register disc and the ToneDisc sizes; the sub-line variant's API on the
  Derivation component.
- How the sheet scrolls to its Store band when opened from the bar's title (a ref and
  `scrollTo`, or the band first when opened that way).
- Where the count pane's state lives while pushed (the existing `register-count` hooks moved under
  the panel; the cart column's `startCounting` path becomes the panel's).
- The Counting-elsewhere card's copy and the refresh cadence that flips it.
- Test files: `user-sheet.test.tsx`, `register-panel.test.tsx`, `register-count.test.tsx`,
  `closure-sheet.test.tsx`, `switch-store-sheet.test.tsx` (deleted; carry its switching tests into
  the confirm's), `register-bar.test.tsx`, `open-register-card.test.tsx`, `use-register-binding`
  tests. A deleted test file needs the `Test-Removal:` trailer before the first push.

## 7. Open items

- The offline trap (§ 5.1) is inferred from `refresh.ts` and `use-register-binding.ts`, not yet
  reproduced. Slice 1 starts with the repro; if it does not reproduce, slice 1 shrinks to the
  cached opener for the sheet's drawer tile.
- `ClosurePanel`'s pushed mode and `ClosureBody` are the Closures session's; slice 4 waits for its
  PR or stubs the push against today's panel.
