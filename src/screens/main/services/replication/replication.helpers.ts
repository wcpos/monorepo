/**
 *
 */
export function defaultFilterApiQueryParams(params) {
	/**
	 * remove all uuid params?
	 */
	if (params.uuid) {
		params.uuid = undefined;
	}

	Object.assign(params, {
		per_page: 10,
		dates_are_gmt: true,
	});

	return params;
}
