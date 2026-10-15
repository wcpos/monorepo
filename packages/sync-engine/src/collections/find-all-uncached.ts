import { countRxQuerySubscribers, type QueryCache, type RxQuery, uncacheRxQuery } from 'rxdb';

/** The collection's RxDB query cache, or undefined for a structural fake that has none. */
function queryCacheOf(collection: object): QueryCache | undefined {
	if (!('_queryCache' in collection)) return undefined;
	const cache: unknown = collection._queryCache;
	if (typeof cache !== 'object' || cache === null || !('_map' in cache)) return undefined;
	return cache._map instanceof Map ? (cache as QueryCache) : undefined;
}

/**
 * Runs a full-collection read for a background pass and drops the query from RxDB's query cache
 * afterwards, unless something is subscribed to it. #2502 explains why.
 */
export async function findAllUncached<TDoc>(
	collection: { find(query?: object): { exec(): Promise<TDoc[]> } },
	query?: object
): Promise<TDoc[]> {
	const rxQuery = query === undefined ? collection.find() : collection.find(query);
	try {
		return await rxQuery.exec();
	} finally {
		const queryCache = queryCacheOf(collection);
		// A real collection's find() returns an RxQuery, possibly the very instance a screen is
		// subscribed to (RxDB reuses cached queries by their string form); that one stays cached.
		if (queryCache && countRxQuerySubscribers(rxQuery as unknown as RxQuery) === 0) {
			uncacheRxQuery(queryCache, rxQuery as unknown as RxQuery);
		}
	}
}
