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
 * (#1505, 2026-08-23). That cutover retired the PRODUCTION coupon-replay and
 * order-totals consumers — `pos/hooks/calculate-order-totals` survives as a test
 * seam, see below.
 *
 * ── What still imports this, and why ─────────────────────────────────────────
 *
 * This is an inventory, not a to-do list. Only the last group is going away.
 *
 * Boundary adapters — permanent, they do real translation:
 *   - `pos/hooks/coupon-recalculate` — narrows these structural types to RxDB
 *     document types.
 *   - `pos/hooks/coupon-validation` — injects the clock.
 *   - `pos/hooks/calculate-order-totals` — test seam; see its header.
 *   - `pos/hooks/utils` — the POS utility barrel, deliberately permanent.
 *
 * Runtime paths that legitimately need the money primitives, and are NOT part of
 * any migration:
 *   - `hooks/use-tax-display-values` and `hooks/use-calculate-taxes-from-value`
 *     — product/tax display.
 *   - `orders/refund/calculate-refund` — refunds.
 *   - `pos/hooks/use-add-coupon`, `pos/hooks/use-recalculate-coupons`,
 *     `pos/hooks/coupon-rejection-message` — coupon application and its typed
 *     rejections.
 *
 * GONE — the per-line tax hooks. `use-calculate-line-item-tax-and-totals` and its
 * fee and shipping siblings were a SECOND implementation of the maths in
 * `cart-line.ts`; all three are deleted and their eight call sites go through the
 * public `calculateCartLine` (#1512, #1513, #1514). There is one copy of
 * WooCommerce's line-tax rounding now, and `cart-line.ts` says so in the headers
 * of each compute body. **Do not reintroduce a second one in `packages/core`** —
 * that duplication is what made the woocommerce-pos#1548 `toFixed(6)` fix need
 * applying twice, with the note explaining it surviving in only one copy.
 *
 * Their removal took `getRoundingPrecision` and `roundTaxTotal` out of
 * `packages/core` entirely. Both are still exported here and still used INSIDE
 * this package; `roundHalfUp` also keeps a core consumer in
 * `orders/refund/calculate-refund`.
 *
 * If you are here to delete exports: check the inventory above. Every group left
 * in it is permanent — nothing here is now waiting on a migration.
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
