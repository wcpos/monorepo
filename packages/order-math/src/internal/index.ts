/**
 * WORKSPACE-INTERNAL. No semver guarantees; workspace consumers only.
 *
 * This is the surface packages/core actually calls. The nine "MIGRATION SHIM"
 * re-exports that used to stand between them are gone — they translated
 * nothing, so the imports now point here directly.
 *
 * The public index (`@wcpos/order-math`) is the settle pipeline —
 * `settleCart`, `createCartConfig`, `snapshotFromOrderJSON`. It has no callers
 * yet; cutting the cart over to it is #1472, and it is what will retire most
 * of the consumers below.
 *
 * Two boundary adapters remain by design, in packages/core: `coupon-recalculate`
 * (narrows these structural types to RxDB document types) and `coupon-validation`
 * (injects the clock). Both do real translation. A third module,
 * `pos/hooks/calculate-order-totals`, is a test seam — see its header.
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
