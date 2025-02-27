type OrderDocument = import('@wcpos/database/src').OrderDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	modified_after?: string;
	modified_before?: string;
	dates_are_gmt?: boolean;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	status?:
		| 'any'
		| 'pending'
		| 'processing'
		| 'on-hold'
		| 'completed'
		| 'cancelled'
		| 'refunded'
		| 'failed'
		| 'trash';
	customer?: number;
	product?: number;
	dp?: number;
}

/**
 *
 */
const filterApiQueryParams = (params) => {
	let orderby = params.orderby;

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	if (orderby === 'number') {
		orderby = 'id';
	}

	/**
	 * Customer filter is customer_id in POS, but customer in WC API
	 * so we need to convert it
	 */
	if (params.customer_id) {
		params.customer = params.customer_id;
		delete params.customer_id;
	}

	/**
	 * special case for meta_data search for cashier and store
	 * ie: {
	 * 	$and: [
	 * 		{ meta_data: { $elemMatch: { key: '_pos_user', value: '1' } } },
	 * 		{ meta_data: { $elemMatch: { key: '_pos_store', value: '2' } } }
	 * 	]
	 * }
	 */
	if (params.$and) {
		const cashier = params.$and.find((item) => item.meta_data?.$elemMatch?.key === '_pos_user');
		if (cashier) {
			params.pos_cashier = cashier.meta_data.$elemMatch.value;
		}

		const store = params.$and.find((item) => item.meta_data?.$elemMatch?.key === '_pos_store');
		if (store) {
			params.pos_store = store.meta_data.$elemMatch.value;
		}
		delete params.$and;
	} else if (params.meta_data) {
		params.pos_cashier =
			params.meta_data.$elemMatch.key === '_pos_user'
				? params.meta_data.$elemMatch.value
				: undefined;
		params.pos_store =
			params.meta_data.$elemMatch.key === '_pos_store'
				? params.meta_data.$elemMatch.value
				: undefined;
		delete params.meta_data;
	}

	/**
	 * Special case for date range
	 * {
	 * 	date_created_gmt: { $gte: '2024-01-01', $lte: '2024-01-31' }
	 * }
	 */
	if (params.date_created_gmt) {
		params.after = params.date_created_gmt.$gte;
		params.before = params.date_created_gmt.$lte;
		delete params.date_created_gmt;
	}

	return {
		...params,
		orderby,
		dp: 6,
	};
};

export { filterApiQueryParams };
