import difference from 'lodash/difference';
import get from 'lodash/get';
import sampleSize from 'lodash/sampleSize';

import { parseLinkHeader } from '../../../../lib/url';

import type { QueryState } from '../use-query';

/**
 *
 */
export const parseHeaders = (response) => {
	const link = get(response, ['headers', 'link']);
	const parsedHeaders = parseLinkHeader(link);
	const remoteTotal = get(response, ['headers', 'x-wp-total']);
	const totalPages = get(response, ['headers', 'x-wp-totalpages']);
	const nextPage = get(parsedHeaders, ['next', 'page']);

	return {
		remoteTotal,
		totalPages,
		nextPage,
	};
};

/**
 *
 */
function mapKeyToParam(key: string) {
	if (key === 'categories') {
		return 'category';
	} else if (key === 'tags') {
		return 'tag';
	} else {
		return key;
	}
}

/**
 *
 */
export function transformMangoSelector(selector) {
	const restQuery = {};
	if (!selector) {
		return restQuery;
	}
	for (const [key, value] of Object.entries(selector)) {
		if (key === 'id' && typeof value === 'object' && '$in' in value) {
			restQuery.include = value.$in;
		} else {
			const param = mapKeyToParam(key);
			if (typeof value === 'object' && '$elemMatch' in value) {
				restQuery[param] = value.$elemMatch.id;
			} else {
				restQuery[param] = value;
			}
		}
	}
	return restQuery;
}

/**
 *
 */
export interface Checkpoint extends ReturnType<typeof parseHeaders> {
	lastModified: string;
	completeIntitalSync: boolean;
}

/**
 * NOTE: some servers are returning errors if the query string is too long
 * Each server has a different limit, but as a rule of thumb, we'll limit to around 2000 characters
 * https://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
 *
 * If we limit the include array to 100, that should be safe for all cases
 *
 * @TODO - this should be smarter and do a character count instead of an item count
 * 350 character limit might be good
 */
const maxItems = 50;

export const defaultPrepareQueryParams = (query: QueryState, status: any, batchSize: number) => {
	const params = transformMangoSelector(query.selector);
	const hasIncludeQuery = Array.isArray(params.include) && params.include.length > 0;

	// search
	if (query.search) {
		params.search = query.search;
	}

	// special case for includes
	if (hasIncludeQuery) {
		status.completeIntitalSync = difference(params.include, status.remoteIDs).length === 0;
	}

	if (status.completeIntitalSync) {
		/**
		 * FIXME: which collections have a modified_after field?
		 */
		params.modified_after = status.lastModified;
	}

	// handle the audit status
	// if (!status.completeIntitalSync) {
	// 	// both empty, what to do?
	// 	if (status.include.length === 0 && status.exclude.length === 0) {
	// 		debugger;
	// 	}

	// 	if (status.include.length < status.exclude.length && status.include.length <= maxItems) {
	// 		params.include = status.include;
	// 	} else if (status.exclude.length < status.include.length && status.exclude.length <= maxItems) {
	// 		params.exclude = status.exclude;
	// 	} else {
	// 		// if both are more than maxItems, take the first maxItems from include
	// 		params.include = sampleSize(status.include, maxItems);
	// 	}
	// }

	return Object.assign(params, {
		order: query.sortDirection,
		orderby: query.sortBy,
		// page: checkpoint.nextPage || 1,
		per_page: batchSize,
		dates_are_gmt: true,
	});
};

/**
 *
 */
export const retryWithExponentialBackoff = async (fn, retries = 5, delay = 1000) => {
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (error) {
			if (error.response && error.response.status === 503) {
				// If it's a 503 error, wait for an increasing amount of time and try again
				await new Promise((resolve) => setTimeout(resolve, delay * 2 ** i));
			} else {
				// If it's not a 503 error, re-throw the error
				throw error;
			}
		}
	}

	throw new Error('Max retries reached');
};

/**
 * Priorities
 *
 * 10 - Tax
 * 20 - Product
 * 30 - Customer
 * 40 - Order
 * 50 - Product Search
 * 60 - Customer Search
 * 70 - Order Search
 * 80 - Variations
 * 90 - Variation Search
 * 100 - Product Category
 * 110 - Product Tag
 */
export const getPriority = (endpoint: string, params?: object) => {
	let type = endpoint;

	if (!params) {
		type += '-audit';
	}

	switch (type) {
		case 'taxes':
			return 10;
		case 'products-audit':
			return 20;
		case 'customers-audit':
			return 30;
		case 'orders-audit':
			return 40;
		case 'products':
			return 50;
		case 'customers':
			return 60;
		case 'orders':
			return 70;
		case 'products-search':
			return 80;
		case 'customers-search':
			return 90;
		case 'orders-search':
			return 100;
		case 'variation-audit':
			return 110;
		case 'variation':
			return 120;
		case 'variations-search':
			return 130;
		case 'products/categories':
			return 140;
		case 'products/tags':
			return 150;
		default:
			return 200;
	}
};
