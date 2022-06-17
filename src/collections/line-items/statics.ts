import forEach from 'lodash/forEach';
import get from 'lodash/get';
import find from 'lodash/find';

type LineItemCollection = import('.').LineItemCollection;
type LineItemDocument = import('.').LineItemDocument;

/**
 * WooCommerce Order Line Item statics
 */
export default {
	/**
	 * Take plainData from server
	 */
	async bulkUpsert(this: LineItemCollection, items: Record<string, unknown>[]) {
		const promises: Promise<LineItemDocument>[] = [];

		// @TODO - data is coming in straight from REST API, need to parse first?
		forEach(items, (item) => {
			// @ts-ignore
			const localID = get(find(item.meta_data, { key: '_pos' }), 'value');
			// @ts-ignore
			const upsertedItem = this.database.collections.line_items.upsert({
				localID,
				...(item as Record<string, unknown>),
			});

			promises.push(upsertedItem);
		});

		return Promise.all(promises).catch((err: any) => {
			console.log(err);
		});
	},
};
