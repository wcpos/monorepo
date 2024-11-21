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
const filterApiQueryParams = (params) => {
	let orderby = params.orderby;

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'registered_date';
	}

	// default to all roles
	if (!params.role) {
		params.role = 'all';
	}

	/**
	 * Special case for cashiers, eg: multiple roles
	 * Convert $in to an array of roles
	 * {
	 * 	role: { $in: ['administrator', 'shop_manager', 'cashier'] },
	 * }
	 */
	if (params.role?.$in) {
		params.roles = params.role.$in;
		delete params.role;
	}

	return {
		...params,
		orderby,
	};
};

export { filterApiQueryParams };
