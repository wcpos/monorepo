import {
	extractDirectElemMatchId,
	extractSameFieldAndElemMatchIds,
	extractSameFieldOrElemMatchIds,
	removeMangoOperatorKeys,
} from './selector-translator';
import { unwrapEqSelector } from '../utils';

const joinIds = (ids: (number | string)[]) => ids.join(',');

/**
 * Convert RxDB/Mango product selectors into parameters supported by the WCPOS/WooCommerce REST API.
 */
const filterApiQueryParams = (params: Record<string, any>) => {
	let orderby = params.orderby;
	const restParams = removeMangoOperatorKeys({ ...params });
	const selectorParams = {
		...params,
		categories: unwrapEqSelector(params.categories),
		tags: unwrapEqSelector(params.tags),
		brands: unwrapEqSelector(params.brands),
	};

	if (orderby === 'name') {
		orderby = 'title';
	}

	if (orderby === 'date_created' || orderby === 'date_created_gmt') {
		orderby = 'date';
	}

	const categoryOrIds = extractSameFieldOrElemMatchIds(selectorParams, 'categories');
	const categoryAndIds = extractSameFieldAndElemMatchIds(selectorParams, 'categories');
	const tagOrIds = extractSameFieldOrElemMatchIds(selectorParams, 'tags');
	const tagAndIds = extractSameFieldAndElemMatchIds(selectorParams, 'tags');
	const brandOrIds = extractSameFieldOrElemMatchIds(selectorParams, 'brands');
	const brandAndIds = extractSameFieldAndElemMatchIds(selectorParams, 'brands');

	if (categoryOrIds.length > 0) {
		restParams.category = joinIds(categoryOrIds);
		restParams.category_operator = 'in';
	} else if (categoryAndIds.length > 0) {
		restParams.category = joinIds(categoryAndIds);
		restParams.category_operator = 'and';
	} else if (selectorParams.categories) {
		restParams.category = extractDirectElemMatchId(selectorParams, 'categories');
	}
	delete restParams.categories;

	if (tagOrIds.length > 0) {
		restParams.tag = joinIds(tagOrIds);
		restParams.tag_operator = 'in';
	} else if (tagAndIds.length > 0) {
		restParams.tag = joinIds(tagAndIds);
		restParams.tag_operator = 'and';
	} else if (selectorParams.tags) {
		restParams.tag = extractDirectElemMatchId(selectorParams, 'tags');
	}
	delete restParams.tags;

	if (brandOrIds.length > 0) {
		restParams.brand = joinIds(brandOrIds);
		restParams.brand_operator = 'in';
	} else if (brandAndIds.length > 0) {
		restParams.brand = joinIds(brandAndIds);
		restParams.brand_operator = 'and';
	} else if (selectorParams.brands) {
		restParams.brand = extractDirectElemMatchId(selectorParams, 'brands');
	}
	delete restParams.brands;

	return {
		...restParams,
		orderby,
		status: 'publish',
	};
};

export { filterApiQueryParams };
