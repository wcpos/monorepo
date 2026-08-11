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
`unknown_tax_rate_id`) instead of a log call inside the math.

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
A registry code (`SYNC104` style) from `error-registry.json`; exists iff the
merchant response differs. Docs-linked, catalogue-backed, problems-only.
_Avoid_: legacy `ERROR_CODES` table (deprecated, dying)

**Event code**:
The stable engine identity every log row carries (`context.type`,
e.g. `engine.change-check-failed`). Support/AI-facing; surfaced copyable in the
row detail; never docs-linked.

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
