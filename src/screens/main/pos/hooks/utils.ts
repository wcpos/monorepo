import toNumber from 'lodash/toNumber';

import log from '@wcpos/utils/src/logger';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type CartLine = LineItem | FeeLine | ShippingLine;
type TaxStatus = 'taxable' | 'none';

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
 * Retrieves the UUID from a line item's meta data.
 */
export const getUuidFromLineItemMetaData = (metaData: CartLine['meta_data']) => {
	if (!Array.isArray(metaData)) {
		log.error('metaData is not an array');
		return;
	}
	const uuidMeta = metaData.find((meta) => meta.key === '_woocommerce_pos_uuid');
	return uuidMeta ? uuidMeta.value : undefined;
};

/**
 * Get tax status from fee line meta data
 *
 * @TODO - default is 'taxable', is this correct?
 */
export const getTaxStatusFromMetaData = (metaData: CartLine['meta_data']) => {
	if (!Array.isArray(metaData)) {
		log.error('metaData is not an array');
		return;
	}
	const taxStatusMetaData = metaData.find((meta) => meta.key === '_woocommerce_pos_tax_status');
	return (taxStatusMetaData?.value ?? 'taxable') as 'taxable' | 'none' | 'shipping';
};

/**
 * Get tax class from fee line meta data
 */
export const getMetaDataValueByKey = (metaData: CartLine['meta_data'], key: string) => {
	if (!Array.isArray(metaData)) {
		log.error('metaData is not an array');
		return;
	}
	const meta = metaData.find((m) => m.key === key);
	return meta ? meta.value : undefined;
};

/**
 * Retrieves the UUID from a line item's meta data.
 */
export const getUuidFromLineItem = (item: CartLine) => {
	return getUuidFromLineItemMetaData(item.meta_data);
};

/**
 *
 */
export function findByMetaDataUUID(items: CartLine[], uuid: string): CartLine | null {
	const item = items.find(
		(item) =>
			Array.isArray(item.meta_data) &&
			item.meta_data.some((meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid)
	);
	return item || null;
}

/**
 * Counts the occurrences of a product variation in the order's line items.
 */
export const findByProductVariationID = (
	lineItems: LineItem[],
	productId: number,
	variationId = 0
) => {
	if (!Array.isArray(lineItems)) {
		log.error('lineItems is not an array');
		return;
	}
	const matchingItems = lineItems.filter(
		(item) => item.product_id === productId && (item.variation_id ?? 0) === variationId
	);

	return matchingItems;
};

/**
 *
 */
type CustomerJSON = import('@wcpos/database').CustomerDocumentType;
export const transformCustomerJSONToOrderJSON = (
	customer: CustomerJSON,
	defaultCountry: string
) => {
	return {
		customer_id: customer.id,
		billing: {
			...(customer.billing || {}),
			email: customer?.billing?.email || customer?.email,
			first_name: customer?.billing?.first_name || customer.first_name || customer?.username,
			last_name: customer?.billing?.last_name || customer?.last_name,
			country: customer?.billing?.country || defaultCountry,
		},
		shipping: customer.shipping || {},
	};
};

/**
 * Convert a product to the format expected by OrderDocument['line_items']
 */
type Product = import('@wcpos/database').ProductDocument;
export const convertProductToLineItemWithoutTax = (
	product: Product,
	metaDataKeys?: string[]
): LineItem => {
	const price = sanitizePrice(product.price);
	const regular_price = sanitizePrice(product.regular_price);
	const tax_status = product.tax_status || 'taxable'; // is this correct? default to 'taxable'?

	/**
	 * Transfer meta_data from product to line item, allowed keys are set in UI Settings
	 * - this allows users to choose which meta data to transfer, allowing all would be too much
	 */
	const meta_data = (product.meta_data || [])
		.filter((item) => item.key && (metaDataKeys || []).includes(item.key))
		.map(({ key, value }) => ({ key, value }));

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const new_meta_data = [...meta_data];

	new_meta_data.push({
		key: '_woocommerce_pos_data',
		value: JSON.stringify({ price, regular_price, tax_status }),
	});

	/**
	 * NOTE: uuid, price and totals will be added later in the process
	 */
	return {
		product_id: product.id,
		name: product.name,
		quantity: 1,
		sku: product.sku,
		tax_class: product.tax_class,
		meta_data: new_meta_data,
	};
};

/**
 * Convert a variation to the format expected by OrderDocument['line_items']
 */
type Variation = import('@wcpos/database').ProductVariationDocument;
type MetaData = {
	id?: number;
	key?: string;
	value?: string;
	display_key?: string;
	display_value?: string;
}[];
export const convertVariationToLineItemWithoutTax = (
	variation: Variation,
	parent: Product,
	metaData?: MetaData,
	metaDataKeys?: string[]
): LineItem => {
	const price = sanitizePrice(variation.price);
	const regular_price = sanitizePrice(variation.regular_price);
	const tax_status = variation.tax_status || 'taxable'; // is this correct? default to 'taxable'?
	let attributes = metaData;

	/**
	 * Get attributes from variation if not passed in
	 */
	if (!attributes) {
		attributes = (variation.attributes || []).map((attr) => ({
			key: attr.name,
			value: attr.option,
			attr_id: attr.id,
			display_key: attr.name,
			display_value: attr.option,
		}));
	}

	/**
	 * Transfer meta_data from product to line item, allowed keys are set in UI Settings
	 * - this allows users to choose which meta data to transfer, allowing all would be too much
	 */
	const meta_data = (variation.meta_data || [])
		.filter((item) => item.key && (metaDataKeys || []).includes(item.key))
		.map(({ key, value }) => ({ key, value }));

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const new_meta_data: MetaData = [...meta_data];

	new_meta_data.push({
		key: '_woocommerce_pos_data',
		value: JSON.stringify({ price, regular_price, tax_status }),
	});

	new_meta_data.push(...attributes);

	/**
	 * NOTE: uuid, price and totals will be added later in the process
	 */
	return {
		product_id: parent.id,
		name: parent.name,
		variation_id: variation.id,
		quantity: 1,
		sku: variation.sku,
		tax_class: variation.tax_class,
		meta_data: new_meta_data,
	};
};

/**
 * Implementation of updatePosDataMeta
 */
export function updatePosDataMeta(item: CartLine, newData: any): CartLine {
	const meta_data = item.meta_data ?? [];
	let posDataFound = false;

	const updatedMetaData = meta_data.map((meta) => {
		if (meta.key === '_woocommerce_pos_data') {
			const posData = meta.value ? JSON.parse(meta.value) : {};
			Object.assign(posData, newData); // Merge the existing data with new data
			posDataFound = true;
			return {
				...meta,
				value: JSON.stringify(posData), // Update the meta data value
			};
		}
		return meta;
	});

	// If '_woocommerce_pos_data' was not found, add it to the metadata
	if (!posDataFound) {
		updatedMetaData.push({
			key: '_woocommerce_pos_data',
			value: JSON.stringify(newData),
		});
	}

	return {
		...item,
		meta_data: updatedMetaData, // Return the updated item with new metadata
	};
}

/**
 * Extract and parse POS metadata from the line item.
 */
export const parsePosData = (item: CartLine) => {
	try {
		const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
		if (posData) {
			return JSON.parse(posData);
		}
	} catch (error) {
		log.error('Error parsing posData:', error);
	}
	return null;
};

/**
 * Calculate price and regular price based on tax inclusion and quantity.
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
 */
export const extractShippingLineData = (
	item: ShippingLine,
	pricesIncludeTax: boolean,
	shippingTaxClass: string
) => {
	const defaultAmount = calculateDefaultAmount(item, pricesIncludeTax);
	const defaultTaxClass = shippingTaxClass === 'inherit' ? '' : shippingTaxClass;
	const defaultTaxStatus: TaxStatus = 'taxable';

	const {
		amount = defaultAmount,
		tax_status = defaultTaxStatus,
		tax_class = defaultTaxClass,
		prices_include_tax = pricesIncludeTax,
	} = parsePosData(item) || {};

	return {
		amount: toNumber(amount),
		tax_status,
		tax_class,
		prices_include_tax: toBoolean(prices_include_tax),
	};
};
