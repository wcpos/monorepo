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
