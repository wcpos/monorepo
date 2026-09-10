# WCPOS Client

Domain language for the WCPOS client monorepo. Architecture vocabulary (module,
interface, seam, adapter, depth) follows the team's standing definitions.

## Language — Order Math

**Order math**:
The pure module (`@wcpos/order-math`) owning all client-side money calculation:
line/fee/shipping tax+totals, coupon engine, order totals, net payment.
_Avoid_: cart engine, totals service, calculator

**Settle**:
The one-pass pipeline (line items → coupon replay → percent fees → order totals)
that converts a cart snapshot into one atomic patch.
_Avoid_: recalculate-all, refresh totals

**SettlePatch**:
The atomic output of a settle — the exact order fields to persist in one write.

**Frozen regime**:
Mutation-time calculation: a line's taxes/totals are computed once at add/edit
and stored; later config or rate changes do not recompute them while no coupons
are applied.

**Settle regime**:
With active coupons, the settle recomputes line taxes from current rates with
coupon base = the POS price in `_woocommerce_pos_data`.

**CartConfig**:
The single immutable, constructor-built config object (rates, allRates,
calcTaxes, pricesIncludeTax, taxRoundAtSubtotal, dp, shippingTaxClass,
calcDiscountsSequentially). Assembled once, in the tax-rates provider.

**CouponContext**:
The prefetched plain-data coupon inputs (configs by code, product categories,
category parents) that cross the seam so the order math stays synchronous.

**Tombstone**:
A line marked for server-side deletion by nulling its key field (line_items:
product_id, fee_lines: name, shipping_lines: method_id, coupon_lines: code).
Tombstones flow through the settle untouched and never enter the math.

**EngineWarning**:
A fault surfaced as data in an order-math result (e.g. `malformed_pos_data`,
`unknown_tax_rate_id`) instead of a log call inside the math. Core has ONE sink
for them — `useReportEngineWarnings` in
`packages/core/src/screens/main/pos/contexts/order-engine-warnings` — called at
every engine call site in core, including settle. It logs the kind's error code
and raises the cart's totals banner; it never toasts.

**Quirk**:
A WooCommerce-parity behavior preserved deliberately, bug-for-bug, marked
`// QUIRK(parity)` in source with a pinning test.

**Net payment**:
Order total minus the absolute refunded amounts (`abs(amount ?? total)` per refund).

## Language — Sync demand

**Requirement**:
Component-declared demand expressed as data. The four kinds are targeted records,
search, orders browse, and product browse.

**Browse window**:
A bounded, seeded result window over the servable set: the orders browser or the
products browse window.

**Lane key**:
The engine-internal persisted identity of a demand lane. It is derived behind the
engine interface and surfaced read-only as `handle.queryKey`; callers never construct it.

**Represented**:
The extractor's verdict that a selector was fully expressed as wire dimensions, which
is the precondition for trusting coverage totals.

_Avoid_: queryKey grammar, descriptor string (in caller-facing documentation)

## Language — Logs

**Error code**:
A registry code (`SYNC104` style) from `error-registry.json`; a SPECIFIC code
exists iff the merchant response differs, and generic codes are the explicit
exception (see Generic code). Docs-linked, catalogue-backed, problems-only.
_Avoid_: legacy `ERROR_CODES` table (deprecated, dying)

**Event code**:
The stable engine identity an engine-written log row carries (`context.type`,
e.g. `engine.change-check-failed`). Non-engine rows may lack one — the UI falls
back to the persisted message, then the raw code. Support/AI-facing; surfaced
copyable in the row detail; never docs-linked.

**Description**:
The optional per-event one-sentence plain-language explanation in
`event-registry.json`, rendered only in a quiet row's expanded detail;
translated like event titles. In-app only.

**Generic code**:
A per-domain `…999` error code with honestly-unspecific catalogue copy, stamped
by boundaries when no specific merchant response differs.

**Registry debt**:
Every generic-code emission (`codeFallback: true`); a standing signal to mint a
specific code, never a resting state.

**Demotion clause**:
A warn/error row that needs no merchant response is mis-leveled — the remedy is
demoting the level, not minting a code.

**Kind filter**:
The Logs ledger's tappable LEVEL-pill filter: a strict display-kind match that
intersects the active preset chip; single-select, tap-again clears.

## Language — Fault counters

Several numbers across the health screens answer "how much is wrong /
outstanding". They use THREE definitions, and two of them contradict each other
on purpose: the same held open cart is unsent work and is not sync backlog.
Both answers are correct, because the questions differ. Unifying the numbers
would make both wrong. Every counter names the family it answers; a counter
whose name and exclusion rule disagree is the defect (#1561).

**Unsent work**:
The WHOLE mutation queue, no exclusions — pending, claimed, the rows held while
a cart is open, conflicts and dead letters alike. Answers _"is it safe to
reset?"_: a wipe destroys every one of them, so a row hidden from this count is
a sale nobody was warned about losing. Read by `countUnsentChanges` /
`subscribeToUnsentChanges`.
_Avoid_: pending changes, queue depth

**Sync backlog**:
The rows actively waiting on the NETWORK (`pending` or `claimed`), minus the
rows the engine holds by design while their cart is open, minus every terminal
row. Answers _"is sync healthy?"_: a deliberately-held row is not a fault, and a
terminal row waits on a human rather than on the store. Read as
`EngineMutationCounts.syncBacklog`.
_Avoid_: pending, unsent (that is Unsent work — a different number over the same queue)

**Needs a decision**:
The terminal rows awaiting a human: `conflicted` + `needs-revision` +
`rejected`. Answers _"what must someone act on?"_. Counted in two halves that
partition it, because the fixes differ — `needsDecisionUnresolved` (a 409:
changed on the server while a till was editing) and `needsDecisionRejected` (a
dead letter: permanently refused, nothing will retry it).
_Avoid_: conflicts (it includes the dead letters, which are not conflicts)

Two neighbouring numbers are NOT fault-counter families, and must never be
reconciled against one:

**Log volume**:
`eventsToday` / `errorsToday` — log rows written today, derived from the row
LEVEL. It counts what HAPPENED, not what is outstanding: a day with no errors
can still end with a full backlog, and a backlog cleared this morning still
leaves its errors in today's count.

**Transport error**:
`MetricsBucket.errors` — completed request attempts whose SETTLED verdict was a
failure. It counts network ATTEMPTS, not records: one queued record can produce
many, and a retried-then-acknowledged record leaves the queue having contributed
several.

## Language — Payments

Ruled 2026-08-28 on the payments-contract wayfinder map (wcpos/roadmap#97, ticket #102).

**Payment method**:
A gateway plus its POS configuration (enabled for POS, order, capture mode, defaults).
What the cashier picks and what reports and the filter group by. Every payment method
is backed by exactly one gateway.
_Avoid_: gateway (for this concept), tender (as a noun)

**Gateway**:
The WooCommerce integration object (`WC_Payment_Gateway`) and the Woo-side infrastructure
that comes with it — order-edit payment selection, refunds, the order's `payment_method`.
Cash and Card are gateways too (POS-registered, hidden from Woo's Payments page).

**Provider**:
The processor family an integration speaks to (`stripe`, `square`, `sumup`). One provider
may back several gateways; the app selects its driver by provider.

**Capture mode**:
How the money is taken for a payment. `manual` is the only Free mode; Pro registers the
rest. An open vocabulary: the app must understand any capture mode, and needs Pro only to
produce non-manual payments.

**Driver**:
The app-side harness module wrapping one provider's SDK. Ships in the public app,
disabled by default, switched on by the payment-method descriptor.

**Payment**:
One money event against an order — amount, method, status, provider references, receipt
fields. N per order; the order's paid state is derived from its payments.
_Avoid_: transaction (Woo's `_transaction_id` is a provider reference)

**Ledger**:
An order's payments and their refunds, in order.

**Split payment**:
An order paid by more than one payment — N ledger rows on the one WooCommerce order. There
are no parent or sub-orders (ruled 2026-09-02, wcpos/roadmap#103: a child order misreports
to Analytics and no Woo report exists to feed). Multiple cash payments are Free.

**Refund allocation**:
The part of a WooCommerce refund attributed to one payment row. A refund is still Woo's
refund child order; its allocations say which payments it reverses and by how much.

**Offline payment**:
A payment recorded on the device before the server knows of it, identified by a
client-minted id.

**Tendered / change**:
The cash pair. "Tender" is only ever this verb.

## Language — Extensibility

Ruled 2026-09-01 on the app-extensibility wayfinder map (wcpos/roadmap#120, ticket #121).

**Extension**:
A unit of functionality added to the POS app — a mini-app, a display page, or a driver
(later: add-on forms, layout components). Qualify as "POS extension" when ambiguous with
Woo extensions: a Woo extension (WordPress plugin) ships and registers one or more POS
extensions.
_Avoid_: plugin (for anything app-side), add-on (product-domain term — product add-ons)

**Plugin**:
A WordPress plugin, only — the free/Pro plugins and Woo extensions. Never an app-side unit.

**Delivery class**:
How an extension reaches the app. Three classes under one umbrella, each with its own
integration surface: **config** (declarative arrangement — layout, settings), **web**
(remotely-served pages — mini-apps, display pages), **native** (build-time modules switched
on by server descriptor — drivers). What they share is the envelope and the registration
idiom, not one contract.

**Mini-app**:
An interactive web-class extension rendered in the app's WebView, speaking the bridge and
granted capabilities. First instance: the printer wizard.

**Display page**:
The host page a customer display renders, served from the merchant's site: it consumes the
broadcast, holds zero capabilities (no privileged host calls, so a broken or malicious
template cannot reach the app or hardware — it still has ordinary browser abilities and
sees the broadcast data), and re-renders the active display template on every event.
Shares the envelope with the bridge, not the contract.

**Slot**:
A named UI insertion point in the app, identified by a dotted id (`pos.cart.block`).
Extensions register UI into slots. Woo SlotFill dialect, Shopify-style identity.
_Avoid_: target (Shopify's word for the same thing)

**Bridge**:
The versioned JSON postMessage channel between the host app and a mini-app:
request/response RPC with correlation ids, plus host-initiated events. Supersedes the
payment webview's ad-hoc messaging as the contract for new work.

**Envelope**:
The shared message structure on bridge and broadcast alike: protocol major version,
correlation id, namespaced action, payload.

**Handshake**:
The mandatory opening exchange on the bridge — the page posts `app.ready`, the host
replies `app.init` (locale, theme, platform, safe store subset, granted capabilities).
Nothing else flows before it.

**Capability**:
A named host function (`printers.scan`, `ui.toast`) granted per extension. The only path
from an extension to native functionality; hardware is always mediated by capabilities.

**Broadcast**:
The one-way, versioned, transport-agnostic stream of live cart/order events consumed by
display pages. Versioned from its first release — a user-customisable page makes it a
de facto public surface.

**Catalog**:
The host-fetched data list of available web-class extensions (id, title, URL, required
capabilities). Adding an entry whose capabilities the installed app already implements is
data, not an app release; a new capability still needs an app update.

**Driver**:
Consumed unchanged from Language — Payments: the native-class extension wrapping one
provider's SDK, disabled by default, switched on by the payment-method descriptor.

**Display template**:
A template document in the receipt mould that a display page renders against the order
snapshot: built-in or merchant-authored HTML with logicless placeholders, sections per
display state, and host-provided declarative behaviours; may opt into `<script>`.
_Avoid_: display page (that is the host, not the template)

**Display state**:
The state machine a display page exposes to templates: `idle`, `cart`, `payment`
(started / approved / declined / complete). Derived from the last broadcast snapshot.

**Signaling**:
The one-time exchange that lets two WebRTC peers (POS and display) find each other,
carried by the merchant's WordPress site as a mailbox; not the data path.

## Language — Cashiers & till

Ruled 2026-09-10 on the cashiers & till wayfinder map (wcpos/roadmap#202, tickets #207, #208,
#210, #209 and #211).

**Cashier**:
A WordPress user who holds, or has held, POS access, seen through the cashier resource. A
user whose access is revoked stays a cashier — inactive — because past sales and closures
name them. Distinct from a Customer: the same person may also be a customer, and a cashier
may be chosen as a sale's customer.
_Avoid_: staff, team member, employee, operator, user (for this concept)

**Cashier directory**:
The list of every current and former cashier that any POS user may read: id, display name,
avatar, active. Nobody is ever removed from it — a former cashier stays resolvable, because
orders and closures point at them.

**Cashier record**:
One cashier's full record — names, roles, effective POS capabilities, allowed stores and
registers, last access — readable by that cashier and by managers. The signed-in cashier's
own record is what the app gates its UI from.
_Avoid_: profile, account (for this concept)

**Register**:
The identity of one installed till — the workstation a session is opened on. The
left-hand menu item is "Register": it is keyed on this device's register, and the cashier
signs in inside it.
_Avoid_: till (prose synonym only, never in UI or code), station, device, terminal (that is
a card reader)

**Session**:
One register's opened-to-closed period: opened with a float, closed with a count. Keyed on
the register, never the cashier; several cashiers may ring on one session and every row
records who acted. States: `open` → `counting` → `closed`. UI verbs: "Open register" /
"Close register".
_Avoid_: shift (the time clock — clock in/out for payroll), cash tracking session, drawer shift

**Counting**:
The session state between "Close register" being pressed and the closure being written: no
sale may be tendered, the closer enters the counted totals, and the register may return to
`open` if the close is abandoned. A session is never `closed` without passing through it.
_Avoid_: closing (as a state name), pending close

**Opening float**:
The cash placed in the drawer when a session opens. Carries an expected value (suggested
from the previous close) and a counted value, so an opening variance exists.
_Avoid_: starting cash, opening balance

**Cash movement**:
A cash event inside a session that is not a sale, typed `paid_in`, `paid_out` or `no_sale`,
each with a reason. `paid_in` and `paid_out` carry a positive amount with the direction in
the type; `no_sale` carries a zero amount. A movement is never edited or deleted: a mistaken
one is **voided** by a new row that names it in `voided_by`, so the ledger only ever grows.
_Avoid_: drop, pickup (as types), adjustment, edit/delete (of a movement)

**No sale**:
The zero-amount, permissioned cash movement that opens the drawer without a sale.

**Expected**:
The cash the drawer should hold: the *counted* opening float + cash sales − cash refunds +
paid in − paid out. The opening variance is recorded on its own and never carries into the
closing variance — each compares a count against what was expected at that moment.

**Counted**:
The cash the closer declares, entered as one total; a denomination helper is a calculator
and its breakdown is never stored.
_Avoid_: actual

**Variance**:
Counted minus expected — over or short — recorded at open and at close.
_Avoid_: discrepancy, difference

**Closure**:
The immutable, numbered document written when a session closes. One per session, not per
day: a closure may span or subdivide a calendar day.
_Avoid_: end of day, Z-report (for the record — that is its print)

**X-report / Z-report**:
The two printed renderings: an X-report reads an open session without closing it; a
Z-report is the print of a closure. Today's Reports screen prints a date-range sales
summary under the name "Z-report"; that is a **range report**, not a Z-report, and it is
renamed when closures land.
_Avoid_: Z-report (for any date-range summary)

**Session on the sale**:
Which session a sale's money belongs to. Each payment row binds to the session open on the
register when it was tendered, so a deposit taken yesterday counts in yesterday's drawer
and the balance paid today in today's. The sale itself records the session it completed
in. Membership is only ever by the stamped session, never inferred from a time window or
from whichever session is open when the sale reaches the server.
_Avoid_: shift on the order, current session (for a late-arriving sale)

**Unsynced**:
A closure whose session still has sales or movements the server has not acknowledged —
the till was offline or a row is stuck. The close is never blocked by it: the closure
records how many and how much were unsynced, and shows as unsynced until every named row
has landed.
_Avoid_: pending, incomplete, provisional (as the state name)

**Late sale**:
A sale (or cash movement) that reaches the server after its session's closure has been
written. It stays in the session it was rung in and the closure is never edited: a
correction row against the closure carries the change, and the closure reads as recorded
plus its corrections.
_Avoid_: orphan sale, moved sale, re-closing

**Settled**:
A closure's figure after its corrections are applied, shown beside the figure as recorded.
The recorded figure never changes; the settled one is what the drawer finally held.
_Avoid_: adjusted, corrected (as the figure's name), final

**Cashier on the sale**:
The one cashier a sale is credited to — the person whose token the server authenticated at
the sale, stamped server-side as `_pos_user`. There is one identity on a sale: the token
always follows the person, so this is never "the account the till was logged in as" with
a separate person behind it.
_Avoid_: sold by, salesperson, operator, staff member

**Rung up by**:
The cashier who created the sale, stamped write-once as `_pos_user_created`. It never
changes, so a reassigned sale still shows who took it.
_Avoid_: created by (for this concept), original cashier

**Reassignment**:
Changing the cashier on the sale (and, by the same rule, its store) after the fact, to any
active cashier. Gated by the single capability `reassign_woocommerce_pos_sales` — held by
administrators and shop managers by default, not by cashiers — covering the self-claim as
well. Audited by "rung up by" and an order note. A reassignment **never reopens or amends a
closure**: the closure reads as at close; live reports read the current cashier on the sale.
_Avoid_: transfer, change server, edit cashier
