import {
	extractDirectElemMatchId,
	extractSameFieldAndElemMatchIds,
	extractSameFieldOrElemMatchIds,
	removeMangoOperatorKeys,
} from './selector-translator';

const joinIds = (ids: (number | string)[]) => ids.join(',');

/**
 * Convert RxDB/Mango product selectors into parameters supported by the WCPOS/WooCommerce REST API.
 */
const filterApiQueryParams = (params: Record<string, any>) => {
	let orderby = params.orderby;
	const restParams = removeMangoOperatorKeys({ ...params });

	if (orderby === 'name') {
		orderby = 'title';
	}

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	const categoryOrIds = extractSameFieldOrElemMatchIds(params, 'categories');
	const categoryAndIds = extractSameFieldAndElemMatchIds(params, 'categories');
	const tagOrIds = extractSameFieldOrElemMatchIds(params, 'tags');
	const tagAndIds = extractSameFieldAndElemMatchIds(params, 'tags');
	const brandOrIds = extractSameFieldOrElemMatchIds(params, 'brands');
	const brandAndIds = extractSameFieldAndElemMatchIds(params, 'brands');

	if (categoryOrIds.length > 0) {
		restParams.category = joinIds(categoryOrIds);
		restParams.category_operator = 'in';
	} else if (categoryAndIds.length > 0) {
		restParams.category = joinIds(categoryAndIds);
		restParams.category_operator = 'and';
	} else if (params.categories) {
		restParams.category = extractDirectElemMatchId(params, 'categories');
	}
	delete restParams.categories;

	if (tagOrIds.length > 0) {
		restParams.tag = joinIds(tagOrIds);
		restParams.tag_operator = 'in';
	} else if (tagAndIds.length > 0) {
		restParams.tag = joinIds(tagAndIds);
		restParams.tag_operator = 'and';
	} else if (params.tags) {
		restParams.tag = extractDirectElemMatchId(params, 'tags');
	}
	delete restParams.tags;

	if (brandOrIds.length > 0) {
		restParams.brand = joinIds(brandOrIds);
		restParams.brand_operator = 'in';
	} else if (brandAndIds.length > 0) {
		restParams.brand = joinIds(brandAndIds);
		restParams.brand_operator = 'and';
	} else if (params.brands) {
		restParams.brand = extractDirectElemMatchId(params, 'brands');
	}
	delete restParams.brands;

	return {
		...restParams,
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams };
