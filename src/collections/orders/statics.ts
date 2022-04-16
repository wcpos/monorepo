import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _map from 'lodash/map';

type OrderCollection = import('.').OrderCollection;
type ProductDocument = import('../products').ProductDocument;
type ProductVariationDocument = import('../product-variations').ProductVariationDocument;
type QueryState =
	import('@wcpos/hooks/src/use-data-observable/use-data-observable').QueryState;

/**
 * WooCommerce Order Collection statics
 */
export default {
	/**
	 *
	 */
	query(this: OrderCollection, query: QueryState) {
		return this.find();
	},

	/**
	 *
	 */
	audit(this: OrderCollection) {
		return (
			this.database.httpClient
				// @ts-ignore
				.get('orders', {
					params: { fields: ['id'], posts_per_page: -1 },
				})
				.then(({ data }: any) => {
					// @ts-ignore
					return this.auditIdsFromServer(data);
				})
		);
	},

	/**
	 *
	 */
	async createNewOrderWithProduct(
		this: OrderCollection,
		product: ProductDocument | ProductVariationDocument
	) {
		// get timestamp and turn it into date_created_gmt, eg: 2020-07-07T14:40:00
		const timestamp = Date.now();
		const date_created_gmt = new Date(timestamp).toISOString().split('.')[0];

		// @ts-ignore
		const newOrder = await this.insert({ date_created_gmt, status: 'pos-open' });
		return newOrder.addOrUpdateLineItem(product);
	},
};
