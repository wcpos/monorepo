import { format as formatDate } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import isEmpty from 'lodash/isEmpty';

import log from '@wcpos/utils/src/logger';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type CartLine = LineItem | FeeLine | ShippingLine;

/**
 *
 */
export const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 *
 */
export const sanitizePrice = (price?: string) => (price && price !== '' ? String(price) : '0');

/**
 * @returns {string} - Current GMT date
 */
export const getCurrentGMTDate = () => {
	// Get the current date and time in UTC
	const nowUtc = fromZonedTime(new Date(), 'UTC');

	// Format the date in the desired format
	return formatDate(nowUtc, "yyyy-MM-dd'T'HH:mm:ss");
};

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
export function findByMetaDataUUID(items: CartLine[], uuid: string) {
	for (const item of items) {
		if (!Array.isArray(item.meta_data)) {
			log.error('metaData is not an array');
			return;
		}
		const uuidMetaData = item.meta_data.find(
			(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
		);
		if (uuidMetaData) {
			return item;
		}
	}
	return null;
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
		.filter((item) => item.key && metaDataKeys.includes(item.key))
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
export const convertVariationToLineItemWithoutTax = (
	variation: Variation,
	parent: Product,
	metaData?: Partial<LineItem['meta_data'][number]>[],
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
		attributes = variation.attributes.map((attr) => ({
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
		.filter((item) => item.key && metaDataKeys.includes(item.key))
		.map(({ key, value }) => ({ key, value }));

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const new_meta_data = [...meta_data];

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
 * Updates or adds _woocommerce_pos_data meta_data
 */
export const updatePosDataMeta = (
	item: FeeLine,
	newData: Partial<{ amount: string; percent: boolean; prices_include_tax: boolean }>
): FeeLine => {
	const meta_data = item.meta_data ?? [];
	let posDataFound = false;

	const updatedMetaData = meta_data.map((meta) => {
		if (meta.key === '_woocommerce_pos_data') {
			const posData = JSON.parse(meta.value);
			Object.assign(posData, newData);
			posDataFound = true;
			return {
				...meta,
				value: JSON.stringify(posData),
			};
		}
		return meta;
	});

	if (!posDataFound) {
		updatedMetaData.push({
			key: '_woocommerce_pos_data',
			value: JSON.stringify(newData),
		});
	}

	return {
		...item,
		meta_data: updatedMetaData,
	};
};
