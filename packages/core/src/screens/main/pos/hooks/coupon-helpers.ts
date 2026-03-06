export interface CouponLineItem {
	product_id: number;
	quantity: number;
	price: number;
	subtotal: string;
	total: string;
	categories: { id: number }[];
	on_sale: boolean;
}

export interface CouponRestrictions {
	product_ids: number[];
	excluded_product_ids: number[];
	product_categories: number[];
	excluded_product_categories: number[];
	exclude_sale_items: boolean;
}

/**
 * Determines whether a product is on sale by comparing price to regular_price.
 * Handles null/undefined/NaN values safely (returns false when data is missing).
 */
export function isProductOnSale(
	product: { price?: string | null; regular_price?: string | null } | null | undefined
): boolean {
	if (!product || !product.price || !product.regular_price) return false;
	const price = parseFloat(product.price);
	const regularPrice = parseFloat(product.regular_price);
	if (isNaN(price) || isNaN(regularPrice) || regularPrice <= 0) return false;
	return price < regularPrice;
}

/**
 * Filters line items to those eligible for a given coupon based on its restrictions.
 * Mirrors the WooCommerce coupon product/category restriction logic.
 */
export function getEligibleItems(
	items: CouponLineItem[],
	restrictions: CouponRestrictions
): CouponLineItem[] {
	return items.filter((item) => {
		// Product ID inclusion filter
		if (
			restrictions.product_ids.length > 0 &&
			!restrictions.product_ids.includes(item.product_id)
		) {
			return false;
		}

		// Product ID exclusion filter
		if (restrictions.excluded_product_ids.includes(item.product_id)) {
			return false;
		}

		// Category inclusion filter
		if (restrictions.product_categories.length > 0) {
			const itemCategoryIds = item.categories.map((c) => c.id);
			if (!restrictions.product_categories.some((catId) => itemCategoryIds.includes(catId))) {
				return false;
			}
		}

		// Category exclusion filter
		if (restrictions.excluded_product_categories.length > 0) {
			const itemCategoryIds = item.categories.map((c) => c.id);
			if (
				restrictions.excluded_product_categories.some((catId) => itemCategoryIds.includes(catId))
			) {
				return false;
			}
		}

		// Exclude sale items
		if (restrictions.exclude_sale_items && item.on_sale) {
			return false;
		}

		return true;
	});
}

/**
 * Adjusts line item prices by subtracting per-item discounts from a prior coupon.
 * Used in sequential discount mode so the next coupon sees reduced prices.
 */
export function applyPerItemDiscountsToLineItems(
	items: CouponLineItem[],
	perItem: { product_id: number; discount: number }[]
): CouponLineItem[] {
	const nextItems = items.map((item) => ({ ...item }));

	for (const entry of perItem) {
		let remaining = entry.discount;
		if (remaining <= 0) continue;

		for (const item of nextItems) {
			if (item.product_id !== entry.product_id || item.quantity <= 0) continue;

			const lineTotal = item.price * item.quantity;
			if (lineTotal <= 0) continue;

			const lineDiscount = Math.min(lineTotal, remaining);
			item.price = Math.max(0, item.price - lineDiscount / item.quantity);
			remaining -= lineDiscount;

			if (remaining <= 0) break;
		}
	}

	return nextItems;
}
