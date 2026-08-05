import { prepareCollectionResetRefill } from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';

import type { RxDatabase } from 'rxdb';

/**
 * The refill half of the reset funnel re-arms each collection's normal filling
 * policy: greedy references and the product browse window seed immediately;
 * customers resume on-demand + idle trickle, and orders wait for view demand
 * or their periodic window lane.
 */
describe('prepareCollectionResetRefill seeding', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	async function refillSyncCalls(collectionNames: string[]): Promise<(string | undefined)[]> {
		const engine = createFakeEngine(database);
		const refill = prepareCollectionResetRefill(engine as never, collectionNames);
		await refill();
		return engine.syncCalls;
	}

	it('creates no eager demand when orders were reset', async () => {
		const syncCalls = await refillSyncCalls(['orders']);
		expect(syncCalls).toEqual(['scheduler-drain']);
	});

	it('seeds the product browse window when products were reset', async () => {
		const syncCalls = await refillSyncCalls(['variations', 'products']);
		expect(syncCalls).toEqual(['product-browse-window-seed', 'scheduler-drain']);
	});

	// NOT the `reference-seed` maintenance lane: that lane gates on local residents (#952),
	// and a reset has just emptied the collection, so the lane would skip the very refill it
	// was asked for. The refill declares a forced refresh requirement instead.
	it('refills a reset reference collection through a forced refresh, not the reference-seed lane', async () => {
		const engine = createFakeEngine(database);
		await prepareCollectionResetRefill(engine as never, ['products/categories'])();

		expect(engine.syncCalls).toEqual(['scheduler-drain']);
		expect(engine.requireCalls).toEqual([
			{
				id: 'categories:collection-reset',
				collection: 'categories',
				kind: 'refresh',
				forceRefresh: true,
				priority: 1000,
			},
		]);
	});

	it('creates no eager lane demand when customers were reset', async () => {
		const syncCalls = await refillSyncCalls(['customers']);
		expect(syncCalls).toEqual(['scheduler-drain']);
	});
});
