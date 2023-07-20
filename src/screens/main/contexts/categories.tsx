import createDataProvider from './create-data-provider';

type ProductCategoryDocument = import('@wcpos/database/src').ProductCategoryDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'slug' | 'term_group' | 'description' | 'count';
	hide_empty?: boolean;
	parent?: number;
	product?: number;
	slug?: string;
}

/**
 *
 */
const [ProductCategoriesProvider, useProductCategories] = createDataProvider<
	ProductCategoryDocument,
	APIQueryParams
>({
	collectionName: 'products/categories',
	initialQuery: { sortBy: 'id', sortDirection: 'asc' }, // Default query, will be overridden by prop
	prepareQueryParams: (params, query, checkpoint, batchSize) => {
		/**
		 * FIXME: category has no modified after and will keep fetching over and over
		 */
		if (params.modified_after) {
			params.earlyReturn = true;
		}
		return params;
	},
});

export { ProductCategoriesProvider, useProductCategories };
