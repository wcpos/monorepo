import forEach from 'lodash/forEach';
import get from 'lodash/get';
import find from 'lodash/find';
import log from '@wcpos/utils/src/logger';

type ShippingLineCollection = import('.').ShippingLineCollection;
type ShippingLineDocument = import('.').ShippingLineDocument;

/**
 * WooCommerce Order Shipping Line statics
 */
export default {
	/**
	 * Take plainData from server
	 */
	async bulkUpsert(this: ShippingLineCollection, items: Record<string, unknown>[]) {
		const promises: Promise<ShippingLineDocument>[] = [];

		// @TODO - data is coming in straight from REST API, need to parse first?
		forEach(items, (item) => {
			// @ts-ignore
			const localID = get(find(item.meta_data, { key: '_pos' }), 'value');
			// @ts-ignore
			const upsertedItem = this.database.collections.shipping_lines.upsert({
				localID,
				...(item as Record<string, unknown>),
			});

			promises.push(upsertedItem);
		});

		return Promise.all(promises).catch((err: any) => {
			log.error(err);
		});
	},
};
