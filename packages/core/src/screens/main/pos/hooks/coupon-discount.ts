import round from 'lodash/round';

import { getEligibleItems } from './coupon-helpers';

import type { CouponLineItem } from './coupon-helpers';

export interface CouponDiscountConfig {
	discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
	amount: string;
	limit_usage_to_x_items: number | null;
	product_ids: number[];
	excluded_product_ids: number[];
	product_categories: number[];
	excluded_product_categories: number[];
	exclude_sale_items: boolean;
}

export interface PerItemDiscount {
	product_id: number;
	discount: number;
	/** Stable index into the source line-items array for per-line matching */
	lineIndex?: number;
}

export interface DiscountResult {
	totalDiscount: number;
	perItem: PerItemDiscount[];
}

/**
 * Calculates coupon discount amounts for the three WooCommerce discount types:
 * - percent: percentage off each eligible item
 * - fixed_cart: fixed amount distributed proportionally across eligible items
 * - fixed_product: fixed amount per unit of each eligible item
 *
 * Reuses the eligibility filtering from coupon-helpers to stay consistent
 * with the validation layer.
 */
export function calculateCouponDiscount(
	config: CouponDiscountConfig,
	items: CouponLineItem[]
): DiscountResult {
	const amount = parseFloat(config.amount) || 0;
	if (amount === 0 || items.length === 0) {
		return { totalDiscount: 0, perItem: [] };
	}

	// WooCommerce: fixed_cart + exclude_sale_items rejects the entire coupon
	// when ANY sale item is in the cart. This must be enforced here (not only
	// in validateCoupon) because recalculation can run without re-validation
	// when cart items change after the coupon has been applied.
	if (
		config.discount_type === 'fixed_cart' &&
		config.exclude_sale_items &&
		items.some((item) => item.on_sale)
	) {
		return { totalDiscount: 0, perItem: [] };
	}

	const eligible = getEligibleItems(items, {
		product_ids: config.product_ids,
		excluded_product_ids: config.excluded_product_ids,
		product_categories: config.product_categories,
		excluded_product_categories: config.excluded_product_categories,
		exclude_sale_items: config.exclude_sale_items,
	});

	if (eligible.length === 0) {
		return { totalDiscount: 0, perItem: [] };
	}

	switch (config.discount_type) {
		case 'percent':
			return calculatePercentDiscount(amount, eligible, config.limit_usage_to_x_items);
		case 'fixed_cart':
			return calculateFixedCartDiscount(amount, eligible);
		case 'fixed_product':
			return calculateFixedProductDiscount(amount, eligible, config.limit_usage_to_x_items);
		default:
			return { totalDiscount: 0, perItem: [] };
	}
}

/**
 * Select the top N highest-priced units from the given items.
 * Expands each item into individual units, sorts by price descending,
 * takes the top N, and re-aggregates by item index (not product_id,
 * since multiple line items can share the same product_id).
 * Returns the original items unchanged when no limit applies.
 */
function selectTopPricedUnits(
	items: CouponLineItem[],
	limitToXItems: number | null
): CouponLineItem[] {
	if (limitToXItems === null || limitToXItems <= 0) {
		return items;
	}

	const expanded: { item: CouponLineItem; itemIndex: number }[] = [];
	items.forEach((item, itemIndex) => {
		for (let i = 0; i < item.quantity; i++) {
			expanded.push({ item, itemIndex });
		}
	});
	expanded.sort((a, b) => b.item.price - a.item.price);

	const quantityMap = new Map<number, number>();
	for (const { itemIndex } of expanded.slice(0, limitToXItems)) {
		quantityMap.set(itemIndex, (quantityMap.get(itemIndex) || 0) + 1);
	}

	return items.reduce<CouponLineItem[]>((acc, item, itemIndex) => {
		const qty = quantityMap.get(itemIndex);
		if (qty) acc.push({ ...item, quantity: qty });
		return acc;
	}, []);
}

/**
 * Percent discount: apply percentage to each eligible item's total.
 * When limit_usage_to_x_items is set, only the N highest-priced units
 * receive the discount (matching WooCommerce behavior).
 */
function calculatePercentDiscount(
	percent: number,
	items: CouponLineItem[],
	limitToXItems: number | null
): DiscountResult {
	const targetItems = selectTopPricedUnits(items, limitToXItems);

	const perItem: PerItemDiscount[] = [];
	let totalDiscount = 0;

	for (const item of targetItems) {
		const itemTotal = item.price * item.quantity;
		const discount = round(itemTotal * (percent / 100), 6);
		const cappedDiscount = Math.min(discount, itemTotal);
		perItem.push({
			product_id: item.product_id,
			discount: cappedDiscount,
			lineIndex: item.lineIndex,
		});
		totalDiscount += cappedDiscount;
	}

	return { totalDiscount: round(totalDiscount, 6), perItem };
}

/**
 * Fixed cart discount: distribute the fixed amount proportionally across
 * eligible items based on their share of the eligible cart total.
 * The last item receives the remainder to avoid rounding drift.
 */
function calculateFixedCartDiscount(amount: number, items: CouponLineItem[]): DiscountResult {
	const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
	if (cartTotal === 0) {
		return { totalDiscount: 0, perItem: [] };
	}

	const cappedAmount = Math.min(amount, cartTotal);
	const perItem: PerItemDiscount[] = [];
	let distributed = 0;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const itemTotal = item.price * item.quantity;

		if (i === items.length - 1) {
			// Last item gets the remainder to handle rounding residuals
			const discount = Math.max(0, round(cappedAmount - distributed, 6));
			const cappedDiscount = Math.min(discount, itemTotal);
			perItem.push({
				product_id: item.product_id,
				discount: cappedDiscount,
				lineIndex: item.lineIndex,
			});
			distributed += cappedDiscount;
		} else {
			const proportion = itemTotal / cartTotal;
			const discount = round(cappedAmount * proportion, 6);
			perItem.push({
				product_id: item.product_id,
				discount: Math.min(discount, itemTotal),
				lineIndex: item.lineIndex,
			});
			distributed += discount;
		}
	}

	return { totalDiscount: round(distributed, 6), perItem };
}

/**
 * Fixed product discount: apply a fixed amount per unit of each eligible item.
 * Per-unit discount is capped at the item's unit price so the total never goes negative.
 * When limit_usage_to_x_items is set, only the N highest-priced units receive the discount.
 */
function calculateFixedProductDiscount(
	amount: number,
	items: CouponLineItem[],
	limitToXItems: number | null
): DiscountResult {
	const targetItems = selectTopPricedUnits(items, limitToXItems);

	const perItem: PerItemDiscount[] = [];
	let totalDiscount = 0;

	for (const item of targetItems) {
		const perUnitDiscount = Math.min(amount, item.price);
		const discount = round(perUnitDiscount * item.quantity, 6);
		perItem.push({
			product_id: item.product_id,
			discount,
			lineIndex: item.lineIndex,
		});
		totalDiscount += discount;
	}

	return { totalDiscount: round(totalDiscount, 6), perItem };
}
