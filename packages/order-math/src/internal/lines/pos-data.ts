import toNumber from 'lodash/toNumber';

import { POS_META_KEYS } from '@wcpos/sync-core';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
export type CartLine = LineItem | FeeLine | ShippingLine;
type TaxStatus = 'taxable' | 'none';
type PosData = {
	price?: string | number;
	regular_price?: string | number;
	tax_status?: TaxStatus;
	tax_class?: string;
	amount?: string | number;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
	virtual?: boolean;
	downloadable?: boolean;
	categories?: { id: number; name: string; [key: string]: unknown }[];
	[key: string]: unknown;
};

const isPosData = (value: unknown): value is PosData =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Helper to coerce values to booleans.
 */
const toBoolean = (value: any): boolean => {
	// Interpret "true", "1" as true; "false", "0" as false
	if (typeof value === 'string') return value === 'true' || value === '1';
	return Boolean(value);
};

/**
 *
 */
export const sanitizePrice = (price?: string) => (price && price !== '' ? String(price) : '0');

/**
 * Get tax class from fee line meta data
 */
export const getMetaDataValueByKey = (metaData: CartLine['meta_data'], key: string) => {
	if (!Array.isArray(metaData)) {
		return;
	}
	const meta = metaData.find((m) => m.key === key);
	return meta ? meta.value : undefined;
};

/**
 * Retrieves the UUID from a line item's meta data.
 */
export const getUuidFromLineItemMetaData = (metaData: CartLine['meta_data']) => {
	if (!Array.isArray(metaData)) {
		return;
	}
	const uuidMeta = metaData.find((meta) => meta.key === POS_META_KEYS.lineUuid);
	return typeof uuidMeta?.value === 'string' ? uuidMeta.value : undefined;
};

/**
 * Retrieves the UUID from a line item's meta data.
 */
export const getUuidFromLineItem = (item: CartLine) => {
	return getUuidFromLineItemMetaData(item.meta_data);
};

/**
 * Implementation of updatePosDataMeta
 */
export function updatePosDataMeta<T extends CartLine>(
	item: T,
	newData: Record<string, unknown>
): T {
	const meta_data = item.meta_data ?? [];
	let posDataFound = false;

	const updatedMetaData = meta_data.map((meta) => {
		if (meta.key === POS_META_KEYS.posData) {
			const posData = parsePosData({ meta_data: [meta] }) ?? {};
			posDataFound = true;
			return {
				...meta,
				value: { ...posData, ...newData },
			};
		}
		return meta;
	});

	// If '_woocommerce_pos_data' was not found, add it to the metadata
	if (!posDataFound) {
		updatedMetaData.push({
			key: POS_META_KEYS.posData,
			value: newData,
		});
	}

	return {
		...item,
		meta_data: updatedMetaData, // Return the updated item with new metadata
	};
}

/**
 * Extract and parse POS metadata from the line item.
 * Structural parameter (meta_data only) so the engine's structural input
 * types (LineItemInput etc.) are accepted alongside DB document fragments.
 */
export const parsePosData = (item: { meta_data?: CartLine['meta_data'] }) => {
	const value = getMetaDataValueByKey(item.meta_data, POS_META_KEYS.posData);
	if (!value) {
		return null;
	}
	if (isPosData(value)) {
		return value;
	}
	if (typeof value !== 'string') {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(value);
		return isPosData(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

/**
 * Resolve a cart line's tax status.
 *
 * Product line items store their tax_status inside `_woocommerce_pos_data` meta
 * — the order schema has no top-level tax_status for line_items. Fee/shipping
 * lines may carry a top-level tax_status. We check top-level first, then
 * pos_data, defaulting to 'taxable' to match WooCommerce's
 * WC_Product::get_tax_status() (empty/invalid values are treated as taxable).
 */
export const getLineItemTaxStatus = (
	item: { tax_status?: string | null; meta_data?: CartLine['meta_data'] } | null | undefined
): 'taxable' | 'none' | 'shipping' => {
	const isValid = (value: unknown): value is 'taxable' | 'none' | 'shipping' =>
		value === 'taxable' || value === 'none' || value === 'shipping';

	const topLevel = item?.tax_status;
	if (isValid(topLevel)) {
		return topLevel;
	}

	// Guard before calling parsePosData: meta_data must be an array for type safety.
	const posData = Array.isArray(item?.meta_data) ? parsePosData(item as CartLine) : null;
	const fromPosData = posData?.tax_status;
	if (isValid(fromPosData)) {
		return fromPosData;
	}

	return 'taxable';
};

/**
 * Calculate price and regular price based on tax inclusion and quantity.
 */
/**
 * Derive per-unit price and regularPrice from stored line item totals.
 *
 * Note: After the subtotal parity change, subtotal = price * qty (not
 * regular_price * qty), so `regularPrice` here will equal `price` when
 * no coupons are applied. For POS items, `extractLineItemData` overrides
 * both values from `_woocommerce_pos_data` meta, which is the authoritative
 * source for per-unit prices.
 */
export const extractLineItemPrices = (item: LineItem, pricesIncludeTax: boolean) => {
	const quantity = item.quantity ?? 0;
	const total = toNumber(item.total ?? 0);
	const subtotal = toNumber(item.subtotal ?? 0);
	const totalTax = toNumber(item.total_tax ?? 0);
	const subtotalTax = toNumber(item.subtotal_tax ?? 0);

	const price = pricesIncludeTax ? (total + totalTax) / quantity : total / quantity;
	const regularPrice = pricesIncludeTax ? (subtotal + subtotalTax) / quantity : subtotal / quantity;

	return { price, regularPrice };
};

/**
 * Extracts line item data, considering metadata overrides.
 */
export const extractLineItemData = (item: LineItem, pricesIncludeTax: boolean) => {
	const { price: defaultPrice, regularPrice: defaultRegularPrice } = extractLineItemPrices(
		item,
		pricesIncludeTax
	);

	const {
		price = defaultPrice,
		regular_price = defaultRegularPrice,
		tax_status = 'taxable',
	} = parsePosData(item) || {};

	return { price: toNumber(price), regular_price: toNumber(regular_price), tax_status };
};

/**
 * Calculate default fee amount based on tax inclusion.
 */
export const calculateDefaultAmount = (
	item: FeeLine | ShippingLine,
	pricesIncludeTax: boolean
): number => {
	const total = toNumber(item.total ?? 0);
	const totalTax = toNumber(item.total_tax ?? 0);
	return pricesIncludeTax ? total + totalTax : total;
};

/**
 * Extracts fee line data with fallbacks for default values.
 */
export const extractFeeLineData = (item: FeeLine, pricesIncludeTax: boolean) => {
	const defaultAmount = calculateDefaultAmount(item, pricesIncludeTax);

	const {
		amount = defaultAmount,
		percent = false,
		prices_include_tax = pricesIncludeTax,
		percent_of_cart_total_with_tax = pricesIncludeTax,
	} = parsePosData(item) || {};

	return {
		amount: toNumber(amount),
		percent: toBoolean(percent),
		prices_include_tax: toBoolean(prices_include_tax),
		percent_of_cart_total_with_tax: toBoolean(percent_of_cart_total_with_tax),
	};
};

/**
 * Extracts shipping line data with fallbacks for default values.
 *
 * `tax_class` is the ONE field here that is not read from the line: it is always the
 * store-wide setting, and any `tax_class` in the line's `_woocommerce_pos_data` is
 * ignored. **WooCommerce has no per-line shipping tax class** — verified against
 * 11.0.1 and unchanged since 3.2.0:
 *
 * ```php
 * // WC_Order_Item_Shipping — no 'tax_class' in $extra_data, and no set_tax_class().
 * public function get_tax_class( $context = 'view' ) {
 *     return get_option( 'woocommerce_shipping_tax_class' );
 * }
 * ```
 *
 * and `WC_Abstract_Order::calculate_taxes()` force-feeds that same option to every
 * shipping line before the item calculates. The REST controller agrees:
 * `prepare_shipping_lines()` reads only `method_id`/`method_title`/`total`/`instance_id`,
 * so a `tax_class` sent on a shipping line is dropped and never persisted — there is no
 * `_tax_class` itemmeta row for a shipping item. (Fee and product lines DO carry their
 * own class; shipping is the exception.)
 *
 * Honouring a per-line class here is therefore a guaranteed money divergence: the till
 * taxes shipping at one class, the store recalculates at another, and the cashier gets a
 * totals-changed banner on an otherwise correct sale. Found on dev-pro order 99866, where
 * a line marked `reduced-rate` (a class whose only US rate is not shipping-eligible) took
 * £0 against the store's £0.50.
 *
 * The 'inherit' sentinel is still passed straight through, NOT collapsed to the standard
 * class: resolving it needs the order's line items, which only `computeShippingLine` has.
 */
export const extractShippingLineData = (
	item: ShippingLine,
	pricesIncludeTax: boolean,
	shippingTaxClass: string
) => {
	const defaultAmount = calculateDefaultAmount(item, pricesIncludeTax);
	const defaultTaxStatus: TaxStatus = 'taxable';

	const {
		amount = defaultAmount,
		tax_status = defaultTaxStatus,
		prices_include_tax = pricesIncludeTax,
	} = parsePosData(item) || {};

	return {
		amount: toNumber(amount),
		tax_status,
		tax_class: shippingTaxClass,
		prices_include_tax: toBoolean(prices_include_tax),
	};
};
