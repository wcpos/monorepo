const filterApiQueryParams = (params: Record<string, unknown>) => {
	let orderby = params.orderby;

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	} else if (orderby === 'date_modified' || orderby === 'date_modified_gmt') {
		orderby = 'modified';
	}

	return {
		...params,
		orderby,
	};
};

export { filterApiQueryParams };
