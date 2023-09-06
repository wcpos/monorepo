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
const filterApiQueryParams = (params, checkpoint, batchSize) => {
	let orderby = params.orderby;

	if (orderby === 'date_created') {
		orderby = 'registered_date';
	}

	// HACK: get the deafult_customer, probably a better way to do this
	// if (params.id) {
	// 	params.include = params.id;
	// 	params.id = undefined;
	// }

	return {
		...params,
		role: 'all',
		orderby,
	};
};

export { filterApiQueryParams };
