import isEmpty from 'lodash/isEmpty';

import { filterTaxRates } from './tax-rates.helpers';

type TaxRateDocument = import('@wcpos/database/src').TaxRateDocument;
type QueryHooks = import('@wcpos/query').QueryHooks;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'order' | 'priority';
	class?: string;
}

/**
 * This is a hack!
 * I'm kind of cheatinghere, because the WooCommerce has pretty confusing filter for taxes
 * eg: postcode wildcards are all sorts.
 * I've shoved the query into a search object, which is not ideal, but it works for now.
 */
const preQueryParams: QueryHooks['preQueryParams'] = (queryParams) => {
	// /**
	//  * @TODO - do I need to incorporate the old selector?
	//  */
	// const newSelector = {};
	// if (queryParams.search && typeof queryParams.search === 'object') {
	// 	// pick out country, state, city and postcode from q.search
	// 	const { country, state } = queryParams.search;
	// 	newSelector.$and = [{ $or: [{ country }, { country: '' }] }];
	// 	if (state) {
	// 		newSelector.$and.push({ $or: [{ state }, { state: '' }] });
	// 	}
	// }

	// queryParams.selector = newSelector;

	return queryParams;
};

/**
 *
 */
// const postQueryResult: QueryHooks['postQueryResult'] = (docs, modifiedParams, originalParams) => {
// 	if (originalParams.search && typeof originalParams.search === 'object') {
// 		const { country, state, postcode, city } = originalParams.search;
// 		return filterTaxRates(docs, country, state, postcode, city);
// 	} else {
// 		return docs;
// 	}
// };

/**
 *
 */
const filterApiQueryParams = (params, include) => {
	/**
	 * FIXME: taxes have no include/exclude, so I'm just going to fetch all of them
	 * 100 should be enough, right?
	 */
	params = params || {};
	params.per_page = 100;
	return params;
};

export { preQueryParams, filterApiQueryParams };
