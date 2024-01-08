import get from 'lodash/get';
import orderBy from 'lodash/orderBy';
import unset from 'lodash/unset';

import { filterVariationsByAttributes } from './variations.helpers';

type ProductVariationDocument = import('@wcpos/database/src').ProductVariationDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	slug?: string;
	status?: 'any' | 'draft' | 'pending' | 'private' | 'publish';
	sku?: string;
	tax_class?: 'standard' | 'reduced-rate' | 'zero-rate';
	on_sale?: boolean;
	min_price?: string;
	max_price?: string;
	stock_status?: 'instock' | 'outofstock' | 'onbackorder';
}

/**
 * RxDB doesn't have am $allMatch operator for filtering by attributes (@TODO)
 * - remove attributes from query
 * - filter variations by attributes after query
 */
const preQueryParams = (queryParams) => {
	if (queryParams?.selector?.attributes) {
		unset(queryParams, ['selector', 'attributes']);
	}

	return queryParams;
};

/**
 *
 */
const postQueryResult = (docs, modifiedParams, originalParams) => {
	const allMatch = get(originalParams, ['selector', 'attributes', '$allMatch']);

	if (Array.isArray(allMatch) && allMatch.length > 0) {
		return filterVariationsByAttributes(docs, allMatch);
	}

	/**
	 * Variations will be ordered by ids by default
	 * - we should also honour the menu_order property
	 * - it would be nice to group by attributes maybe? rather than ids
	 */
	return orderBy(docs, ['menu_order', 'id'], ['asc', 'asc']);
};

/**
 *
 */
const filterApiQueryParams = (params) => {
	let orderby = params.orderby;

	if (orderby === 'name') {
		orderby = 'title';
	}

	return {
		...params,
		id: undefined, // remove id: { $in: [] } from query
		attributes: undefined, // there is no attributes filter in the API (@TODO)
		orderby,
	};
};

export { filterApiQueryParams, postQueryResult, preQueryParams };
