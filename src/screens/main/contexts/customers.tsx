import createDataProvider from './create-data-provider';

type CustomerDocument = import('@wcpos/database/src').CustomerDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'registered_date';
	email?: string;
	role?:
		| 'all'
		| 'administrator'
		| 'editor'
		| 'author'
		| 'contributor'
		| 'subscriber'
		| 'customer'
		| 'shop_manager';
}

/**
 *
 */
const [CustomersProvider, useCustomers] = createDataProvider<CustomerDocument, APIQueryParams>({
	collectionName: 'customers',
	initialQuery: { sortBy: 'id', sortDirection: 'asc' }, // Default query, will be overridden by prop
	prepareQueryParams: (params, query, checkpoint, batchSize) => {
		let orderby = params.orderby;

		if (query.sortBy === 'date_created') {
			orderby = 'registered_date';
		}

		// HACK: get the deafult_customer, probably a better way to do this
		if (params.id) {
			params.include = params.id;
			params.id = undefined;
		}

		return {
			...params,
			role: 'all',
			orderby,
		};
	},
});

export { CustomersProvider, useCustomers };
