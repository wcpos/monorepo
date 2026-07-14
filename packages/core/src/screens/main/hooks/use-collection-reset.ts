import * as React from 'react';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import type { CollectionKey } from './use-collection';
import type { RxCollection } from 'rxdb';

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
	const manager = useQueryManager();

	const resetOne = React.useCallback(
		async (collectionName: CollectionKey): Promise<CollectionResetResult> => {
			const engineName = ENGINE_COLLECTIONS[collectionName];
			if (!engineName) throw new Error(`Collection "${collectionName}" cannot be engine-reset`);
			const staleCollection = manager.getCollection(collectionName) as RxCollection | undefined;
			const outcome = await manager.engine.scope.resetCollection(engineName, {
				// Cancel queries at the engine's guarded pre-drop seam. If a reset ever
				// returns needs-confirmation, the live query remains registered.
				beforeDrop: staleCollection ? () => manager.onCollectionReset(staleCollection) : undefined,
			});
			if (outcome === 'reset') {
				const resetSubject = (
					manager.localDB as unknown as {
						reset$?: { next(value: unknown): void };
					}
				).reset$;
				resetSubject?.next({ name: collectionName });
			}
			return { collectionName, outcome };
		},
		[manager]
	);

	const clear = React.useCallback(async (): Promise<CollectionResetResult[]> => {
		const collectionNames: CollectionKey[] =
			key === 'products' ? ['variations', 'products'] : [key];
		const results: CollectionResetResult[] = [];
		for (const collectionName of collectionNames) {
			const result = await resetOne(collectionName);
			results.push(result);
			if (result.outcome === 'needs-confirmation') break;
		}
		return results;
	}, [key, resetOne]);

	const clearAndSync = React.useCallback(async (): Promise<void> => {
		logger.debug('clearAndSync: starting', { context: { key } });
		const results = await clear();
		const pendingConfirmation = results.find((result) => result.outcome === 'needs-confirmation');
		if (pendingConfirmation) {
			logger.warn('clearAndSync: reset needs confirmation', {
				context: { collectionName: pendingConfirmation.collectionName },
			});
			return;
		}
		await manager.engine.sync('scheduler-drain');
		logger.debug('clearAndSync: complete', { context: { key } });
	}, [clear, key, manager]);

	return { clear, clearAndSync };
};
