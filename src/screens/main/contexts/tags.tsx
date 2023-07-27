import isEmpty from 'lodash/isEmpty';

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
	hooks: {
		filterApiQueryParams: (params, checkpoint, batchSize) => {
			const { include } = checkpoint;

			/**
			 * Tags don't have a date field, so if localIDs = remoteIDs, then we can skip the API call
			 */
			if (isEmpty(include)) {
				return false;
			}

			return params;
		},
	},
});

export { ProductTagsProvider, useProductTags };
