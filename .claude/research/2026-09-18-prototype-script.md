# What the prototype's JavaScript says each element does

_Produced 2026-09-18 for [wcpos/roadmap#342](https://github.com/wcpos/roadmap/issues/342) (part of
[#282](https://github.com/wcpos/roadmap/issues/282)). Branch: `research/prototype-script`, cut from
`origin/next` at `aebda38456`. An **addendum** to the concordance
([#337](https://github.com/wcpos/roadmap/issues/337),
`origin/research/mockup-concordance:.claude/research/2026-09-18-mockup-concordance.md`) — same row
keys, one row per concordance row whose verdict was "behaviour differs" (26) or "no component,
new" (6)._

**Findings, not decisions.** Where the drawing states no focus story, this file asks Paul; it never
invents one.

## Sources, and how the script was read

- The prototype's script, extracted (not the 390 KB page):
  `awk '/<script/{f=1} f{print} /<\/script>/{f=0}' docs/prototypes/2026-09-12-language/pos-register/index.html`
  → **1,917 lines / 244,083 bytes**. Line 1 is `<script src="iconsets.js">` (glyph data, excluded by
  the ticket), line 2 opens the inline block, code starts at line 3. **Every `L<n>` below is a line
  of that extracted file**, and each is also pinned to a grep-able function name.
- The `<style>` block extracted the same way, read only for the numbers the script measures against
  (`.qx`, `.pane`, `.acts`, `.sidepanel`, `.frame[data-w]`, `.stamp`, reduced-motion).
- `pos-register/README.md` and `2026-09-12-language/README.md`, grepped for decision numbers.
- The library on `origin/next` in this worktree, only where a verdict could move:
  `packages/core/src/screens/main/pos/contexts/overlay-side/overlay-side.tsx`.
- The behaviour ledger `origin/research/component-ledger:.claude/research/2026-09-12-component-behaviour-ledger.md`.
  Citation convention is #337's: `dialog #8` = the eighth bullet of that section's ledger list.

**Not read:** the captures (the script answered every state question, so none was opened); the
`board-*.html` boards; `iconsets.js`; the reports and orders READMEs; the reports' `RP` print
templates and closure CSV paths; the whimsy themes' token blocks. **Nothing was run or measured** —
this is a source reading of a static page.

## At a glance

**Verdicts that change: 3.** All three are rows *outside* the 32, where the script shows behaviour
the concordance's sources could not see:

1. **Row `⋯` menu (orders)** — #337: *restyle only*. The `⋯` is rendered only in the desktop table
   (`cell()` `case 'actions'`, L1794); `renderRows()` (L1799–1808) has no `⋯` at all. Below desktop
   the row menu **disappears**, taking Reopen / Print receipt / Sync / Delete with it. → **behaviour
   differs.**
2. **Filter chips (orders + products)** — #337: *restyle only*. `render()` L829–831 runs a measured
   scroll-into-view on `.fbar` (scroll the active pill into view with a 24 px lead, or back to
   `offsetLeft − 16`) **and** a measured left-clamp on the open menu
   (`Math.max(16, Math.min(x, width − menuWidth − 8))`). Neither exists today. → **behaviour
   differs.**
3. **`.ledger` payments block** — #337: *behaviour differs*, treated as one drawing. `S.payList`
   (L73) still carries **six** drawings (`rows · tiles · bar · story · receipt · cards`) and
   `renderPaymentsList` renders all six; `bar` is the default and the comment says "decided
   2026-09-18", but the board lives on by URL. The row is a **settled default over an unresolved
   strip**, not a behaviour delta — the same shape `splitLook` had before the ring was picked.

**Ledger lines the script touches that #337 missed (7):**

| Ledger line | What the script does |
|---|---|
| `tabs` #1–#6 (centring) — **not touched after all** | The drawn strip is a plain `.scrollx` (`renderTabs`, L360). There is **no** centring, no re-centre on resize, no re-centre after a void. #337's "top ledger line at risk" #2 is the opposite of the truth: the centring machinery is simply unused by the drawing. |
| `tabs` #7 (stable testIDs for overflow-nav buttons) | The `.ov` count button (L357) is a new overflow-nav button, armed only at `open.length > 3`. |
| `dialog` #8 (side-panel autofocus after the slide, reduced-motion timer) | Implemented on **Reports only** (`renderReports` L1162: a new overlay focuses `#recount-reason` or its first `button,input,select`). The register's five side panels autofocus nothing. |
| `input` #1, #2 (50 ms delayed autofocus, mount-only) | Nowhere on the register. `renderProducts` L232 paints `class="in ring"` for four scenes; `renderLine` L366 paints `class="ed ring"`. **`ring` is a CSS class, not focus** — the whole page has no `.focus()` call except L928. |
| `input` #4 (restore focus after clearing) | L928 is its one appearance: the counted-amount field re-focuses itself and restores `selectionStart` after every keystroke, because `render()` (L822) replaces `frame.innerHTML` wholesale. Any field the drawing gains needs this. |
| `select` #1–#3 (pointer type captured at `pointerdown`, stale touch state cleared) | The cart-line swipe listens on `pointerdown` (L929) on a subtree that also takes `click` (L839); the collision is handled by an `S.dragged` latch that swallows the next click for **250 ms** (L935–936, L844). This is the iPad double-toggle problem in a second place. |
| `virtualized-list` #7, #8 (end-reached suppression on zero-sized containers, recheck on resize) | The exiting `.pane` is kept in the DOM for 320 ms with `z-index:0`/`1` and a `translateX(-24%)` (L835) — a live, laid-out, invisible list. Confirmed, not merely inferred. |

**Focus stories the drawing leaves unspecified: 20 of the 32 rows.** The page states a focus story
in two places and nowhere else: the register's notes strip (`renderNotes`, **L792**) carries a map
of six scenes → one sentence each (`open`, `added`, `line-edit`, `tender`, `closed`, `counting`) and
**`'—'` for the other 21 of the 27 `SCENES` (L110–113)**; the orders notes strip (L1868) states one,
split by pointer. Of the six register sentences, **two are contradicted by the code** and **two are
not implemented at all** (see the delta list).

### The three findings that most change the plan

1. **The drawing has almost no focus model, and the one it states does not match its code.** L792
   says `line-edit` is "the name field; Tab moves to price, **Enter saves, Esc cancels**". L943 is
   `if (S.edit!=null && (e.key==='Enter'||e.key==='Escape')){ S.edit=null; render(); }` — Enter and
   Esc are **the same branch**: nothing is saved, nothing is cancelled, and nothing was ever
   focused. L792 also says `open` focuses the search field and "the scanner is captured anywhere" —
   there is **no scanner capture in the file** (the only `scan` is an icon button with no handler,
   L247). The direction's rule that "a component with no focus story is unfinished" applies to 20 of
   these 32 rows, and Reports is the only screen that models focus at all.
2. **Three headline gestures are drawn but not wired, and one wired gesture has no element.** The
   column-resize handle `.rz` is a 1 px CSS bar with `cursor:col-resize` and **no handler**; `S.cols`
   does not exist (decision 34 specifies it). The `.divider` between the columns is a bare
   `<div title="Drag to resize">` with **no handler** (L784–785). The products row's **450 ms
   press-and-hold** (decisions 34/35) is **not in the register page**: the row is `data-act="addLine"`
   only (L211), and the `− n +` popover the concordance attributed to it is the **cart line's**
   keypad (`qxHtml`, L364), opened by tapping the quantity. Conversely a **600 ms hold-to-void**
   handler is live (L450–452, comment *"hold to void: 600 ms of pressure is the confirmation"*) and
   **no element in the page carries `data-hold`** — two occurrences in the whole 390 KB file, both
   the handler. It is orphaned code from `board-void.html`.
3. **The drawing answers six of #337's 31 questions, from its own code.** Q13 panel side: by
   **subject** — `renderSide` puts cart settings / sale details / edit line on the **left**
   (L286, L304, L309, no `.right`) and products settings / notifications on the **right** (L270,
   L255); no `bottom` value exists at any width, the phone flips presentation in CSS instead. Q14
   takeover: at **every** width (`.ordlist{position:absolute;inset:0;z-index:25}`, no `data-w`
   rule). Q24 split ring: **SVG** (`circle.sl-arc`, `pathLength="360"`, L584). Q27 status
   tap-to-filter: **kept** (L1781 `data-act="filterStatus"`) — desktop only. Q28 pane rail:
   **stacked**, seven `.sec` blocks under the totals (`renderPane`, L1812–1828). Q29 Skia on
   reports: the chart and every donut are **inline SVG** (L1244, L1346), no canvas, no rAF.

---

## The addendum table

Rows are #337's keys, in #337's order. `L<n>` = the extracted script file.

### Primitives — controls

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.st` status dot + label (new) | `st()` L1176 (reports), inline `<span class="st ${kind}"><i></i>` in `renderProducts` L211/L213, `renderPaymentsList` L739, `renderBar` L328 | None above desktop orders: a `<span>`, not a control. On the orders desktop table it is wrapped in a `<button data-act="filterStatus">` (L1781) | **Unspecified** — not focusable in four of its five homes | Focusable only at `S.w==='desktop'` on orders; plain text in `renderRows` L1805 | `ok · warn · bad · info · neutral` + reports `status(kind,label)` | **unchanged** (no component, new). The dot+label needs *two* shapes: an inert mark and a filter control |
| `.stp` stepper / quantity → keypad (decision 36) | `qxHtml` L364, `qKeys` L363, acts `qopen`/`qclose`/`qinc`/`qdec`/`qkey` L864–868, placement `render()` L836, phone twin `renderSheet` L467 | Tap the quantity opens; tap again closes; `−`/`+` step; 1–9 and 0 type; `⌫`; `✓` closes. At `q<=1` the `−` becomes a **trash** and removing registers a **3,000 ms** undo (L866) | Keys work only above phone: `if (S.qx!=null && S.w!=='phone')` L942 — digits, Backspace, **Enter ≡ Esc (both just close)**. No element is focused; the panel is positioned, not focused | Above phone: a 144 px absolute panel (`.qx`, 3×48 grid) positioned `left = qtyBtn.left − col.left − 48 − (48−qtyBtn.width)/2` — it overhangs the cart's left edge **by construction**, at every cart width. On the phone `qopen` sets `S.sheet='qty'` (L864) → a bottom sheet with a `.stp` row, **and the keyboard does nothing** | open / closed; `S.qbuf` typed buffer capped at **3 digits**, leading zeros stripped, applied only when `>0` (L868); self-destructs if its line vanishes (L836) | **unchanged** (behaviour differs). #337's Q7 (flip side by width) is answered differently: the phone **changes presentation**, it does not flip side |

### Primitives — feedback

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.upstrip` free-plan strip (decision 43) | `renderUpgradeStrip` L800; mounted **outside `.body`** on all three screens (`render()` L822, `renderOrders` L1876, `renderReports` L1141); `dismissStrip` L878 | Tap ×; *See what Pro adds* and **Upgrade to Pro** are inert on the register, a toast on reports (`data-act="toast"`, L800) | **Unspecified** — the strip is removed from the DOM and focus is not redirected | `S.w==='phone'` drops the second sentence (L800) and `.more` is `display:none` (CSS L191). One string, not six | present / dismissed (`S.nostrip`, reset by a plan change, L851) | **unchanged**. #337's Q8 answered by the code: **above the rail, app-wide, one mount** |
| `.ndot` bell dot + notifications panel (decision 43) | `renderBell` L323 (inside `renderBar`), `renderNotifications` L253–267 | Tap the bell → `S.sheet='notif'` → a **right** `.sidewrap`. Tap the scrim or × closes. *Update now* is `data-set="upd" data-v="none"`; *Later* closes | **Unspecified**: no autofocus, no Esc (the register keydown L941 has no Escape for `S.sheet`), no focus return | The update copy is pointer/platform-worded: `S.w==='desktop'` → "Restart the app to finish", else "Opens the App Store" (L254) | dot only when `S.upd==='ready'` (L323); rows carry `unread` `.udot`; groups `New` / `Earlier` | **unchanged** |
| `.empty` centred block (decision 26/29) | Products L210/L230, cart L381, orders L1802–1803, reports `RS.empty` | Products and orders empties carry an **action** (`Clear filters` / `Clear it` / `Retry` + a docs link); the **cart** empty carries none (L381) | **Unspecified** — the action button is not focused | Same block at every width | four distinct copies: filters-match-nothing · searched-and-found-nothing · nothing-on-the-till · error-with-retry | **unchanged**. The drawing has **two shapes** (with and without an action), not one |
| skeleton rows / `.tile.sk` (decision 11) | Tiles L204, orders table L1778, orders rows L1801, reports L1141 (`<div class="skeleton">` × 7) | None — inert | **Unspecified**; no `aria-busy` on the register (reports has `aria-label="Loading reports"`, L1141) | Tiles on the grid, rows in both tables, bars on reports — all three exist | one: flat `var(--muted)`, **no shimmer** anywhere in the CSS | **unchanged**. Decision 11's "still skeletons, no shimmer" is fully drawn, including three variants #337 had only two of |
| `.stamp` PAID (decision 29, new) | `renderTender` L682 (`S.tx.stamp ? '<div class="stampwrap"><span class="stamp">PAID</span>' : '<span class="disc">✓</span>'`) | None — a one-shot beat | **Unspecified** (the Paid stage's focus is unspecified too) | none | on/off behind the `S.tx.stamp` "Touches" switch (L80, L164) — so the drawing keeps a **no-stamp** fallback | **unchanged** (no component, new). Two corrections: it is **`var(--destructive)` red**, 4 px border, `rotate(-8deg)`, `slam 380 ms cubic-bezier(.2,1.4,.4,1)`, `mix-blend-mode:multiply` (`screen` on the dark/ocean/sunset/monochrome themes), radial mask — and **reduce-motion is already covered** by a blanket `@media (prefers-reduced-motion: reduce)` rule that kills every register animation |

### Primitives — overlays

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.sidepanel` from the left (decision 46) | `renderSide` L268–322; `togglePop` L881, `closeSheet` L877 | Tap the scrim closes; `data-stop="1"` on the panel blocks it; × closes. `togglePop` is a **toggle**, so the trigger closes it too | **Unspecified**: no autofocus, no Esc, no focus return on the register — while Reports does all three (L1161–1163) | **400 px** (`min(100%,400px)`), `slidel`/`slide` 220 ms. At `[data-w="phone"]` the same panel becomes a bottom sheet (`align-items:flex-end`, `max-height:92%`, top radius, `rise` 200 ms) — a CSS presentation flip, **not** a side value | five panels: cart settings (left) · sale details + order foot (left) · edit line (left) · products settings (**right**) · notifications (**right**) | **unchanged**. #337's Q13 answered: **by subject**. Note the seam already exists in the app — `oppositeOverlaySide()` at `overlay-side.tsx:10`; only the input changes from `position` to the panel's subject |
| `.ordlist` open-orders takeover (decision 17, new composed) | `renderTabs` L357–360 | The count button toggles (`ordlist` L873); a row (`selOrder`) closes it and switches cart (L872); × closes; an outside click closes it (L844 lists `S.ordlist`) | **Unspecified** — and **Esc does not close it** | A takeover at **every** width: `position:absolute;inset:0;z-index:25` inside the cart column, `drop` animation, no `data-w` rule | armed only at **`open.length > 3`** (L357) — at 2 or 3 open sales there is no count button and no list. Rows: amount + customer over a status chip **or** `This cart` / `Started {age} ago` | **unchanged**. #337's Q14 answered: takeover everywhere. New: the `>3` arming threshold, and **no "Recently voided"** section in the drawing |
| `.gate` / `.gatecard` | `renderProducts` L199–202 (`notice` for `pick`/`closed`/offline, `gate` for `counting`) | None — the gate is an inert dimming layer with a sentence | **Stated but not implemented**: L792 says `closed` → "the float amount; Enter opens the register" and `counting` → "the counted amount; Enter closes and prints". The keydown handler returns before either (`if (!S.tender || S.view!=='keypad') return`, L947). The counted field does have real caret handling (L928) | none | Two different shapes, not one: a **`.notice` banner above the grid** for `pick` / `closed` / offline, and a **`.gate` dimming overlay with a centred sentence** for `counting`. Offline **overwrites** the session notice (L202) | **unchanged**. The dim-plus-message is drawn; the two shapes and the offline precedence are new detail |

### Primitives — lists and tables

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.thead` / `.th` / `.rz` frameless table (decisions 5, 20a, 22, 34) | `thead()` L215, `tfoot()` L216, orders `renderTable` L1763–1776 | The register table's header is **inert**. The orders table header carries a sort glyph on sortable columns (`OS.sort`) and a `.rz` on every column but `actions` | **Unspecified**; no keyboard path to a column | Register: only at `S.view2==='list' && !phone` (L206). Orders: only at `S.w==='desktop'` (L1874). `.rz` is `cursor:col-resize` — a **fine-pointer-only** affordance | `.sorted` on the sorted header; `.sk` skeleton rows; `.grp` day-group headers when `OS.listStyle==='grouped'` | **unchanged**, **scope changed**: `.rz` has **no handler** and `S.cols` does not exist. Decision 34's "resize by dragging the header edge, `S.cols` per view, a 44 px floor" is **drawn, not modelled** — it becomes a question, not a delta to copy |
| `.tr.rowbtn` row is the add button (decisions 34, 35) | `row()` L211, `vrows` L213, `addLine` L859 | **Tap only.** The whole row is `data-act="addLine"`; the `+` is a non-interactive `<span class="ibtn">` inside it, replaced by `<span class="cnt">` once in the cart. The variable row is `openVar` instead (slide mode) or a chevron that expands `vrows` in place | **Unspecified** — no keyboard add | Table path only above phone (L206); `S.vars==='slide'` vs inline `vh` rows decides whether the variable row drills in or expands (decision 38) | not-in-cart (`+`) / in-cart (count); variable (chevron / expanded) | **unchanged**, **delta shrunk**: **no press-and-hold, no swipe, no hover stepper** in the register page. The 450 ms hold and the swipe-to-add are board-4 idioms (README decisions 34/35), not the drawing |
| `.tile` + `.tcnt` + `.sold` + `.vbadge` (behaviour differs → new sub-parts) | `tile()` L227, `img()` L226, variable tiles L231 | Tap adds (`addLine`); the variable tile opens the variations pane (`openVar` → `S.slide='push'`) | **Unspecified** | `[data-w="phone"]` → 2 columns (CSS L157); tile side is the `--tile` token (56 / 64 / 80 by scale) | `.sold` only when `S.tx.badge` **and** the product is in the `STOCK` map (L227) — `.low` under 5; `.tcnt` only when `inCart(n)>0`; `.vbadge` chevron on the variable tile; `.sk` skeleton | **unchanged**. New: the badge is behind the same `S.tx` "Touches" switch as the stamp, so the drawing keeps a **no-badge** fallback |
| `.line` / `.lb` / `.acts` swipe / `.hov` / `.line.settle` (decisions 4 cut 2, 36) | `renderLine` L365–370; swipe `pointerdown` L929–939; `removeLine` L861; `undoLine` L862; `.acts` CSS | **Swipe target is the total cell only** (`.line .tot[data-tot]`, L930) and only when `S.edit==null`. `setPointerCapture`; `moved` at **>3 px**; drag clamped to `−(w+140)` where `w` is the **measured `.acts` width** (fallback 160); on release: `dx < −(w+80)` → `.going`, then a **170 ms** delay, then it clicks the strip's own `.del`; `dx < −w/2` → snap open; else snap shut. The following click is swallowed for **250 ms** (`S.dragged`) | **Stated and contradicted.** L792: "the name field; Tab moves to price, Enter saves, Esc cancels". L943: Enter and Esc are one branch that just clears `S.edit`. The edit inputs carry `class="ed ring"` — paint, not focus | **Desktop is a different gesture**: with `moved===false` and `S.w==='desktop'`, the click **toggles** the reveal (L936); below desktop a tap does nothing. Notes strip L791 states this as the pointer rule | default / `.reveal` (strip open) / `.drag` / `.going` (deleting) / `.settle` (add beat, cleared after **900 ms**, L859) / edit-in-place (`S.edit===i`) | **unchanged**, **numbers corrected**: the snap is **half the measured strip width** and the delete is **strip + 80 px**, not #337's "80 px snap, 240 px delete". And the strip has **two** buttons — `Edit` (opens the left panel) and `Remove` — so #337's Q17 is answered "the swipe, but it reveals Edit too", with `qdec` at 1 as a **second** removal path (L866), both registering the same 3,000 ms undo |
| `.orow` / `.op-orow` rows on tablet, table on desktop (decision 6) | `renderOrders` L1874 (`S.w==='desktop' ? renderTable() : renderRows()`), `renderRows` L1799–1808, `renderPane` L1811, `keydown` L1905–1912 | Table: the row opens the order; the status cell filters; the `⋯` opens the row menu (all three guarded against each other at L1888). Rows: the whole row is a `<button>` that opens the order — **no `⋯`, no status filter, no swipe** | **Stated and implemented, pointer-split** (L1868): desktop → "search on open; scanner input lands in search from anywhere; ↑↓ move the focused row"; touch → "**no field focused on open**". Implemented: `↑`/`↓` move `OS.focus` (clamped), `Enter` opens the focused row, `Esc` closes the pop/menu then the pane — and the whole block returns early below desktop (L1907) | The split key is **`S.w`**, checked in three separate places (the list choice L1874, the keyboard gate L1907, the focus ring L1743). On the phone the pane **replaces** the list (`phone&&OS.open?'':list`, L1875); on the tablet it sits beside it | loading (8 skeletons) / error + retry / empty / no-match / grouped by day / plain; row `sel` and `focus` | **unchanged**, **delta grown**: #337's Q18 answered (**width**, from the code), plus a whole keyboard model, plus two capabilities the touch rows lose |

### Primitives — navigation

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.rail` icon-only 56 px (decisions 2, 42, 43) | `renderRail` L179, `NAV` L171, `NAV_BOTTOM` L172, `navOn` L173, `nav()` L175, `SCN_OF` L174 | Tap navigates. `nav(screen)` switches screen and **restores that screen's own scene** from `SCN_OF` (L174: `register:'open', reports:'today', orders:'default'`) — each page keeps its state while you move between them | **Unspecified** — no keyboard nav, no roving tabindex | Not rendered at all on the phone (`S.w==='phone'?'':renderRail()`, L822 / L1876 / L1141); no other width or scale condition — **icon-only at every step**, answering #337's Q19 from the drawing. Labels ride `aria-label` + `title` only | `.on` + `aria-current="page"` on the active item; the bell is **absent** from `NAV_BOTTOM` with the comment *"Paul 2026-09-17: the bell moved to the cart bar"* | **unchanged** |
| `.tabbar` phone bottom bar | `renderPOS` L786–787 | Tap switches `S.phoneTab`. Adding a line force-switches to the cart (`S.phoneTab='cart'`, L859) | **Unspecified** | Phone only | badge only when `lines().length>0`; **the cart tab's label changes with session state** — `sessionOpen() ? 'Cart' : 'Register'` (L787) | **unchanged**, **delta grown**: the label swap is a second new behaviour beside the badge |
| `.bar` register bar (decision 42) | `renderBar` L324–336, `renderBell` L323 | The place name is inert; the drawer glyph opens the register panel; the bell opens the notifications panel; the avatar (phone) opens the user sheet | **Unspecified** | The **avatar and the hamburger are phone-only** (L336) — on tablet/desktop the bar is place · pill · offline · drawer · bell. `describeRegisterBar`'s place/pill priority is preserved as a literal if-chain (L327) | pills: `Choose register` · `Closed` · `Counting` · `Overdue · 18:00` · offline; the drawer glyph turns `var(--warn)` inline when `S.scn==='overdue'` (L329); the drawer button is **absent** unless `sessionOpen()` | **unchanged** |
| `.tabs` / `.otab` open-order strip (decision 17) | `renderTabs` L353–361, `tabHtml` L337–352, `.ordlist` L358 | Tap a tab switches; the count button opens the list; `+` is inert | **Unspecified** — no arrow keys, no centring, no focus | Format is a **hard width branch**: `S.w==='phone' ? 'line1' : 'lines2'` (L356). `tabsPos` defaults to **`'bottom'`** (L76) — the strip sits under the totals, not above the lines | `tabHtml` still carries **eight** styles (`line1 · amountcust · cust · chips · cards · numbered · edge · default`); only two are reachable. Tab chips: amount + dot (phone) or amount + customer over status/age | **unchanged**. Two corrections to #337: there is **no centring at all** (so `tabs` #1–#6 are unused, not at risk), and #337's Q20 is answered **width alone** — no *Tab shows* setting is wired (`S.tabStyle` is set at L77 and never read by `renderTabs`) |
| `.crumb` + `.pane` slide (decisions 32, 38, 39, 40, new) | `crumb()` L217, `crumbG()` L225, panes L223/L232, slide machinery `render()` L832–835, `openVar`/`popView` L897–898 | Tap the crumb's *Products* pops the view. No swipe-back, no Esc, no keyboard | **Unspecified** | **Two different slides by view**: the **grid** path crossfades (new pane `opacity:0`, old pane `.sout` with tiles staggered at **10 ms**, removed at **150 ms**, then the new tiles enter `.tin` staggered at **22 ms**); the **table** path slides (`enter-r`/`enter-l` + `over`/`under` z-index, CSS `transform 280 ms`, cleanup at **320 ms**, the exiting pane drifting `translateX(-24%)` to `opacity:.35`) | **three** directions, not two: `push` (drill in) · `pop` (crumb) · **`refill`** — used by every filter change (L884–894) to re-render the pane with **no slide at all** | **unchanged**. New: the `refill` third state, and the fact that the grid and the table drill in with different motion |

### Composed — cart, register and tender

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| `.custrow` one height by construction (decision 49) | `renderCart` L377–378; the checkout twin `renderLedger` L770–771 | Tap the customer chip (inert); `+` (inert); the sliders icon toggles the cart-settings panel | **Unspecified** | None; one height at every width by construction | The **order chip `#102476` is on the checkout side only** (`renderLedger` L770) — in the cart it is the word `Customer` under the default `voidStyle:'red'` (L377). Optional `.notechip` when `S.note==='chip'` (default is `'row'`). `position:relative`, hosting the `vmenu` popover | **unchanged** |
| Cart foot `⋯ \| Checkout` (decision 46) | `renderCart` L384–393, `orderBody` L433, `orderFoot` L442 | `⋯` toggles `S.pop='details'` → the **left** side panel, whose foot is `Void` (red, left) · `Print bill` · `Park this sale` (L442). Checkout → `S.xf=true; S.tender=true` (L921) | **Unspecified**; Esc does not close the panel | `⋯ + Checkout` at **every** width (L393), with one exception: `S.scn==='overdue' && !lines().length` replaces the whole foot with a single `Close the till` button (L392) | `⋯` and Checkout both `disabled` when the cart is empty; `.on` on `⋯` while the panel is open; the dead `pop` block at L394 (`false?…`) is the **rejected** anchored cart-settings popover | **unchanged**. #337's Q21 (is a bare glyph enough separation) — the drawing puts Void at the **far left of the panel foot**, opposite the primary, so it is two taps *and* a spatial separation |
| Print bill (decision 41, new) | `orderFoot` L442 | Rendered as the middle button of the order-sheet foot, `data-act="togglePop" data-pop="details"` — i.e. it **just closes the panel**. Nothing is wired | **Unspecified** | none | one | **unchanged** (no component, new). #337's Q23 is unanswered by the drawing: the button exists, the behaviour does not |
| `.methods` grid (rule 4) | `renderTender` L714–719 | Tap a tile selects (`method` L915); it becomes the plan's leg method when a `payPlan` exists | The tender keypad's Enter "takes the selected method" (L792, implemented L954) — but **how the keyboard selects a method is unspecified** | `.row` (one row) only when `nTiles` is **5 or 6 and `S.w!=='phone'`** (L718) — otherwise the fixed three-column grid. So it is not "five in one row on tablet", it is *five-or-six promotes to one row above phone* | `.on` on the selected tile; `.legacy` on the legacy tile; a `.dot` on terminal methods; a separate `.unav` line naming what is not available and why (L719) | **unchanged**, **condition made exact** |
| `.sl-ring` split ring (decision 50) | `splitAmountBlock` L564–602, `splitDrawingLegs` L554, `splitTileGlyph` L543, `animateSplitLook` L604 | Tap a leg seat/arc (`data-sl-leg`); `splitOpen` / `splitEven` / `splitMode` / `splitKey` / `splitAdd` / `splitRemove` / `splitDone` / `splitNone` / `splitClose` (L896–917) | **Implemented**: while `S.tender && S.split`, `Esc` cancels the split, `Enter` clicks `splitDone`, digits and Backspace drive `splitKey` (L945–950) — a dedicated branch **ahead of** the plain tender keypad | Phone shrinks the ring to 160 px (120 px when planned) and makes `.legs` a no-wrap scroller (CSS L394–397); `.splitgrid` becomes 2 columns | The ring is skipped entirely when `look==='ring' && !chooser && !payPlan && !pays.length` (L581) — it draws in only once a chooser is open or a plan/part payment exists, exactly as #337 read it. `animateSplitLook` (L604) replays the previous drawing's `width`/`stroke` so settlement still animates across a re-render | **unchanged**. #337's Q24 answered: **SVG**, `circle.sl-arc` with `pathLength="360"` and a 3° gap per arc (L584) |
| `.ledger` payments block (decision 51) | `renderLedger` L767–781, `renderPaymentsList` L730–766 | Tap nothing — the block is a read-out | **Unspecified** (it rides in the tender column) | Phone drops the ledger column entirely (`renderPOS` L784 returns the tender pane alone) | `S.payList` still renders **six drawings** (L73: `rows · tiles · bar · story · receipt · cards`; `bar` default, "decided 2026-09-18"), and `S.ledgerHead` **four** heads (`still` default · `customer` · `progress` · `facts`) | **changed → "not yet one drawing"**: a decided default over a live variant strip, so this row is a *drawing* question before it is a behaviour delta. On #337's Q25 the drawing is explicit about what it needs: a **time per payment** (`p.t`, faked from `S.payClock`) and, for cash, **`tendered … · change …`** (L740–741) |

### Composed — orders and reports

| Row (#337 key) | Script | Interaction model | Focus story | Width/scale/pointer conditions | States | Verdict after reading |
|---|---|---|---|---|---|---|
| Status as a dot + label column (decision 4) | `cell()` L1781; touch twin L1805 (`st(o.s)` inside the row button) | **Kept as a filter**: tapping the cell sets `OS.filters.status` and moves the scene to `filtered` (L1889). `openOrder` explicitly ignores clicks that land on it (L1888) | **Unspecified for the cell**; reachable only as part of the desktop row's Enter | **Desktop only.** Below desktop the status is inert text inside the row button, so **tap-to-filter is lost** | the `STATUS` map's kinds; `partially-refunded` is filtered out of the status menu (L1846) | **unchanged**. #337's Q27 answered **yes** — with a width condition #337 did not have |
| The open order as a pane beside the list (decision 7) | `renderPane` L1811–1830, `renderOrders` L1874–1875, `visible()` L1735 | Row opens; × or `closeOrder` closes; Esc closes (L1911); the pane's own `⋯` opens the row menu, re-anchored under the glyph after render (L1878–1879) | `Esc` closes — desktop only (L1907) | `visible()` drops every non-`CORE` column while the pane is open **at desktop** (L1735). On the phone the pane replaces the list | Foot is `Refund` (only for `completed`/`processing`/`on-hold`/`partially-refunded`) + `Print receipt` | **unchanged**. #337's Q28 answered: the rail content is **stacked** as seven `.sec` blocks — items, totals, refunds, customer note, customer + billing, payment, POS metadata |
| Till strip above the hero (decision 47, C3) | `tillStrip` L1312, `tillEvents` L1290, `cashLevel` (called L1330) | The X-report and the chevron into Closures are `data-act` buttons; a `Till: cash level \| chips` strip switch picks the picture | Inherits the reports story (focus restore L1161, Esc stack L1626, Enter on `tr[data-act]`) | Tablet moves the chips onto their own row (`grid-template-areas:"tl tr" "eq eq"`, CSS L617); the phone stacks the terms into a one-line-per-term ledger; `svg.lvl` is a 620 px step line that scales | **open** (float + cash sales + paid in − paid out − refunds = expected, repeated paid-outs folding into one chip with a count, no-sale/void becoming a note) vs **closed** (expected · counted · drawer result) | **unchanged** |
| Hero: amount, delta chip, date title (decision 47) | `hero` L1209–1228, `dateBtn` L1200, `scopeBtn` L1196, `deltaCls`/`deltaText`/`deltaAbs` L1205–1208 | The date title opens the picker; the scope chip opens the who/which menu; the print glyph opens the summary; the *n orders left out* chip resets the ticks | Reports story (above) | The delta chip **opens a comparison menu only when `RS.gran==='day'`** — at week/month/custom it is a static `<span>` (L1214–1216) | `deltaCls` is three-state with a **0.5 % dead band** → `flat` prints `0%`; comparison is `yesterday` (default) or `lastweek` (L1074) | **unchanged**. New: the granularity gate on the chip, and the dead band |
| Chart: `By hour \| Running total` (decision 47) | `chart` L1230–1272, `chartSeg` L1274, post-layout clamp `renderReports` L1144–1150 | Hover/tap a full-height transparent `<rect class="hit" data-i>` band per bucket → `RS.tip`. The `.segt` switches mode | Reports story; **no keyboard access to a bucket** | Phone: `W=340, H=170` vs `1090×210`; axis labels thin out (`every` = 1/2/7 by granularity and width); the busiest label and the comparison's closing figure are dropped on the phone (L1268, L1271). After render, bar widths are **clamped in device pixels** by measuring the SVG's rendered scale (`Math.min(old, 40/scale)`, L1146–1150) | bars mode (current bar at `fill-opacity:1` vs `.5`, a `future-bar` in `var(--muted)` for not-yet-past buckets of a live period, a `4 4` dashed comparison polyline, the peak labelled with its amount and order count) vs run mode (a filled area, a `2 4` dashed comparison, a thick segment + ring on the busiest step, the label flipping to `text-anchor:end` within 3 buckets of the end) | **unchanged**. #337's Q29 answered by the drawing: **inline SVG, no Skia, no canvas, no rAF** |
| Eight cards / the reports donut (decision 47, new) | `donut()` L1344–1346, `panel()` L1347, `reportRows` L1276, panels L1358–1372 | Each panel head is a button into the whole report (`data-act="detail"`); some panels carry their own `.segt` | Reports story | `.rp-panels` is a 3-column grid, collapsing by `data-w` (CSS L603) | The donut is **inline SVG**: `viewBox="0 0 120 120"`, `R=44`, `stroke-dasharray` arcs off a `2πR` circumference, the total and a `n ways` caption as `<text>` in the middle, and **`aria-hidden="true"`** — the rows beside it carry the data. Taxes and Refunds are proportional bars instead, deliberately (L1371) | **unchanged**. New, and it touches every reports row: on the free plan `renderReports` **pins the whole scope** — `RS.off=0; gran='day'; register='front'; store='uk'` (L1137) — so the date, the granularity, the register and the store are all inert without Pro |

---

## Delta list

### Verdicts that change (3) — all on #337 rows outside the 32

1. **Row `⋯` menu (orders)**: *restyle only* → **behaviour differs**. Present only in `cell()`
   L1794 (desktop table); `renderRows` L1799–1808 has none. Ledger: `dropdown-menu` #1–#3 become
   width-conditional.
2. **Filter chips (orders + products)**: *restyle only* → **behaviour differs**. `render()`
   L829–831 adds a measured scroll-into-view for the active pill and a measured left-clamp for the
   open menu. Ledger: `select` #1–#3 plus new measurement behaviour with no ledger line at all.
3. **`.ledger` payments block**: *behaviour differs* → **not yet one drawing**. `S.payList` (L73)
   renders six alternatives; `bar` is the marked default. The row's first question is which drawing,
   not which behaviour.

### Newly-touched ledger lines (7)

- `tabs` #1, #2, #3, #5, #6 — **released, not at risk**: the drawn strip has no centring
  (`renderTabs` L360). #337's "top ledger line at risk #2" should be struck.
- `tabs` #7 (stable overflow-nav testIDs) — the new `.ov` count button, armed at `>3` (L357).
- `dialog` #8 (autofocus after the slide, reduced-motion timer) — implemented on Reports only
  (L1162); the register's five panels do not focus.
- `input` #1, #2 (50 ms delayed autofocus, mount-only) — not exercised anywhere on the register;
  `ring` is paint (L232, L366).
- `input` #4 (restore focus after clearing) — L928 is the drawing's only focus-preservation, forced
  by `render()` replacing `innerHTML` (L822).
- `select` #1–#3 (pointer captured at `pointerdown`) — the cart-line swipe shares a subtree with the
  click handler and needs the `S.dragged` 250 ms latch (L935–936, L844).
- `virtualized-list` #7, #8 — the exiting `.pane` stays laid out and invisible for 320 ms (L835).

### Questions for Paul: the 20 rows with no focus story

The direction rules that a component with no focus story is unfinished. These 20 of the 32 have
none, in the script or in either notes strip. One question, one line, grouped so it can be answered
in passes.

1. **The five register side panels** (`.sidepanel`: cart settings · sale details · edit line ·
   products settings · notifications) — Reports autofocuses a new overlay's first control, returns
   focus on close, and unwinds Esc in a stack (L1161–1163, L1626). Does the register do the same
   three things, or is a POS panel deliberately different?
2. **Esc on the register** — today it closes nothing except the tender, the split and the quantity
   keypad. Should Esc close the panels, the order sheet and the open-orders list too?
3. **`.ordlist`** — where does focus land when the takeover opens, and where does it return when a
   row is picked?
4. **`.crumb` / `.pane`** — does the crumb take focus on drill-in? Is there a Back key / swipe-back?
5. **`.thead` / `.rz`** — is there a keyboard path to resize a column, or is resize fine-pointer
   only? (And is `S.cols` still the model, given the drawing does not implement it?)
6. **`.tr.rowbtn` and `.tile`** — can a row or a tile be added from the keyboard? (The scanner
   story below may be the whole answer.)
7. **The scanner** — L792 says "the scanner is captured anywhere" on the register and L1868 says
   "scanner input lands in search from anywhere" on orders. **Neither is implemented.** Is the
   capture global to the app, per screen, or only while the search field holds focus?
8. **`.rail` / `.tabbar` / `.bar` / `.tabs`** — do the four navigation surfaces have a keyboard
   model (roving tabindex, arrow keys between tabs), or is Tab order enough?
9. **`.custrow` and the cart foot `⋯`** — where does focus go after the order sheet closes?
10. **`.upstrip`** — the strip is removed from the DOM on dismiss; where does focus go?
11. **`.empty`** — is the action button focused when a list empties?
12. **skeleton / `.tile.sk`** — the register's loading states have no `aria-busy`; reports has a
    label. Same treatment everywhere?
13. **`.stamp` and the Paid stage** — where does focus land on Paid, so that Enter means *New sale*?
14. **`.st` dot + label** — inert mark and filter control are two different components in the
    drawing. Is the filter form focusable at every width, or desktop-only as drawn?
15. **Print bill** — drawn, wired to nothing. Confirms #337's Q23 is still open.
16. **`.ledger`** — which of the six `payList` drawings is final, and does the block need a focus
    story of its own or does it ride the tender's?

### Contradictions to settle before anything is specced

- **`line-edit`**: the notes say "Enter saves, Esc cancels"; L943 makes them one branch that
  discards nothing and saves nothing. Which is the intent?
- **`added`**: the notes say "the quantity of the line just added; **Enter checks out**". No Enter
  binding exists outside the tender. Is Enter-checks-out real?
- **`closed` / `counting`**: the notes say Enter opens the register / closes and prints. Neither is
  bound (L947 returns first).
- **hold-to-void at 600 ms** (L450–452) is live code with **no element carrying `data-hold`** in the
  whole page. Dead, or a gesture that was meant to survive the ⋯ ruling?
- **press-and-hold to add at 450 ms** (README decisions 34/35) is **absent** from the register page.
  Is it in the language pass, or did it stay on board 4?
- **`.divider`** is drawn with `title="Drag to resize"` and no handler (L784–785), while
  `packages/components/src/panels/index.tsx` already resizes. Drawn-only, or did the drawing mean to
  keep the app's behaviour untouched?

## What the script does that no README decision records

Behaviour found only in code, with no decision number behind it.

1. **`S.dragged`, a 250 ms click-swallowing latch** (L844, L935–936) — "the click that follows a
   swipe must not close what the swipe opened". A real cross-gesture defect, solved in the drawing.
2. **Two removal paths, one undo window.** `removeLine` (L861) and `qdec` at quantity 1 (L866) both
   splice the line and both arm a **3,000 ms** `S.undoLine`. The void toast is a separate **4,000 ms**
   timer (L869). No decision states either number.
3. **The add beat's own clock**: `S.settle` is cleared **900 ms** after the add (L859) and
   `rollMoney` (L796) gives the totals and the Checkout button's money a **300 ms** nudge class —
   two timers where the code comment says "one 220 ms nudge".
4. **Line consolidation and insertion order**: `addLine` matches on name **plus variation** and
   increments, else `unshift`es to the **top** of the cart (L859), while cart settings offer
   *Newest at the bottom* as the default `sortCart` (L76). The two disagree.
5. **The measured filter bar** (L829–831): scroll-the-active-pill-into-view and clamp-the-menu, both
   post-layout. Nothing in the READMEs mentions either.
6. **The counted field's caret survival** (L928): re-focus + `setSelectionRange` after every
   keystroke, because the whole frame re-renders.
7. **A post-layout bar-width clamp on the reports chart** (L1144–1150): measure the SVG's rendered
   scale, shrink any bar wider than 40 device pixels.
8. **The free plan pins the reports scope** (L1137): date, granularity, register and store all
   forced. Drawn as a gate with no decision number.
9. **`nav()` keeps each screen's scene** (`SCN_OF`, L174) — moving between POS, Orders and Reports
   restores where you were, not a default.
10. **`.qx` self-destructs** (L836) if the line it points at has gone.
11. **Three panes' worth of dead alternatives left live**: `tabHtml` keeps eight tab styles with two
    reachable (L337–352), `renderPaymentsList` six, `splitAmountBlock` five looks, `renderCart`'s
    anchored cart-settings popover is `false?…` (L394). Useful as the record of what was rejected —
    dangerous as a spec source, because the defaults in `S` (L71–80) are the decisions.
12. **Reduced motion is already handled** for the whole register, by one blanket rule, and the
    split's breathing/tear/land animations sit inside a `no-preference` block. Rule 6 is satisfied
    by the drawing, not outstanding.
