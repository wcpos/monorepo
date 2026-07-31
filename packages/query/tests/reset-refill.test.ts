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

	it('seeds references when a reference collection was reset', async () => {
		const syncCalls = await refillSyncCalls(['products/categories']);
		expect(syncCalls).toEqual(['reference-seed', 'scheduler-drain']);
	});

	it('creates no eager lane demand when customers were reset', async () => {
		const syncCalls = await refillSyncCalls(['customers']);
		expect(syncCalls).toEqual(['scheduler-drain']);
	});
});
