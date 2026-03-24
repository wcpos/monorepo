import {
	addNumberPrecision,
	removeNumberPrecision,
	roundDiscount,
} from '../../hooks/utils/precision';
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
 * All calculations use cent-precision math with Math.floor() and penny distribution
 * to match WooCommerce's WC_Discounts class exactly.
 *
 * @param dp - Price decimal places (wc_get_price_decimals), default 2
 */
export function calculateCouponDiscount(
	config: CouponDiscountConfig,
	items: CouponLineItem[],
	dp = 2
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
			return calculatePercentDiscount(amount, eligible, config.limit_usage_to_x_items, dp);
		case 'fixed_cart':
			return calculateFixedCartDiscount(amount, eligible, dp);
		case 'fixed_product':
			return calculateFixedProductDiscount(amount, eligible, config.limit_usage_to_x_items, dp);
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
 * WC: WC_Discounts::apply_coupon_percent
 *
 * Percentage discount: shift to cents, floor() per-item, then distribute remainder
 * 1 cent at a time to most-expensive items first.
 */
function calculatePercentDiscount(
	percent: number,
	items: CouponLineItem[],
	limitToXItems: number | null,
	dp: number
): DiscountResult {
	const targetItems = selectTopPricedUnits(items, limitToXItems);

	// Compute per-item discount in cents using floor
	const itemDiscountsCents: { item: CouponLineItem; discountCents: number; index: number }[] = [];
	let totalDiscountCents = 0;

	for (let i = 0; i < targetItems.length; i++) {
		const item = targetItems[i];
		const itemTotalCents = addNumberPrecision(item.price * item.quantity, dp);
		const discountCents = Math.floor(itemTotalCents * (percent / 100));
		// Cap at item total
		const cappedCents = Math.min(discountCents, itemTotalCents);
		itemDiscountsCents.push({ item, discountCents: cappedCents, index: i });
		totalDiscountCents += cappedCents;
	}

	// Calculate exact total discount and distribute remainder
	const exactTotalCents = targetItems.reduce((sum, item) => {
		const itemTotalCents = addNumberPrecision(item.price * item.quantity, dp);
		return sum + itemTotalCents * (percent / 100);
	}, 0);
	const expectedTotalCents = roundDiscount(exactTotalCents, 0);

	applyCouponRemainder(itemDiscountsCents, expectedTotalCents - totalDiscountCents, dp);

	// Convert back from cents
	const perItem: PerItemDiscount[] = [];
	let totalDiscount = 0;
	for (const { item, discountCents } of itemDiscountsCents) {
		const discount = removeNumberPrecision(discountCents, dp);
		perItem.push({ product_id: item.product_id, discount, lineIndex: item.lineIndex });
		totalDiscount += discount;
	}

	return { totalDiscount: roundDiscount(totalDiscount, dp), perItem };
}

/**
 * WC: WC_Discounts::apply_coupon_fixed_cart
 *
 * Fixed cart discount: floor(amountInCents / itemCount) per item,
 * then distribute remainder via applyCouponRemainder.
 */
function calculateFixedCartDiscount(
	amount: number,
	items: CouponLineItem[],
	dp: number
): DiscountResult {
	// WC filters out zero-price items before counting (apply_coupon_fixed_cart)
	const discountableItems = items.filter((item) => item.price > 0);
	if (discountableItems.length === 0) {
		return { totalDiscount: 0, perItem: [] };
	}

	const cartTotalCents = discountableItems.reduce(
		(sum, item) => sum + addNumberPrecision(item.price * item.quantity, dp),
		0
	);
	if (cartTotalCents === 0) {
		return { totalDiscount: 0, perItem: [] };
	}

	const amountCents = addNumberPrecision(
		Math.min(amount, removeNumberPrecision(cartTotalCents, dp)),
		dp
	);

	// Count total discountable units (WC: array_sum(wp_list_pluck($items_to_apply, 'quantity')))
	const totalItemCount = discountableItems.reduce((sum, item) => sum + item.quantity, 0);

	// Per-item discount = floor(amount in cents / total item count)
	const perItemCents = Math.floor(amountCents / totalItemCount);

	const itemDiscountsCents: { item: CouponLineItem; discountCents: number; index: number }[] = [];
	let totalDiscountCents = 0;

	for (let i = 0; i < discountableItems.length; i++) {
		const item = discountableItems[i];
		const itemTotalCents = addNumberPrecision(item.price * item.quantity, dp);
		const discountCents = Math.min(perItemCents * item.quantity, itemTotalCents);
		itemDiscountsCents.push({ item, discountCents, index: i });
		totalDiscountCents += discountCents;
	}

	// Distribute remainder
	applyCouponRemainder(itemDiscountsCents, amountCents - totalDiscountCents, dp);

	// Convert back from cents
	const perItem: PerItemDiscount[] = [];
	let totalDiscount = 0;
	for (const { item, discountCents } of itemDiscountsCents) {
		const discount = removeNumberPrecision(discountCents, dp);
		perItem.push({ product_id: item.product_id, discount, lineIndex: item.lineIndex });
		totalDiscount += discount;
	}

	return { totalDiscount: roundDiscount(totalDiscount, dp), perItem };
}

/**
 * WC: WC_Discounts::apply_coupon_fixed_product
 *
 * Fixed product discount: floor(perUnitInCents * qty) per line item,
 * then distribute remainder.
 */
function calculateFixedProductDiscount(
	amount: number,
	items: CouponLineItem[],
	limitToXItems: number | null,
	dp: number
): DiscountResult {
	const targetItems = selectTopPricedUnits(items, limitToXItems);

	const amountCents = addNumberPrecision(amount, dp);

	const itemDiscountsCents: { item: CouponLineItem; discountCents: number }[] = [];

	for (let i = 0; i < targetItems.length; i++) {
		const item = targetItems[i];
		const itemPriceCents = addNumberPrecision(item.price, dp);
		const perUnitCents = Math.min(amountCents, itemPriceCents);
		const discountCents = Math.floor(perUnitCents * item.quantity);
		itemDiscountsCents.push({ item, discountCents });
	}

	// Convert back from cents
	const perItem: PerItemDiscount[] = [];
	let totalDiscount = 0;
	for (const { item, discountCents } of itemDiscountsCents) {
		const discount = removeNumberPrecision(discountCents, dp);
		perItem.push({ product_id: item.product_id, discount, lineIndex: item.lineIndex });
		totalDiscount += discount;
	}

	return { totalDiscount: roundDiscount(totalDiscount, dp), perItem };
}

/**
 * WC: WC_Discounts::apply_coupon_remainder
 *
 * After floor(), total discount may be less than the intended amount.
 * Distribute the remainder 1 cent at a time to the most expensive items first.
 *
 * Items are sorted by price descending, then for each item we loop through
 * its quantity, adding 1 cent per unit until the remainder is exhausted.
 */
function applyCouponRemainder(
	itemDiscounts: { item: CouponLineItem; discountCents: number; index: number }[],
	remainderCents: number,
	dp: number
): void {
	if (remainderCents <= 0) return;

	// Sort by price descending (most expensive items get the penny first)
	const sorted = [...itemDiscounts].sort((a, b) => b.item.price - a.item.price);

	let remaining = remainderCents;

	for (const entry of sorted) {
		const itemPriceCents = addNumberPrecision(entry.item.price, dp);

		for (let unit = 0; unit < entry.item.quantity; unit++) {
			if (remaining <= 0) return;

			// Can this unit absorb 1 more cent? Check against item price
			const currentPerUnit = entry.discountCents / entry.item.quantity;
			if (currentPerUnit < itemPriceCents) {
				const addCent = Math.min(1, remaining);
				// Find the original entry and update it
				const original = itemDiscounts.find((d) => d.index === entry.index);
				if (original) {
					original.discountCents += addCent;
					remaining -= addCent;
				}
			}

			if (remaining <= 0) return;
		}
	}
}
