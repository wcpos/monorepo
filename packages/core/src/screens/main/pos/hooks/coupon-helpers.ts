import isEmpty from 'lodash/isEmpty';
import round from 'lodash/round';

import { calculateTaxes } from '../../hooks/utils/calculate-taxes';

import type { PerItemDiscount } from './coupon-discount';

export interface CouponLineItem {
	product_id: number;
	quantity: number;
	price: number;
	subtotal: string;
	total: string;
	categories: { id: number }[];
	on_sale: boolean;
	/** Stable index into the source line-items array for per-line matching */
	lineIndex?: number;
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
 * Determines whether a POS line item is "on sale" by comparing price to
 * regular_price in the _woocommerce_pos_data meta.
 *
 * This mirrors the server-side check in Orders.php::is_pos_discounted_item_on_sale().
 * Must be used instead of isProductOnSale() when building CouponLineItems,
 * because the cashier may have changed the price in the cart.
 */
export function isLineItemOnSale(
	item: { meta_data?: { key?: string; value?: string }[] } | null | undefined
): boolean {
	if (!item?.meta_data) return false;
	const meta = item.meta_data.find((m) => m.key === '_woocommerce_pos_data');
	if (!meta?.value) return false;
	try {
		const posData = JSON.parse(meta.value);
		if (posData.price == null || posData.regular_price == null) return false;
		const price = parseFloat(posData.price);
		const regularPrice = parseFloat(posData.regular_price);
		if (isNaN(price) || isNaN(regularPrice) || regularPrice <= 0) return false;
		return price < regularPrice;
	} catch {
		return false;
	}
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
 * Convert tax-inclusive per-item discounts to ex-tax amounts.
 *
 * When prices include tax, all coupon discounts (percent, fixed_cart, fixed_product)
 * are calculated on tax-inclusive prices and must be converted to ex-tax.
 * This mirrors WC's set_coupon_discount_amounts() which extracts tax from
 * every discount type using WC_Tax::calc_tax().
 *
 * Each item's discount is divided by (1 + effective_tax_rate), where the rate
 * is derived from the order line item's subtotal_tax / subtotal.
 */
export function convertDiscountsToExTax(
	perItem: PerItemDiscount[],
	lineItems: { product_id?: number | null; subtotal?: string; subtotal_tax?: string }[],
	discountType: string,
	pricesIncludeTax: boolean
): PerItemDiscount[] {
	if (!pricesIncludeTax) return perItem;

	return perItem.map((entry) => {
		if (entry.discount <= 0) return entry;
		const li =
			entry.lineIndex != null
				? lineItems[entry.lineIndex]
				: lineItems.find((item) => item.product_id === entry.product_id);
		const subtotal = parseFloat(li?.subtotal || '0');
		const subtotalTax = parseFloat(li?.subtotal_tax || '0');
		const rate = subtotal > 0 ? subtotalTax / subtotal : 0;
		if (rate <= 0) return entry;
		return { ...entry, discount: round(entry.discount / (1 + rate), 6) };
	});
}

/**
 * Adjusts line item prices by subtracting per-item discounts from a prior coupon.
 * Used in sequential discount mode so the next coupon sees reduced prices.
 *
 * Discounts must be ex-tax (use convertDiscountsToExTax first when pricesIncludeTax).
 */
export function applyPerItemDiscountsToLineItems(
	items: CouponLineItem[],
	perItem: { product_id: number; discount: number }[]
): CouponLineItem[] {
	const nextItems = items.map((item) => ({ ...item }));

	for (const entry of perItem) {
		const remaining = entry.discount;
		if (remaining <= 0) continue;

		let left = remaining;
		for (const item of nextItems) {
			if (item.product_id !== entry.product_id || item.quantity <= 0) continue;

			const lineTotal = item.price * item.quantity;
			if (lineTotal <= 0) continue;

			const lineDiscount = Math.min(lineTotal, left);
			item.price = Math.max(0, item.price - lineDiscount / item.quantity);
			left -= lineDiscount;

			if (left <= 0) break;
		}
	}

	return nextItems;
}

/**
 * Apply coupon per-item discounts to order line items.
 * Reduces each line item's total, total_tax, and per-rate taxes
 * while keeping subtotal/subtotal_tax unchanged.
 *
 * Discounts must be ex-tax (use convertDiscountsToExTax first when pricesIncludeTax).
 * Line items should have pre-coupon totals before calling this.
 */
export function computeDiscountedLineItems<
	T extends {
		product_id?: number | null;
		total?: string;
		total_tax?: string;
		taxes?: { id?: number; subtotal?: string; total?: string; [key: string]: any }[];
		[key: string]: any;
	},
>(lineItems: T[], allPerItemDiscounts: PerItemDiscount[][]): T[] {
	if (allPerItemDiscounts.length === 0) return lineItems;

	// Per-line discount map: lineIndex -> total discount
	const lineDiscountMap = new Map<number, number>();
	// Per-product discount map (fallback for entries without lineIndex): product_id -> total discount
	const productDiscountMap = new Map<number, number>();
	for (const perItemDiscounts of allPerItemDiscounts) {
		for (const { product_id, discount, lineIndex } of perItemDiscounts) {
			if (lineIndex != null) {
				lineDiscountMap.set(lineIndex, (lineDiscountMap.get(lineIndex) || 0) + discount);
			} else {
				productDiscountMap.set(product_id, (productDiscountMap.get(product_id) || 0) + discount);
			}
		}
	}

	if (lineDiscountMap.size === 0 && productDiscountMap.size === 0) return lineItems;

	// Sum totals per product_id for proportional distribution when multiple
	// line items share the same product_id (only needed for product_id-keyed discounts)
	const totalByProductId = new Map<number, number>();
	if (productDiscountMap.size > 0) {
		for (const item of lineItems) {
			const pid = item.product_id;
			if (pid == null || !productDiscountMap.has(pid)) continue;
			totalByProductId.set(pid, (totalByProductId.get(pid) || 0) + parseFloat(item.total || '0'));
		}
	}

	return lineItems.map((item, idx) => {
		// Sum discount from per-line map (if this index has one)
		let totalDiscountForItem = lineDiscountMap.get(idx) || 0;

		// Also add any product-level discount share
		const pid = item.product_id;
		if (pid != null && productDiscountMap.has(pid)) {
			const totalDiscountForProduct = productDiscountMap.get(pid)!;
			if (totalDiscountForProduct > 0) {
				const currentTotal = parseFloat(item.total || '0');
				const productTotal = totalByProductId.get(pid) || currentTotal;
				totalDiscountForItem += totalDiscountForProduct * (currentTotal / productTotal);
			}
		}

		if (totalDiscountForItem <= 0) return item;

		const currentTotal = parseFloat(item.total || '0');
		if (currentTotal <= 0) return item;

		const currentTotalTax = parseFloat(item.total_tax || '0');

		const newTotal = Math.max(0, currentTotal - totalDiscountForItem);
		const ratio = currentTotal > 0 ? newTotal / currentTotal : 0;
		const newTotalTax = currentTotalTax * ratio;

		const taxes = (item.taxes || []).map((tax) => ({
			...tax,
			total: String(round(parseFloat(tax.total || '0') * ratio, 6)),
		}));

		return {
			...item,
			total: String(round(newTotal, 6)),
			total_tax: String(round(newTotalTax, 6)),
			taxes,
		} as T;
	});
}

/**
 * Calculate the coupon_line discount and discount_tax split.
 *
 * Expects ex-tax discount amounts (use convertDiscountsToExTax first).
 * Tax is calculated per-item using each line item's tax class, then summed.
 */
export function calculateCouponDiscountTaxSplit(
	perItemDiscounts: PerItemDiscount[],
	lineItems: { product_id?: number | null; tax_class?: string }[],
	taxRates: { id: number; rate: string; compound: boolean; order: number; class?: string }[]
): { discount: string; discount_tax: string } {
	let totalDiscount = 0;
	let totalDiscountTax = 0;

	for (const entry of perItemDiscounts) {
		if (entry.discount <= 0) continue;

		const lineItem =
			entry.lineIndex != null
				? lineItems[entry.lineIndex]
				: lineItems.find((item) => item.product_id === entry.product_id);
		const taxClass = isEmpty(lineItem?.tax_class) ? 'standard' : lineItem!.tax_class!;
		const applicableRates = taxRates.filter((r) => r.class === taxClass);

		if (applicableRates.length > 0) {
			const taxResult = calculateTaxes({
				amount: entry.discount,
				rates: applicableRates as {
					id: number;
					rate: string;
					compound: boolean;
					order: number;
				}[],
				amountIncludesTax: false,
			});

			totalDiscount += entry.discount;
			totalDiscountTax += taxResult.total;
		} else {
			totalDiscount += entry.discount;
		}
	}

	return {
		discount: String(round(totalDiscount, 6)),
		discount_tax: String(round(totalDiscountTax, 6)),
	};
}
