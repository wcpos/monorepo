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

	return {
		...params,
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams };
