// MIGRATION SHIM: coupon-helpers.ts moved to @wcpos/order-math/internal.
// Re-exported here so existing imports keep working.
export type { CouponLineItem, CouponRestrictions } from '@wcpos/order-math/internal';
export {
	isProductOnSale,
	getEligibleItems,
	enrichCategoriesWithAncestors,
	convertDiscountsToExTax,
	applyPerItemDiscountsToLineItems,
	computeDiscountedLineItems,
	calculateCouponDiscountTaxSplit,
} from '@wcpos/order-math/internal';
export { buildEnrichedProductCategories } from './coupon-helpers-rxdb';
