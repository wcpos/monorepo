/**
 * WORKSPACE-INTERNAL. No semver guarantees; workspace consumers only.
 *
 * This is the surface packages/core still calls directly. The nine "MIGRATION
 * SHIM" re-exports that used to stand between them are gone — they translated
 * nothing, so the imports point here instead.
 *
 * The public index (`@wcpos/order-math`) is the settle pipeline. It IS now
 * live: `use-cart-settlement.ts` calls `settleCart`, `settleAggregate`,
 * `createCartConfig` and `snapshotFromOrderJSON` as the cart's single writer
 * (#1505, 2026-08-23). That cutover retired the coupon-replay and order-totals
 * consumers below.
 *
 * ── What is left, and why ────────────────────────────────────────────────────
 *
 * Three consumers stay by design:
 *
 *   - `pos/hooks/coupon-recalculate` — narrows these structural types to RxDB
 *     document types.
 *   - `pos/hooks/coupon-validation` — injects the clock.
 *   - `pos/hooks/calculate-order-totals` — a test seam; see its header.
 *
 * The rest are the per-line tax hooks — `use-calculate-line-item-tax-and-totals`
 * and its fee and shipping siblings — and those are NOT meant to stay. They are
 * a second implementation of the maths in `cart-line.ts`, which says as much in
 * its own header ("Port of calculateLineItemTaxesAndTotals"). Two copies of
 * WooCommerce's line-tax rounding is a live correctness liability: the
 * woocommerce-pos#1548 fix had to be applied to both, and the note explaining it
 * survives in only one. Retiring them onto the public `calculateCartLine` is the
 * remaining work, tracked separately from #1472.
 */
export * from './money/precision';
export * from './money/calculate-taxes';
export * from './money/sum-taxes';
export * from './lines/pos-data';
export * from './coupons/discount';
export * from './coupons/helpers';
export * from './coupons/recalculate';
export * from './coupons/validate';
export * from './order-totals';
