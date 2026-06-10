// MIGRATION SHIM: coupon-recalculate.ts moved to @wcpos/order-math/internal.
// Re-exported here so existing imports keep working.
export type { RecalculateInput, RecalculateResult } from '@wcpos/order-math/internal';
export { recalculateCoupons } from '@wcpos/order-math/internal';
