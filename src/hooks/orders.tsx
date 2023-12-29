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

	return {
		...params,
		orderby,
	};
};

export { filterApiQueryParams };
