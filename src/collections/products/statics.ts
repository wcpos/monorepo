import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _map from 'lodash/map';
import _get from 'lodash/get';
import _flatten from 'lodash/flatten';

type ProductCollection = import('.').ProductCollection;
type QueryState = import('@wcpos/hooks/src/use-data-observable/use-data-observable').QueryState;

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * WooCommerce Order Collection statics
 */
export default {
	/**
	 *
	 */
	query(this: ProductCollection, query: QueryState) {
		const selector = {};
		if (query.search) {
			const regexp = new RegExp(escape(query.search), 'i');
			// @ts-ignore
			selector.name = { $regex: regexp };
		}
		if (_get(query, 'filters.category')) {
			// @ts-ignore
			selector.categories = { $elemMatch: { id: _get(query, 'filters.category.id') } };
		}
		if (_get(query, 'filters.tag')) {
			// @ts-ignore
			selector.tags = { $elemMatch: { id: _get(query, 'filters.tag.id') } };
		}

		const RxQuery = this.find({ selector });
		const indexes = _flatten(this.schema.indexes);
		if (indexes.includes(query.sortBy)) {
			const sortedRxQuery = RxQuery.sort({ [query.sortBy]: query.sortDirection });
			return sortedRxQuery;
		}
		return RxQuery;
	},

	/**
	 *
	 */
	async restApiQuery(this: ProductCollection, query: QueryState) {
		try {
			const result = await this.storageInstance.internals.pouch.find({
				selector: {},
				// @ts-ignore
				fields: ['localID', 'id', 'date_created_gmt'],
			});
			// get array of sorted records with date_created_gmt
			const filtered = _filter(result.docs, 'date_created_gmt');
			const sorted = _sortBy(filtered, 'date_created_gmt');
			const exclude = _map(sorted, 'id').join(',');

			// @ts-ignore
			const replicationState = this.syncRestApi({
				live: false,
				autoStart: false,
				pull: {
					queryBuilder: (lastModified_1: any) => {
						const orderbyMap = {
							name: 'title',
							date_created: 'date',
						};
						// @ts-ignore
						const orderby = orderbyMap[query.sortBy] ? orderbyMap[query.sortBy] : query.sortBy;
						return {
							search: escape(query.search),
							order: query.sortDirection,
							orderby,
							exclude,
							category: _get(query, 'filters.category.id'),
							tag: _get(query, 'filters.tag.id'),
						};
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
	audit(this: ProductCollection) {
		return (
			this.database.httpClient
				// @ts-ignore
				.get('products', {
					params: { fields: ['id', 'name'], posts_per_page: -1 },
				})
				.then(({ data }: any) => {
					// @ts-ignore
					return this.auditIdsFromServer(data);
				})
		);
	},
};
