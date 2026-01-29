import get from 'lodash/get';
import orderBy from 'lodash/orderBy';
import unset from 'lodash/unset';

import { filterVariationsByAttributes } from './variations.helpers';

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

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	return {
		...params,
		attributes: undefined, // there is no attributes filter in the API (@TODO)
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams, postQueryResult, preQueryParams };
