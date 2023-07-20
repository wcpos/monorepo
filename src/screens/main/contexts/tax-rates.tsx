import sortBy from 'lodash/sortBy';
import { map } from 'rxjs/operators';

import createDataProvider from './create-data-provider';
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
const [TaxRateProvider, useTaxRates] = createDataProvider<TaxRateDocument, APIQueryParams>({
	collectionName: 'taxes',
	initialQuery: { sortBy: 'id', sortDirection: 'asc' }, // Default query, will be overridden by prop
	prepareQueryParams: (params, query, checkpoint, batchSize) => {
		/**
		 * FIXME: tax has no modified after and will keep fetching over and over
		 */
		if (params.modified_after) {
			params.earlyReturn = true;
		}

		/**
		 * FIXME: taxes have no include/exclude, so I'm just going to fetch all of them
		 * 100 should be enough, right?
		 */
		params.per_page = 100;

		return params;
	},
	filterQuery: (query$) => {
		return query$.pipe(
			map((q) => {
				const selector = q.selector || {};
				// if q.search is an object, then it's a location search
				if (q.search && typeof q.search === 'object') {
					// pick out country, state, city and postcode from q.search
					const { country, state } = q.search;
					selector.$and = [{ $or: [{ country }, { country: '' }] }];
					if (state) {
						selector.$and.push({ $or: [{ state }, { state: '' }] });
					}
				}

				return { ...q, selector };
			})
		);
	},
	filterQueryData: (data$, query$) => {
		const q = query$.getValue();
		return data$.pipe(
			map((result) => {
				if (q.search && typeof q.search === 'object') {
					const { postcode, city } = q.search;
					return filterTaxRates(result, postcode, city);
				} else {
					return result;
				}
			}),
			map((result) => sortBy(result, 'order'))
		);
	},
});

export { TaxRateProvider, useTaxRates };
