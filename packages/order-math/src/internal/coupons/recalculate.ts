import round from 'lodash/round';

import {
	calculateCouponDiscount,
	type CouponDiscountConfig,
	type PerItemDiscount,
} from './discount';
import {
	calculateCouponDiscountTaxSplit,
	computeDiscountedLineItems,
	type CouponLineItem,
} from './helpers';
import { calculateTaxes } from '../money/calculate-taxes';
import { getRoundingPrecision, roundHalfUp } from '../money/precision';
import { getLineItemTaxStatus, parsePosData } from '../lines/pos-data';
import { normalizeTaxClass } from '../tax-class';

import type { CouponLineInput as CouponLine, LineItemInput as LineItem } from '../../types';

export interface RecalculateInput {
	lineItems: LineItem[];
	couponLines: CouponLine[];
	/** Map of coupon code (lowercase) -> coupon config from RxDB */
	couponConfigs: Map<string, CouponDiscountConfig>;
	pricesIncludeTax: boolean;
	calcDiscountsSequentially: boolean;
	taxRates: {
		id: number;
		rate: string;
		compound: boolean;
		order: number;
		/** WooCommerce `tax_rate_priority` — decides compound sequencing (#1548). */
		priority?: number;
		class?: string;
	}[];
	/** Product categories by product_id for coupon restriction checks */
	productCategories: Map<number, { id: number }[]>;
	/** Whether to round tax at subtotal level (default false = round per-item) */
	taxRoundAtSubtotal?: boolean;
	/** Price decimal places (default 2) */
	dp?: number;
}

export interface RecalculateResult {
	lineItems: LineItem[];
	couponLines: CouponLine[];
}

/**
 * Round per-rate line taxes to the configured wire precision — ONCE, at the exit.
 *
 * Both halves matter and they pull against each other:
 *
 *  - WIDTH. These strings ship as `line_items[].taxes[]`. `String(n)` emits
 *    whatever the float prints — "0.0050015" (7dp) or "3.67647" (5dp) — and the
 *    divergence comparator forgives a one-microunit cross-engine tie only when
 *    BOTH sides were authored at exactly the store's rounding precision. A stray
 *    width turns a tie into a cashier-facing "your store changed this order's
 *    totals" banner on a correct sale (woocommerce-pos#1548).
 *
 *  - PRECISION. Rounding any EARLIER — in the reset below, or per rate as the
 *    coupon stage builds them — feeds already-rounded values into the next
 *    computation. That double rounding is the exact 1-microunit error this
 *    module was fixed to remove: a quantity-two compound line came out
 *    3.676470 against WooCommerce's 3.676471.
 *
 * Hence full precision all the way through, one half-up cut at the boundary.
 * Applied at BOTH exits — the no-coupon reset returns early.
 */
function serializeLineItemTaxes<T extends LineItem>(items: T[], roundingPrecision: number): T[] {
	return items.map((item) => {
		if (!Array.isArray(item.taxes)) return item;
		return {
			...item,
			taxes: item.taxes.map((tax) => {
				const widen = (value: unknown) => {
					const parsed =
						typeof value === 'number'
							? value
							: typeof value === 'string' && value.trim() !== ''
								? Number(value)
								: NaN;
					return Number.isFinite(parsed)
						? roundHalfUp(parsed, roundingPrecision).toFixed(roundingPrecision)
						: value;
				};
				return {
					...tax,
					...(tax.subtotal === '' || tax.subtotal == null ? {} : { subtotal: widen(tax.subtotal) }),
					...(tax.total == null ? {} : { total: widen(tax.total) }),
				};
			}),
		};
	});
}

/**
 * Determine whether a line item represents a POS-discounted (on sale) product
 * by comparing the POS price against the regular price in _woocommerce_pos_data.
 */
function isLineItemOnSale(item: LineItem | null | undefined): boolean {
	if (!item) return false;
	const posData = parsePosData(item);
	if (posData?.price == null || posData.regular_price == null) return false;
	const price = parseFloat(String(posData.price));
	const regularPrice = parseFloat(String(posData.regular_price));
	if (isNaN(price) || isNaN(regularPrice) || regularPrice <= 0) return false;
	return price < regularPrice;
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
		taxRoundAtSubtotal = false,
		dp = 2,
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

			// Non-taxable items (tax_status !== 'taxable') get no tax, matching WC.
			// For product line items tax_status lives in _woocommerce_pos_data, so
			// filtering by tax_class alone would wrongly tax a 'none' item that
			// happens to sit in the standard class — the very bug this guards against.
			const taxStatus = getLineItemTaxStatus(item);

			// Determine which tax rates apply to this item's tax class
			const normalizedClass = normalizeTaxClass(item.tax_class);
			const itemRates =
				taxStatus === 'taxable'
					? taxRates.filter((r) => normalizeTaxClass(r.class) === normalizedClass)
					: [];

			// Use calculateTaxes for exact WC-matching decomposition.
			// This replaces the ratio shortcut which diverged from WC on compound rates.
			const taxResult = calculateTaxes({
				amount: posTotal,
				rates: itemRates.map((r) => ({
					id: r.id,
					rate: r.rate,
					compound: r.compound,
					order: r.order,
					// WC sorts compound rates by tax_rate_priority (#1548) — must survive this map.
					priority: r.priority,
				})),
				amountIncludesTax: pricesIncludeTax,
				dp,
			});

			const taxTotal = taxResult.total;
			const exTaxTotal = pricesIncludeTax ? posTotal - taxTotal : posTotal;

			// Per-rate taxes from calculateTaxes (already decomposed correctly)
			const taxes = taxResult.taxes.map((tax) => {
				const origTax = (item.taxes || []).find((t) => t.id === tax.id);
				return {
					...(origTax || { id: tax.id }),
					subtotal: origTax?.subtotal ?? String(tax.total),
					total: String(tax.total),
				};
			});

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
		return {
			lineItems: serializeLineItemTaxes(resetItems, getRoundingPrecision(dp)),
			couponLines,
		};
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

		const discountResult = calculateCouponDiscount(config, currentItems, dp);

		// Cap each per-item discount by the remaining item value after
		// prior coupons. This prevents over-allocation when stacking
		// large-value coupons (e.g., fixed500cart + percent coupon).
		//
		// In sequential mode, currentItems prices are already reduced by prior
		// coupons, so item.price * item.quantity IS the remaining value — using
		// cumulativeDiscounts would double-count. In non-sequential mode, all
		// coupons see the original price, so we track cumulative discounts to cap.
		for (const entry of discountResult.perItem) {
			const idx = entry.lineIndex ?? -1;
			const item = currentItems.find((i) => i.lineIndex === idx);
			if (!item) continue;
			const itemTotal = item.price * item.quantity;
			let remaining: number;
			if (calcDiscountsSequentially) {
				// Prices already reduced — itemTotal is the true remaining value
				remaining = itemTotal;
			} else {
				const cumulative = cumulativeDiscounts.get(idx) || 0;
				remaining = Math.max(0, itemTotal - cumulative);
			}
			entry.discount = Math.min(entry.discount, remaining);
			if (!calcDiscountsSequentially) {
				const cumulative = cumulativeDiscounts.get(idx) || 0;
				cumulativeDiscounts.set(idx, cumulative + entry.discount);
			}
		}

		// Recalculate totalDiscount after capping
		discountResult.totalDiscount = discountResult.perItem.reduce((sum, e) => sum + e.discount, 0);

		// Convert inclusive discounts to ex-tax using calculateTaxes for exact
		// WC-matching compound rate decomposition (replaces ratio shortcut).
		const exTaxPerItem = pricesIncludeTax
			? discountResult.perItem.map((entry) => {
					if (entry.discount <= 0) return entry;
					const li =
						entry.lineIndex != null
							? resetItems[entry.lineIndex]
							: resetItems.find((item) => item.product_id === entry.product_id);
					if (!li) return entry;

					// Non-taxable items carry no embedded tax, so the inclusive
					// discount is already ex-tax — skip extraction.
					if (getLineItemTaxStatus(li) !== 'taxable') return entry;

					// Get the applicable tax rates for this item's tax class
					const itemTaxClass = normalizeTaxClass(li.tax_class);
					const itemRates = taxRates.filter((r) => normalizeTaxClass(r.class) === itemTaxClass);
					if (itemRates.length === 0) return entry;

					// Decompose the inclusive discount into tax + ex-tax using WC's algorithm
					const taxResult = calculateTaxes({
						amount: entry.discount,
						rates: itemRates.map((r) => ({
							id: r.id,
							rate: r.rate,
							compound: r.compound,
							order: r.order,
							// WC sorts compound rates by tax_rate_priority (#1548) — must survive this map.
							priority: r.priority,
						})),
						amountIncludesTax: true,
						dp,
					});
					const exTaxDiscount = entry.discount - taxResult.total;
					return { ...entry, discount: round(exTaxDiscount, 6) };
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

		const { discount, discount_tax } = calculateCouponDiscountTaxSplit(
			exTaxPerItem,
			resetItems,
			taxRates,
			{ pricesIncludeTax, taxRoundAtSubtotal, dp }
		);

		return { ...cl, discount, discount_tax };
	});

	// Step 4: Apply all discounts to line items
	const discountedLineItems = computeDiscountedLineItems(
		resetItems,
		allPerItemDiscounts,
		getRoundingPrecision(dp)
	);

	// Merge updated coupon lines back, preserving non-active ones
	const finalCouponLines = couponLines.map((cl) => {
		if (cl.code == null) return cl;
		const updated = updatedCouponLines.find(
			(u) => u.code?.toLowerCase() === cl.code?.toLowerCase()
		);
		return updated || cl;
	});

	return {
		lineItems: serializeLineItemTaxes(discountedLineItems, getRoundingPrecision(dp)),
		couponLines: finalCouponLines,
	};
}
