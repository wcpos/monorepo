import { waitFor } from '@testing-library/react';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { observeEngineQuery } from '../src/engine-query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineProduct,
} from './helpers/engine';

import type { RxDatabase } from 'rxdb';

describe('observeEngineQuery', () => {
	it('runs the real products query after null-to-live and database-identity transitions', async () => {
		const database = await createEngineDatabase(['products']);
		await database.collections.products.insert(
			engineProduct({ uuid: 'seeded-product', id: 1, name: 'Seeded product' })
		);
		const pending = createPendingFakeEngine(database);
		const listeners = new Set<(current: RxDatabase | null) => void>();
		pending.engine.db$ = (listener) => {
			listeners.add(listener);
			listener(null);
			return () => listeners.delete(listener);
		};
		// Model two scope-database identities exposing the same real RxCollection.
		// Collection identity alone must not suppress the second database binding.
		const firstDatabase = { collections: database.collections } as RxDatabase;
		const secondDatabase = { collections: database.collections } as RxDatabase;
		const counts: number[] = [];
		const subscription = observeEngineQuery(pending.engine, 'en', {
			collection: 'products',
			selector: { stock_status: 'instock' },
		}).subscribe((result) => counts.push(result.count));

		try {
			expect(counts).toEqual([0]);
			listeners.forEach((listener) => listener(firstDatabase));
			await waitFor(() => expect(counts.filter((count) => count === 1)).toHaveLength(1));

			listeners.forEach((listener) => listener(secondDatabase));
			await waitFor(() => expect(counts.filter((count) => count === 1)).toHaveLength(2));
		} finally {
			subscription.unsubscribe();
			pending.open();
			await database.close();
		}
	});

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
