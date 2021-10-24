import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _map from 'lodash/map';

type OrderCollection = import('.').OrderCollection;
type ProductDocument = import('../products').ProductDocument;
type ProductVariationDocument = import('../product-variations').ProductVariationDocument;
type QueryState =
	import('@wcpos/common/src/hooks/use-data-observable/use-data-observable').QueryState;

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
	async restApiQuery(this: OrderCollection, query: QueryState) {
		try {
			const result = await this.storageInstance.internals.pouch.find({
				selector: {},
				// @ts-ignore
				fields: ['localID', 'id', 'dateCreatedGmt'],
			});
			// get array of sorted records with dateCreatedGmt
			const filtered = _filter(result.docs, 'dateCreatedGmt');
			const sorted = _sortBy(filtered, 'dateCreatedGmt');
			const exclude = _map(sorted, 'id').join(',');

			// @ts-ignore
			const replicationState = this.syncRestApi({
				live: false,
				autoStart: false,
				pull: {
					queryBuilder: (lastModified_1: any) => {
						return {
							search: query.search,
							order: query.sortDirection,
							orderBy: query.sortBy,
							exclude,
						};
						// const orderbyMap = {
						// 	lastName: 'meta_value',
						// 	firstName: 'meta_value',
						// };
						// const metaKeyMap = {
						// 	lastName: 'last_name',
						// 	firstName: 'first_name',
						// };
						// // @ts-ignore
						// const orderby = orderbyMap[query.sortBy] ? orderbyMap[query.sortBy] : query.sortBy;
						// // @ts-ignore
						// const meta_key = metaKeyMap[query.sortBy] ? metaKeyMap[query.sortBy] : undefined;
						// return {
						// 	search: escape(query.search),
						// 	order: query.sortDirection,
						// 	orderby,
						// 	exclude,
						// 	meta_key,
						// };
					},
				},
			});

			replicationState.run(false);
			return replicationState;
		} catch (err) {
			console.log(err);
			return err;
		}
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
		const dateCreatedGmt = new Date(timestamp).toISOString().split('.')[0];

		// @ts-ignore
		const newOrder = await this.insert({ dateCreatedGmt, status: 'pos-open' });
		return newOrder.addOrUpdateLineItem(product);
	},
};
