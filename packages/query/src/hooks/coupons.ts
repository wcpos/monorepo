const unwrapEqSelector = (value: unknown) => {
	if (
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length === 1 &&
		'$eq' in value
	) {
		return (value as { $eq: unknown }).$eq;
	}

	return value;
};

const filterApiQueryParams = (params: Record<string, unknown>) => {
	for (const [key, value] of Object.entries(params)) {
		params[key] = unwrapEqSelector(value);
	}

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
