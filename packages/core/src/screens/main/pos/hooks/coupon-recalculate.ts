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
 * Determine whether a line item represents a POS-discounted (on sale) product
 * by comparing the POS price against the regular price in _woocommerce_pos_data.
 */
function isLineItemOnSale(
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
 * Recalculate all coupon discounts from scratch, mirroring WooCommerce's
 * recalculate_coupons() in abstract-wc-order.php.
 *
 * Algorithm:
 * 1. Reset line item totals to subtotals (pre-coupon state)
 * 2. Build discount items using POS price as base (mirrors server subtotal filter)
 * 3. Apply each coupon in order, capping by remaining item value
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

		const parsedPosPrice = posData?.price != null ? parseFloat(String(posData.price)) : NaN;
		if (Number.isFinite(parsedPosPrice)) {
			const qty = item.quantity ?? 1;
			const posTotal = parsedPosPrice * qty;

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

	// Step 2: Build CouponLineItems using tax-inclusive POS price as the coupon base.
	//
	// WC_Discounts::set_items_from_order() uses get_subtotal() + get_subtotal_tax()
	// (tax-inclusive) and calculates/caps discounts on the inclusive amount. The tax
	// portion is then extracted by set_coupon_discount_amounts() afterward.
	//
	// We mirror this: use inclusive prices here, and convertDiscountsToExTax handles
	// the tax extraction for ALL discount types.
	const buildCouponLineItems = (items: typeof resetItems): CouponLineItem[] =>
		items
			.map((item, lineIndex) => ({ item, lineIndex }))
			.filter(({ item }) => item.product_id != null)
			.map(({ item, lineIndex }) => {
				const qty = item.quantity ?? 1;
				const posData = parsePosData(item);

				// Use tax-inclusive POS price as the coupon base (matches WC)
				let basePrice: number;
				const posPriceParsed = posData?.price != null ? parseFloat(String(posData.price)) : NaN;
				if (Number.isFinite(posPriceParsed)) {
					basePrice = posPriceParsed * qty;
				} else {
					const subtotal = parseFloat(item.subtotal || '0');
					const subtotalTax = parseFloat(item.subtotal_tax || '0');
					basePrice = pricesIncludeTax ? subtotal + subtotalTax : subtotal;
				}

				return {
					lineIndex,
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

	// Track cumulative inclusive-price discounts per line item.
	// WC's WC_Discounts::get_discounted_price_in_cents() caps each coupon's
	// actual allocation by the remaining item value after prior coupons,
	// regardless of sequential mode.
	const cumulativeDiscounts = new Map<number, number>();

	const updatedCouponLines = activeCouponLines.map((cl) => {
		const config = couponConfigs.get(cl.code.toLowerCase());
		if (!config) {
			return {
				...cl,
				discount: '0',
				discount_tax: '0',
			};
		}

		const discountResult = calculateCouponDiscount(config, currentItems);

		// Cap each per-item discount by the remaining item value after
		// prior coupons. This prevents over-allocation when stacking
		// large-value coupons (e.g., fixed500cart + percent coupon).
		for (const entry of discountResult.perItem) {
			const idx = entry.lineIndex ?? -1;
			const item = currentItems.find((i) => i.lineIndex === idx);
			if (!item) continue;
			const itemTotal = item.price * item.quantity;
			const cumulative = cumulativeDiscounts.get(idx) || 0;
			const remaining = Math.max(0, itemTotal - cumulative);
			entry.discount = Math.min(entry.discount, remaining);
			cumulativeDiscounts.set(idx, cumulative + entry.discount);
		}

		// Recalculate totalDiscount after capping
		discountResult.totalDiscount = discountResult.perItem.reduce((sum, e) => sum + e.discount, 0);

		// Convert inclusive discounts to ex-tax. We always convert ALL types here
		// (including percent) because recalculateCoupons uses inclusive prices as
		// the coupon base. The shared convertDiscountsToExTax skips percent since
		// use-add-coupon already works with ex-tax prices — but we can't use that
		// shortcut here.
		const exTaxPerItem = pricesIncludeTax
			? discountResult.perItem.map((entry) => {
					if (entry.discount <= 0) return entry;
					const li =
						entry.lineIndex != null
							? resetItems[entry.lineIndex]
							: resetItems.find((item) => item.product_id === entry.product_id);
					const subtotal = parseFloat(li?.subtotal || '0');
					const subtotalTax = parseFloat(li?.subtotal_tax || '0');
					const rate = subtotal > 0 ? subtotalTax / subtotal : 0;
					if (rate <= 0) return entry;
					return { ...entry, discount: round(entry.discount / (1 + rate), 6) };
				})
			: discountResult.perItem;

		allPerItemDiscounts.push(exTaxPerItem);

		// In sequential mode, also reduce item prices so the next coupon's
		// discount *calculation* (not just allocation) uses the reduced price.
		if (calcDiscountsSequentially) {
			currentItems = currentItems.map((item) => {
				const discount =
					item.lineIndex != null
						? discountResult.perItem.find((d) => d.lineIndex === item.lineIndex)
						: discountResult.perItem.find((d) => d.product_id === item.product_id);
				if (!discount || discount.discount <= 0) return item;
				const qty = item.quantity || 1;
				return {
					...item,
					price: Math.max(0, item.price - discount.discount / qty),
				};
			});
		}

		const { discount } = calculateCouponDiscountTaxSplit(exTaxPerItem, resetItems, taxRates);

		// Keep discount_tax as '0' until client-side tax-line redistribution ships.
		// WooCommerce recalculates coupon tax on sync; writing it client-side without
		// updating order tax lines would cause inconsistent totals offline.
		return { ...cl, discount, discount_tax: '0' };
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
