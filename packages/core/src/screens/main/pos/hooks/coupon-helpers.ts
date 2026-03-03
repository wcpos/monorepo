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
