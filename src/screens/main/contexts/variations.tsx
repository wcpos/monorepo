import createDataProvider from './create-data-provider';

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
});

export { VariationsProvider, useVariations };
