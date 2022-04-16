import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _map from 'lodash/map';

type CustomerCollection = import('.').CustomerCollection;
type QueryState =
	import('@wcpos/hooks/src/use-data-observable/use-data-observable').QueryState;

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
		});
		// }).sort({ [query.sortBy]: query.sortDirection });
	},

	/**
	 *
	 */
	async restApiQuery(this: CustomerCollection, query: QueryState) {
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
			return replicationState;
		} catch (err) {
			console.log(err);
			return err;
		}
	},

	/**
	 *
	 */
	audit(this: CustomerCollection) {
		return (
			this.database.httpClient
				// @ts-ignore
				.get('customers', {
					params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: -1 },
				})
				.then(({ data }: any) => {
					// @ts-ignore
					return this.auditIdsFromServer(data);
				})
		);
	},
};
