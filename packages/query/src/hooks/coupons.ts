const filterApiQueryParams = (params: Record<string, unknown>) => {
	let orderby = params.orderby;

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	return {
		...params,
		orderby,
	};
};

export { filterApiQueryParams };
