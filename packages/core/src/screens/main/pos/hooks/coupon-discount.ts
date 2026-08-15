// MIGRATION SHIM: coupon-discount.ts moved to @wcpos/order-math/internal.
// Re-exported here so existing imports keep working.
export type {
	CouponDiscountConfig,
	PerItemDiscount,
	DiscountResult,
} from '@wcpos/order-math/internal';
export { calculateCouponDiscount } from '@wcpos/order-math/internal';
