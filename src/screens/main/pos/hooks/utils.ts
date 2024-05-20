import { format as formatDate } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import isEmpty from 'lodash/isEmpty';
import { count } from 'rxjs';

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
export const sanitizePrice = (price?: string) => (price && price !== '' ? price : '0');

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
	const uuidMeta = (metaData ?? []).find((meta) => meta.key === '_woocommerce_pos_uuid');
	return uuidMeta ? uuidMeta.value : undefined;
};

/**
 * Get tax status from fee line meta data
 *
 * @TODO - default is 'taxable', is this correct?
 */
export const getTaxStatusFromMetaData = (metaData: CartLine['meta_data']) => {
	const taxStatusMetaData = (metaData ?? []).find(
		(meta) => meta.key === '_woocommerce_pos_tax_status'
	);
	return (taxStatusMetaData?.value ?? 'taxable') as 'taxable' | 'none' | 'shipping';
};

/**
 * Get tax class from fee line meta data
 */
export const getMetaDataValueByKey = (metaData: CartLine['meta_data'], key: string) => {
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
