import get from 'lodash/get';
import { map } from 'rxjs/operators';

import createDataProvider from './create-data-provider';
import { updateVariationQueryState, filterVariationsByAttributes } from './variations.helpers';

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
 *
 */
const [VariationsProvider, useVariations] = createDataProvider<
	ProductVariationDocument,
	APIQueryParams
>({
	collectionName: 'variations',
	initialQuery: { sortBy: 'id', sortDirection: 'asc' }, // Default query, will be overridden by prop
	prepareQueryParams: (params, query, checkpoint, batchSize) => {
		let orderby = params.orderby;

		if (query.sortBy === 'name') {
			orderby = 'title';
		}

		return {
			...params,
			orderby,
		};
	},
	/**
	 * RxDB doesn't have $allMatch, so we filter manually using the search query
	 */
	filterQueryData(data$, query$) {
		return data$.pipe(
			map((data) => {
				const allMatch = get(query$.getValue(), ['search', 'attributes']);
				console.log('allMatch', allMatch);
				if (allMatch) {
					return filterVariationsByAttributes(data, allMatch);
				}
				return data;
			})
		);
	},
});

export { VariationsProvider, useVariations, updateVariationQueryState };
