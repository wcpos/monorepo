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
 *
 */
export const defaultPrepareQueryParams = (query: QueryState, batchSize: number) => {
	const params = transformMangoSelector(query.selector);

	// search
	if (query.search) {
		params.search = query.search;
	}

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
