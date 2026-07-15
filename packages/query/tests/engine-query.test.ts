import { waitFor } from '@testing-library/react';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { observeEngineQuery } from '../src/engine-query';
import { createEngineDatabase, createFakeEngine, engineProduct } from './helpers/engine';

describe('observeEngineQuery', () => {
	it('rebinds when db$ re-emits the same database with a replaced collection', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		const listeners = new Set<(current: typeof database | null) => void>();
		engine.db$ = (listener) => {
			listeners.add(listener);
			listener(database);
			return () => listeners.delete(listener);
		};
		await database.collections.products.insert(
			engineProduct({ uuid: 'before-reset', id: 1, name: 'Before reset' })
		);
		let residentIds: string[] = [];
		const subscription = observeEngineQuery(engine, 'en', {
			collection: 'products',
		}).subscribe((result) => {
			residentIds = result.hits.map((hit) => hit.id);
		});

		try {
			await waitFor(() => expect(residentIds).toEqual(['before-reset']));

			await database.collections.products.remove();
			await database.addCollections({
				products: engineSyncCollectionCreators().products as never,
			});
			listeners.forEach((listener) => listener(database));
			await database.collections.products.insert(
				engineProduct({ uuid: 'after-reset', id: 2, name: 'After reset' })
			);

			await waitFor(() => expect(residentIds).toEqual(['after-reset']));
		} finally {
			subscription.unsubscribe();
			await database.close();
		}
	});
});
