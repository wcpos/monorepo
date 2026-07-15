import * as React from 'react';

import { prepareCollectionResetRefill, useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import type { CollectionKey } from './use-collection';

const logger = getLogger(['wcpos', 'hooks', 'useCollectionReset']);

type EngineCollection =
	| 'products'
	| 'variations'
	| 'orders'
	| 'customers'
	| 'taxRates'
	| 'categories'
	| 'tags'
	| 'brands'
	| 'coupons';

const ENGINE_COLLECTIONS: Partial<Record<CollectionKey, EngineCollection>> = {
	products: 'products',
	variations: 'variations',
	orders: 'orders',
	customers: 'customers',
	taxes: 'taxRates',
	'products/categories': 'categories',
	'products/tags': 'tags',
	'products/brands': 'brands',
	coupons: 'coupons',
};

export interface CollectionResetResult {
	collectionName: CollectionKey;
	outcome: 'reset' | 'needs-confirmation';
}

/** Engine-owned reset funnel. A pending mutation queue is never destroyed implicitly: the
 * engine's `needs-confirmation` value is preserved and returned to the caller unchanged. */
export const useCollectionReset = (key: CollectionKey) => {
	const runtime = useQueryManager();
	const collectionNames = React.useMemo<CollectionKey[]>(
		() => (key === 'products' ? ['variations', 'products'] : [key]),
		[key]
	);

	const resetOne = React.useCallback(
		async (collectionName: CollectionKey): Promise<CollectionResetResult> => {
			const engineName = ENGINE_COLLECTIONS[collectionName];
			if (!engineName) throw new Error(`Collection "${collectionName}" cannot be engine-reset`);
			const outcome = await runtime.engine.scope.resetCollection(engineName);
			if (outcome === 'reset') {
				const resetSubject = (
					runtime.localDB as unknown as {
						reset$?: { next(value: unknown): void };
					}
				).reset$;
				resetSubject?.next({ name: collectionName });
			}
			return { collectionName, outcome };
		},
		[runtime]
	);

	const clear = React.useCallback(async (): Promise<CollectionResetResult[]> => {
		const results: CollectionResetResult[] = [];
		for (const collectionName of collectionNames) {
			const result = await resetOne(collectionName);
			results.push(result);
			if (result.outcome === 'needs-confirmation') break;
		}
		return results;
	}, [collectionNames, resetOne]);

	const clearAndSync = React.useCallback(async (): Promise<void> => {
		logger.debug('clearAndSync: starting', { context: { key } });
		const refill = prepareCollectionResetRefill(runtime.engine, collectionNames);
		const results = await clear();
		const pendingConfirmation = results.find((result) => result.outcome === 'needs-confirmation');
		if (pendingConfirmation) {
			logger.warn('clearAndSync: reset needs confirmation', {
				context: { collectionName: pendingConfirmation.collectionName },
			});
			return;
		}
		await refill();
		logger.debug('clearAndSync: complete', { context: { key } });
	}, [clear, collectionNames, key, runtime.engine]);

	return { clear, clearAndSync };
};
