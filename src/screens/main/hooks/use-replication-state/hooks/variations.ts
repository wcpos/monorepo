import get from 'lodash/get';

import { filterVariationsByAttributes } from './variations.helpers';

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
const postQueryResult = (result, queryState) => {
	const allMatch = get(queryState, ['search', 'attributes']);
	if (Array.isArray(allMatch) && allMatch.length > 0) {
		return filterVariationsByAttributes(result, allMatch);
	}
	return result;
};

/**
 *
 */
const filterApiQueryParams = (params, checkpoint, batchSize) => {
	let orderby = params.orderby;

	if (orderby === 'name') {
		orderby = 'title';
	}

	return {
		...params,
		id: undefined, // remove id: { $in: [] } from query
		orderby,
	};
};

const getProductId = (str: string): number | false => {
	const match = str.match(/^products\/(\d+)\/variations$/);
	return match ? parseInt(match[1], 10) : false;
};

/**
 *
 */
const fetchRemoteIDs = async (endpoint, collection) => {
	const productId = getProductId(endpoint);
	if (productId) {
		// I need to fetch the product from the database
		const productsCollection = collection.database.collections['products'];
		const product = await productsCollection.findOne({ selector: { id: productId } }).exec();
		return product.variations;
	} else {
		throw new Error('Invalid endpoint');
	}
};

export { filterApiQueryParams, postQueryResult, fetchRemoteIDs };
