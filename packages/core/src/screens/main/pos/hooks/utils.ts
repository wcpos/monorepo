import toNumber from 'lodash/toNumber';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import {
	calculateDefaultAmount,
	extractFeeLineData,
	extractLineItemData,
	extractLineItemPrices,
	extractShippingLineData,
	getLineItemTaxStatus,
	getMetaDataValueByKey,
	getUuidFromLineItem,
	getUuidFromLineItemMetaData,
	parsePosData,
	sanitizePrice,
	updatePosDataMeta,
} from '@wcpos/order-math/internal';
import type { CartLine } from '@wcpos/order-math/internal';

// MIGRATION SHIM: these names moved to @wcpos/order-math; re-exported here so
// existing './utils' imports keep working until the PR 2 adapter cutover.
export {
	sanitizePrice,
	parsePosData,
	updatePosDataMeta,
	getUuidFromLineItem,
	getUuidFromLineItemMetaData,
	getMetaDataValueByKey,
	getLineItemTaxStatus,
	extractLineItemPrices,
	extractLineItemData,
	extractFeeLineData,
	extractShippingLineData,
	calculateDefaultAmount,
};
export type { CartLine };

const posLogger = getLogger(['wcpos', 'pos', 'utils']);

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type LineItemImage = LineItem['image'];

const normalizeLineItemImage = (
	image?: { id?: number | string | null; src?: string | null } | null
): LineItemImage => {
	const src = image?.src;

	if (!src) {
		return undefined;
	}

	const normalizedId =
		typeof image?.id === 'number'
			? image.id
			: image?.id != null && image.id !== ''
				? toNumber(image.id)
				: undefined;

	return {
		src,
		...(Number.isFinite(normalizedId) ? { id: normalizedId } : {}),
	};
};

/**
 * Get tax status from fee line meta data
 *
 * @TODO - default is 'taxable', is this correct?
 */
export const getTaxStatusFromMetaData = (metaData: CartLine['meta_data']) => {
	if (!Array.isArray(metaData)) {
		posLogger.error('metaData is not an array', {
			context: {
				errorCode: ERROR_CODES.INVALID_DATA_TYPE,
				metaData,
			},
		});
		return;
	}
	const taxStatusMetaData = metaData.find((meta) => meta.key === '_woocommerce_pos_tax_status');
	return (taxStatusMetaData?.value ?? 'taxable') as 'taxable' | 'none' | 'shipping';
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
		posLogger.error('lineItems is not an array', {
			context: {
				errorCode: ERROR_CODES.INVALID_DATA_TYPE,
				lineItems,
				productId,
				variationId,
			},
		});
		return;
	}
	const matchingItems = lineItems.filter(
		(item) => item.product_id === productId && (item.variation_id ?? 0) === variationId
	);

	return matchingItems;
};

/**
 * @NOTE - we have to be careful here because if a property is undefined or null, it will be ingnored when
 * we send the data to the server.
 */
type CustomerJSON = import('@wcpos/database').CustomerDocument;
export const transformCustomerJSONToOrderJSON = (
	customer: CustomerJSON,
	defaultCountry: string
) => {
	return {
		customer_id: customer.id,
		billing: {
			first_name: customer?.billing?.first_name || customer.first_name || customer?.username || '',
			last_name: customer?.billing?.last_name || customer?.last_name || '',
			company: customer?.billing?.company || '',
			address_1: customer?.billing?.address_1 || '',
			address_2: customer?.billing?.address_2 || '',
			city: customer?.billing?.city || '',
			state: customer?.billing?.state || '',
			postcode: customer?.billing?.postcode || '',
			country: customer?.billing?.country || defaultCountry,
			email: customer?.billing?.email || customer?.email || '',
			phone: customer?.billing?.phone || '',
		},
		shipping: {
			first_name: customer?.shipping?.first_name || '',
			last_name: customer?.shipping?.last_name || '',
			company: customer?.shipping?.company || '',
			address_1: customer?.shipping?.address_1 || '',
			address_2: customer?.shipping?.address_2 || '',
			city: customer?.shipping?.city || '',
			state: customer?.shipping?.state || '',
			postcode: customer?.shipping?.postcode || '',
			country: customer?.shipping?.country || '',
		},
		// Snapshot the customer's tax IDs onto the order at attach time. The
		// order owns its own copy so post-sale edits don't leak back to the
		// customer record (and customer-record edits don't retroactively
		// change historical orders). Empty array when the customer has none —
		// this overrides any prior snapshot if the cashier swaps customers.
		tax_ids: Array.isArray(customer?.tax_ids)
			? customer.tax_ids.map((taxId) => ({
					...taxId,
					verified: taxId.verified ? { ...taxId.verified } : null,
				}))
			: [],
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

	const posData: Record<string, unknown> = { price, regular_price, tax_status };

	// Include misc product fields in pos_data (only for misc products, id === 0)
	if (product.id === 0) {
		posData.virtual = product.virtual ?? false;
		posData.downloadable = product.downloadable ?? false;
		if ((product as any)._pos_categories != null) {
			posData.categories = (product as any)._pos_categories;
		}
	}

	new_meta_data.push({
		key: '_woocommerce_pos_data',
		value: JSON.stringify(posData),
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
		image: normalizeLineItemImage(product.images?.[0]),
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
		image: normalizeLineItemImage(variation.image) || normalizeLineItemImage(parent.images?.[0]),
		meta_data: new_meta_data,
	};
};
