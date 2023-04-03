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
			restQuery.includes = value.$in;
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
export const defaultPrepareQueryParams = (
	query: QueryState,
	checkpoint: Checkpoint,
	batchSize: number,
	completeIntitalSync: boolean
) => {
	const params = transformMangoSelector(query.selector);
	return Object.assign(params, {
		order: query.sortDirection,
		orderby: query.sortBy,
		page: checkpoint.nextPage || 1,
		per_page: batchSize,
		/**
		 * FIXME: this is for products and variations only
		 */
		modified_after: completeIntitalSync ? checkpoint.lastModified : null,
		dates_are_gmt: true,
	});
};

/**
 *
 */
export const getLocalIDs = async (collection, endpoint = '') => {
	// special case for variations
	const regex = /^products\/(\d+)\/variations/;
	const match = endpoint.match(regex);
	await collection.database.requestIdlePromise();

	if (match) {
		const parentID = parseInt(match[1], 10);
		const parentDocs = await collection.database.collections.products
			.find({ selector: { id: parentID } })
			.exec();
		if (Array.isArray(parentDocs) && parentDocs.length === 1) {
			const { variations } = parentDocs[0];
			return collection
				.find({
					selector: { id: { $in: variations } },
					// fields: ['id'],
				})
				.exec()
				.then((res) => {
					return res.map((doc) => {
						return doc.id;
					});
				});
		} else {
			return Promise.resolve([]);
		}
	} else {
		return collection
			.find({
				selector: { id: { $exists: true } },
				// fields: ['id'],
			})
			.exec()
			.then((res) => {
				return res.map((doc) => {
					return doc.id;
				});
			});
	}
};
