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
const filterApiQueryParams = (params, include) => {
	return params;
};

export { filterApiQueryParams };
