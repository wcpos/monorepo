import difference from 'lodash/difference';
import get from 'lodash/get';

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
export const defaultPrepareQueryParams = (query: QueryState, status: any, batchSize: number) => {
	const params = transformMangoSelector(query.selector);
	const hasIncludeQuery = Array.isArray(params.include) && params.include.length > 0;

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
	if (!status.completeIntitalSync) {
		// if there are no params, we need to add the audit status
		// we should add include or exclude depending on which one is shorter
		if (status.include.length < status.exclude.length) {
			params.include = status.include;
		}
		if (status.exclude.length < status.include.length) {
			params.exclude = status.exclude;
		}
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
