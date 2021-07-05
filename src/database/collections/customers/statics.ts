import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _map from 'lodash/map';

type CustomerCollection = import('.').CustomerCollection;
type QueryState =
	import('@wcpos/common/src/hooks/use-data-observable/use-data-observable').QueryState;

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * WooCommerce Order Collection statics
 */
export default {
	/**
	 *
	 */
	query(this: CustomerCollection, query: QueryState) {
		const regexp = new RegExp(escape(query.search), 'i');
		return this.find({
			selector: {
				$or: [
					{ username: { $regex: regexp } },
					{ firstName: { $regex: regexp } },
					{ lastName: { $regex: regexp } },
				],
				// $and: [{ [q.sortBy]: { $exists: false } }],
			},
		}).sort({ [query.sortBy]: query.sortDirection });
	},

	/**
	 *
	 */
	restApiQuery(this: CustomerCollection, query: QueryState) {
		this.pouch
			.find({
				selector: {},
				// @ts-ignore
				fields: ['_id', 'id', 'dateCreatedGmt'],
			})
			.then((result: any) => {
				// get array of sorted records with dateCreatedGmt
				const filtered = _filter(result.docs, 'dateCreatedGmt');
				const sorted = _sortBy(filtered, 'dateCreatedGmt');
				const exclude = _map(sorted, 'id').join(',');

				// @ts-ignore
				const replicationState = this.syncRestApi({
					live: false,
					autoStart: false,
					pull: {
						queryBuilder: (lastModified: any) => {
							const orderbyMap = {
								lastName: 'meta_value',
								firstName: 'meta_value',
							};

							const metaKeyMap = {
								lastName: 'last_name',
								firstName: 'first_name',
							};

							// @ts-ignore
							const orderby = orderbyMap[query.sortBy] ? orderbyMap[query.sortBy] : query.sortBy;
							// @ts-ignore
							const meta_key = metaKeyMap[query.sortBy] ? metaKeyMap[query.sortBy] : undefined;

							return {
								search: escape(query.search),
								order: query.sortDirection,
								orderby,
								exclude,
								meta_key,
							};
						},
					},
				});

				replicationState.run(false);
			})
			.catch((err: any) => {
				console.log(err);
			});
	},

	/**
	 *
	 */
	audit(this: CustomerCollection) {
		return this.database.httpClient
			.get('orders', {
				params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: -1 },
			})
			.then(({ data }: any) => {
				// @ts-ignore
				return this.auditIdsFromServer(data);
			});
	},
};
