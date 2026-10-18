import {
	resetCollectionsAndRefill,
	resetRefillRequirements,
	runResetRefill,
} from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from '../src/testing';

import type { RxDatabase } from 'rxdb';

/**
 * The refill half of the reset funnel re-arms each collection's normal filling
 * policy: greedy references and the product browse window seed immediately;
 * customers resume on-demand + idle trickle, and orders wait for view demand
 * or their periodic window lane.
 */
describe('runResetRefill seeding', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	async function refillSyncCalls(collectionNames: string[]): Promise<(string | undefined)[]> {
		const engine = createFakeEngine(database);
		await runResetRefill(engine as never, collectionNames);
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

	it('seeds the product browse window for a standalone variations reset', async () => {
		// The Health page can reset variations alone; without the seed the drain would
		// have no work that re-downloads the cleared collection.
		const syncCalls = await refillSyncCalls(['variations']);
		expect(syncCalls).toEqual(['product-browse-window-seed', 'scheduler-drain']);
	});

	// NOT the `reference-seed` maintenance lane: that lane gates on local residents (#952),
	// and a reset has just emptied the collection, so the lane would skip the very refill it
	// was asked for. The refill declares a forced refresh requirement instead.
	it('refills a reset reference collection through a forced refresh, not the reference-seed lane', async () => {
		const engine = createFakeEngine(database);
		await runResetRefill(engine as never, ['products/categories']);

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

	it('keeps tax refill binding-independent and relies on reset-cleared engine dedupe', () => {
		expect(resetRefillRequirements(['taxes'])).toEqual([
			{
				id: 'taxRates:collection-reset',
				collection: 'taxRates',
				kind: 'refresh',
				priority: 1000,
			},
		]);
	});
});

it('forces the history walk when refunds are reset', () => {
	expect(resetRefillRequirements(['refunds'])).toEqual([
		{
			id: 'refunds:collection-reset',
			collection: 'refunds',
			kind: 'refresh',
			forceRefresh: true,
			priority: 1000,
		},
	]);
});

describe('resetCollectionsAndRefill', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	it('awaits variations then products before starting refill', async () => {
		const engine = createFakeEngine(database);
		const events: string[] = [];
		jest.spyOn(engine.scope, 'resetCollection').mockImplementation(async (name) => {
			events.push(`reset:${name}`);
			await Promise.resolve();
			events.push(`done:${name}`);
			return 'reset';
		});
		const sync = engine.sync.bind(engine);
		jest.spyOn(engine, 'sync').mockImplementation(async (reason) => {
			events.push(`sync:${reason}`);
			return sync(reason);
		});

		await expect(
			resetCollectionsAndRefill(engine, 'products', { confirmDestroyQueue: true })
		).resolves.toBe('reset');
		expect(engine.scope.resetCollection).toHaveBeenNthCalledWith(1, 'variations', {
			confirmDestroyQueue: true,
		});
		expect(engine.scope.resetCollection).toHaveBeenNthCalledWith(2, 'products', {
			confirmDestroyQueue: true,
		});
		expect(events).toEqual([
			'reset:variations',
			'done:variations',
			'reset:products',
			'done:products',
			'sync:product-browse-window-seed',
			'sync:scheduler-drain',
		]);
	});

	it.each(['categories', 'tags', 'brands', 'taxRates', 'coupons', 'refunds'] as const)(
		'maps %s to its legacy refill name',
		async (name) => {
			const engine = createFakeEngine(database);
			jest.spyOn(engine.scope, 'resetCollection').mockResolvedValue('reset');
			await expect(resetCollectionsAndRefill(engine, name)).resolves.toBe('reset');
			expect(engine.scope.resetCollection).toHaveBeenCalledTimes(1);
			expect(engine.scope.resetCollection).toHaveBeenCalledWith(name, {});
			expect(engine.requireCalls).toEqual([
				{
					id: `${name}:collection-reset`,
					collection: name,
					kind: 'refresh',
					priority: 1000,
					...(name === 'taxRates' ? {} : { forceRefresh: true }),
				},
			]);
			expect(engine.syncCalls).toEqual(['scheduler-drain']);
		}
	);

	it('refills a standalone variations reset without resetting products', async () => {
		const engine = createFakeEngine(database);
		jest.spyOn(engine.scope, 'resetCollection').mockResolvedValue('reset');
		await resetCollectionsAndRefill(engine, 'variations');
		expect(engine.scope.resetCollection).toHaveBeenCalledTimes(1);
		expect(engine.scope.resetCollection).toHaveBeenCalledWith('variations', {});
		expect(engine.syncCalls).toEqual(['product-browse-window-seed', 'scheduler-drain']);
	});

	it.each([undefined, false])(
		'does not implicitly confirm queue destruction (%s)',
		async (confirmDestroyQueue) => {
			const engine = createFakeEngine(database);
			jest.spyOn(engine.scope, 'resetCollection').mockResolvedValue('needs-confirmation');
			await expect(
				resetCollectionsAndRefill(engine, 'products', { confirmDestroyQueue })
			).resolves.toBe('needs-confirmation');
			expect(engine.scope.resetCollection).toHaveBeenCalledTimes(1);
			expect(engine.scope.resetCollection).toHaveBeenCalledWith('variations', {
				confirmDestroyQueue,
			});
			expect(engine.requireCalls).toEqual([]);
			expect(engine.syncCalls).toEqual([]);
		}
	);

	it('does not refill if the second reset needs confirmation', async () => {
		const engine = createFakeEngine(database);
		jest
			.spyOn(engine.scope, 'resetCollection')
			.mockResolvedValueOnce('reset')
			.mockResolvedValueOnce('needs-confirmation');
		await expect(resetCollectionsAndRefill(engine, 'products')).resolves.toBe('needs-confirmation');
		expect(engine.syncCalls).toEqual([]);
		expect(engine.requireCalls).toEqual([]);
	});

	it('propagates a reset failure without resetting more collections or refilling', async () => {
		const engine = createFakeEngine(database);
		const error = new Error('reset failed');
		jest.spyOn(engine.scope, 'resetCollection').mockRejectedValue(error);
		await expect(resetCollectionsAndRefill(engine, 'products')).rejects.toBe(error);
		expect(engine.scope.resetCollection).toHaveBeenCalledTimes(1);
		expect(engine.syncCalls).toEqual([]);
		expect(engine.requireCalls).toEqual([]);
	});

	it('propagates a refill failure', async () => {
		const engine = createFakeEngine(database);
		const error = new Error('refill failed');
		jest.spyOn(engine.scope, 'resetCollection').mockResolvedValue('reset');
		jest.spyOn(engine, 'sync').mockRejectedValue(error);
		await expect(resetCollectionsAndRefill(engine, 'products')).rejects.toBe(error);
	});
});
