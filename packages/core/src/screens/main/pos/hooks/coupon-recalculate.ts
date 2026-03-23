import round from 'lodash/round';

import {
	calculateCouponDiscount,
	type CouponDiscountConfig,
	type PerItemDiscount,
} from './coupon-discount';
import {
	calculateCouponDiscountTaxSplit,
	computeDiscountedLineItems,
	convertDiscountsToExTax,
	type CouponLineItem,
	isLineItemOnSale,
} from './coupon-helpers';
import { parsePosData } from './utils';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

export interface RecalculateInput {
	lineItems: LineItem[];
	couponLines: CouponLine[];
	/** Map of coupon code (lowercase) -> coupon config from RxDB */
	couponConfigs: Map<string, CouponDiscountConfig>;
	pricesIncludeTax: boolean;
	calcDiscountsSequentially: boolean;
	taxRates: { id: number; rate: string; compound: boolean; order: number; class?: string }[];
	/** Product categories by product_id for coupon restriction checks */
	productCategories: Map<number, { id: number }[]>;
}

export interface RecalculateResult {
	lineItems: LineItem[];
	couponLines: CouponLine[];
}

/**
 * Recalculate all coupon discounts from scratch, mirroring WooCommerce's
 * recalculate_coupons() in abstract-wc-order.php.
 *
 * Algorithm:
 * 1. Reset line item totals to subtotals (pre-coupon state)
 * 2. Build discount items using POS price as base (mirrors server subtotal filter)
 * 3. Apply each coupon in order against the base prices
 * 4. Update line item totals and coupon line discount amounts
 */
export function recalculateCoupons(input: RecalculateInput): RecalculateResult {
	const {
		lineItems,
		couponLines,
		couponConfigs,
		pricesIncludeTax,
		calcDiscountsSequentially,
		taxRates,
		productCategories,
	} = input;

	// Filter to active coupon lines (code is not null/undefined)
	const activeCouponLines = couponLines.filter(
		(cl): cl is CouponLine & { code: string } => cl.code != null
	);

	// Step 1: Reset — set total to POS price (mirrors server's filtered subtotal).
	// On the server, WC's recalculate_coupons() does $item->set_total($item->get_subtotal()),
	// but WCPOS filters get_subtotal() to return the POS price during recalculation.
	// The raw subtotal holds regular_price * qty; we need pos_data.price * qty instead.
	const resetItems = lineItems.map((item) => {
		const posData = parsePosData(item);

		if (posData?.price != null) {
			const qty = item.quantity ?? 1;
			const posTotal = parseFloat(posData.price) * qty;

			const subtotal = parseFloat(item.subtotal || '0');
			const subtotalTax = parseFloat(item.subtotal_tax || '0');

			let exTaxTotal: number;
			let taxTotal: number;

			if (pricesIncludeTax && subtotal > 0) {
				// POS price is tax-inclusive; derive tax using the ratio from subtotal
				const taxRatio = subtotalTax / (subtotal + subtotalTax);
				taxTotal = posTotal * taxRatio;
				exTaxTotal = posTotal - taxTotal;
			} else {
				exTaxTotal = posTotal;
				// Scale total_tax proportionally: (posTotal / subtotal) * subtotal_tax
				taxTotal =
					subtotal > 0 ? (posTotal / subtotal) * subtotalTax : parseFloat(item.total_tax || '0');
			}

			// Distribute per-rate taxes proportionally
			const taxes = (item.taxes || []).map((tax) => ({
				...tax,
				total:
					subtotalTax > 0
						? String(round(parseFloat(tax.subtotal || '0') * (taxTotal / subtotalTax), 6))
						: (tax.subtotal ?? tax.total),
			}));

			return {
				...item,
				total: String(round(exTaxTotal, 6)),
				total_tax: String(round(taxTotal, 6)),
				taxes,
			};
		}

		// No POS data — standard reset (total = subtotal)
		return {
			...item,
			total: item.subtotal,
			total_tax: item.subtotal_tax,
			taxes: (item.taxes || []).map((tax) => ({
				...tax,
				total: tax.subtotal ?? tax.total,
			})),
		};
	});

	// If no active coupons, return reset items
	if (activeCouponLines.length === 0) {
		return { lineItems: resetItems, couponLines };
	}

	// Step 2: Build CouponLineItems from POS price (the coupon base price)
	// This mirrors the server's subtotal filter in Orders.php which makes
	// get_subtotal() return pos_data.price during coupon recalculation.
	const buildCouponLineItems = (items: typeof resetItems): CouponLineItem[] =>
		items
			.filter((item) => item.product_id != null)
			.map((item) => {
				const qty = item.quantity ?? 1;
				const posData = parsePosData(item);

				let basePrice: number;
				if (posData?.price != null) {
					const posPrice = parseFloat(posData.price) * qty;
					// If prices include tax, POS price is already tax-inclusive
					// which matches WC's set_items_from_order: subtotal + subtotal_tax
					basePrice = posPrice;
				} else {
					const subtotal = parseFloat(item.subtotal || '0');
					const subtotalTax = parseFloat(item.subtotal_tax || '0');
					basePrice = pricesIncludeTax ? subtotal + subtotalTax : subtotal;
				}

				return {
					product_id: item.product_id!,
					quantity: qty,
					price: qty > 0 ? basePrice / qty : 0,
					subtotal: item.subtotal || '0',
					total: item.total || '0',
					categories: productCategories.get(item.product_id!) || [],
					on_sale: isLineItemOnSale(item),
				};
			});

	// Step 3: Apply each coupon in order
	const allPerItemDiscounts: PerItemDiscount[][] = [];
	let currentItems = buildCouponLineItems(resetItems);

	// Sort by price descending (WC behavior)
	currentItems.sort((a, b) => b.price - a.price);

	const updatedCouponLines = activeCouponLines.map((cl) => {
		const config = couponConfigs.get(cl.code.toLowerCase());
		if (!config) {
			return cl;
		}

		const discountResult = calculateCouponDiscount(config, currentItems);

		const exTaxPerItem = convertDiscountsToExTax(
			discountResult.perItem,
			resetItems,
			config.discount_type,
			pricesIncludeTax
		);

		allPerItemDiscounts.push(exTaxPerItem);

		// If sequential mode, reduce prices for next coupon
		if (calcDiscountsSequentially) {
			currentItems = currentItems.map((item) => {
				const discount = exTaxPerItem.find((d) => d.product_id === item.product_id);
				if (!discount || discount.discount <= 0) return item;
				const qty = item.quantity || 1;
				return {
					...item,
					price: Math.max(0, item.price - discount.discount / qty),
				};
			});
		}

		const { discount, discount_tax } = calculateCouponDiscountTaxSplit(
			exTaxPerItem,
			resetItems,
			taxRates
		);

		return { ...cl, discount, discount_tax };
	});

	// Step 4: Apply all discounts to line items
	const discountedLineItems = computeDiscountedLineItems(resetItems, allPerItemDiscounts);

	// Merge updated coupon lines back, preserving non-active ones
	const finalCouponLines = couponLines.map((cl) => {
		if (cl.code == null) return cl;
		const updated = updatedCouponLines.find(
			(u) => u.code?.toLowerCase() === cl.code?.toLowerCase()
		);
		return updated || cl;
	});

	return {
		lineItems: discountedLineItems,
		couponLines: finalCouponLines,
	};
}
