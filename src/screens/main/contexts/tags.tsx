import createDataProvider from './create-data-provider';

type ProductTagDocument = import('@wcpos/database/src').ProductTagDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'slug' | 'term_group' | 'description' | 'count';
	hide_empty?: boolean;
	product?: number;
	slug?: string;
}

/**
 *
 */
const [ProductTagsProvider, useProductTags] = createDataProvider<
	ProductTagDocument,
	APIQueryParams
>({
	collectionName: 'products/tags',
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

export { ProductTagsProvider, useProductTags };
