import get from 'lodash/get';

/**
 *
 */
const filterApiQueryParams = (params: Record<string, any>) => {
	let orderby = params.orderby;

	if (orderby === 'name') {
		orderby = 'title';
	}

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	if (params.categories) {
		params.category = get(params, ['categories', '$elemMatch', 'id']);
		delete params.categories;
	}

	if (params.tags) {
		params.tag = get(params, ['tags', '$elemMatch', 'id']);
		delete params.tags;
	}

	// stock_status is not a valid WooCommerce REST API filter param; filtering is done locally
	delete params.stock_status;

	return {
		...params,
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams };
