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
