import isEmpty from 'lodash/isEmpty';

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
const filterApiQueryParams = (params, include) => {
	return params;
};

export { filterApiQueryParams };
