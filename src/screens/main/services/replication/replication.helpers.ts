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
		/**
		 * I don't think this is needed, as we explicitly set date_created_gmt, date_modified_gmt etc
		 */
		// dates_are_gmt: true,
	});

	return params;
}
