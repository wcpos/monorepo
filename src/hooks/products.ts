import get from 'lodash/get';

type ProductDocument = import('@wcpos/database/src').ProductDocument;

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
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug' | 'price' | 'popularity' | 'rating';
	parent?: number[];
	parent_exclude?: number[];
	slug?: string;
	status?: 'any' | 'draft' | 'pending' | 'private' | 'publish';
	type?: 'simple' | 'grouped' | 'external' | 'variable';
	sku?: string;
	featured?: boolean;
	category?: string;
	tag?: string;
	shipping_class?: string;
	attribute?: string;
	attribute_term?: string;
	tax_class?: 'standard' | 'reduced-rate' | 'zero-rate';
	on_sale?: boolean;
	min_price?: string;
	max_price?: string;
	stock_status?: 'instock' | 'outofstock' | 'onbackorder';
}

/**
 *
 */
const filterApiQueryParams = (params) => {
	let orderby = params.orderby;

	if (orderby === 'name') {
		orderby = 'title';
	}

	if (orderby === 'date_created') {
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
		id: undefined, // remove id: { $in: [] } from query, eg: grouped products
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams };
