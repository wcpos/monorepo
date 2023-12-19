import isEmpty from 'lodash/isEmpty';

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
const filterApiQueryParams = (params, checkpoint, batchSize) => {
	const { include } = checkpoint;

	/**
	 * Categories don't have a date field, so if localIDs = remoteIDs, then we can skip the API call
	 */
	if (isEmpty(include)) {
		return false;
	}

	return params;
};

export { filterApiQueryParams };
