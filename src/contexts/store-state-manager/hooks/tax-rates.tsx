import isEmpty from 'lodash/isEmpty';

import { filterTaxRates } from './tax-rates.helpers';

type TaxRateDocument = import('@wcpos/database/src').TaxRateDocument;

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
 *
 */
const preQuerySelector = (selector, queryState) => {
	/**
	 * @TODO - do I need to incorporate the old selector?
	 */
	const newSelector = {};
	if (queryState.search && typeof queryState.search === 'object') {
		// pick out country, state, city and postcode from q.search
		const { country, state } = queryState.search;
		newSelector.$and = [{ $or: [{ country }, { country: '' }] }];
		if (state) {
			newSelector.$and.push({ $or: [{ state }, { state: '' }] });
		}
	}
	return newSelector;
};

/**
 *
 */
const postQueryResult = (result, queryState) => {
	if (queryState.search && typeof queryState.search === 'object') {
		const { postcode, city } = queryState.search;
		return filterTaxRates(result, postcode, city);
	} else {
		return result;
	}
};

/**
 *
 */
const filterApiQueryParams = (params, checkpoint, batchSize) => {
	const { include } = checkpoint;

	/**
	 * Taxes don't have a date field, so if localIDs = remoteIDs, then we can skip the API call
	 */
	if (isEmpty(include)) {
		return false;
	}

	/**
	 * FIXME: taxes have no include/exclude, so I'm just going to fetch all of them
	 * 100 should be enough, right?
	 */
	params = params || {};
	params.per_page = 100;
	return params;
};

export { preQuerySelector, postQueryResult, filterApiQueryParams };
