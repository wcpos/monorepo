import { prepareCollectionResetRefill } from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';

import type { RxDatabase } from 'rxdb';

/**
 * The refill half of the reset funnel must SEED every cleared collection's
 * re-download path explicitly. Catalog collections refill via the rewound
 * change-signal cursor, but the seeds below are what make the refill immediate
 * (and for orders — which the change signal does not cover at all — the seed
 * is the only refill short of waiting for the 5-minute window lane).
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

	it('seeds the order window when orders were reset', async () => {
		const syncCalls = await refillSyncCalls(['orders']);
		expect(syncCalls).toContain('order-window-seed');
		expect(syncCalls[syncCalls.length - 1]).toBe('scheduler-drain');
	});

	it('seeds the product browse window when products were reset', async () => {
		const syncCalls = await refillSyncCalls(['variations', 'products']);
		expect(syncCalls).toContain('product-browse-window-seed');
		expect(syncCalls).not.toContain('order-window-seed');
	});

	it('seeds references when a reference collection was reset', async () => {
		const syncCalls = await refillSyncCalls(['products/categories']);
		expect(syncCalls).toContain('reference-seed');
		expect(syncCalls).not.toContain('order-window-seed');
	});
});
