import {
	declareRequirements,
	prepareCollectionResetRefill,
	registerActiveBinding,
	requirementsForQuery,
} from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';

import type { RxDatabase } from 'rxdb';

/**
 * The requirement bridge translates legacy Mango params into the engine's
 * three demand shapes (targeted-records / search / order query) — ADR 0027.
 * These tests pin the translation rules the POS relies on.
 */
describe('requirementsForQuery', () => {
	it('returns no demand for unmapped collections', () => {
		expect(
			requirementsForQuery({ id: 'q', collectionName: 'nope', selector: undefined, limit: 10 })
		).toEqual([]);
	});

	it('maps finite id selectors to targeted-records', () => {
		const inSelector = requirementsForQuery({
			id: 'q',
			collectionName: 'products',
			selector: { id: { $in: [1, '2', 'junk'] } },
			limit: 10,
		});
		expect(inSelector).toEqual([
			{ id: 'q:targeted', collection: 'products', kind: 'targeted-records', wooIds: [1, 2] },
		]);

		const eqSelector = requirementsForQuery({
			id: 'q',
			collectionName: 'customers',
			selector: { id: { $eq: 7 } },
			limit: undefined,
		});
		expect(eqSelector[0]).toMatchObject({ kind: 'targeted-records', wooIds: [7] });

		const bareId = requirementsForQuery({
			id: 'q',
			collectionName: 'variations',
			selector: { id: '42' },
			limit: undefined,
		});
		expect(bareId[0]).toMatchObject({ wooIds: [42] });
	});

	it('drops unusable id selectors instead of guessing', () => {
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { id: { $in: ['junk'] } },
				limit: 10,
			})
		).toEqual([]);
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { id: 'junk' },
				limit: 10,
			})
		).toEqual([]);
	});

	it('maps search terms for searchable collections only', () => {
		const products = requirementsForQuery({
			id: 'q',
			collectionName: 'products',
			selector: { search: 'mug' },
			limit: 25,
			priority: 5,
			forceRefresh: true,
		});
		expect(products).toEqual([
			{
				id: 'q:search',
				collection: 'products',
				kind: 'search',
				term: 'mug',
				limit: 25,
				priority: 5,
				forceRefresh: true,
			},
		]);

		// taxes are not a search collection — a search term creates no remote demand
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'taxes',
				selector: { search: 'GST' },
				limit: 10,
			})
		).toEqual([]);
	});

	it('maps unbounded orders browse to a bounded query descriptor', () => {
		const plain = requirementsForQuery({
			id: 'q',
			collectionName: 'orders',
			selector: undefined,
			limit: undefined,
		});
		expect(plain).toEqual([
			{
				id: 'q:orders-query',
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:browser:status=all:search=:limit=10',
			},
		]);

		const filtered = requirementsForQuery({
			id: 'q',
			collectionName: 'orders',
			selector: { status: { $eq: 'processing' }, search: 'jane' },
			limit: 9999,
		});
		// status comes from $eq, the limit is capped at the browse-lane max (200)
		expect(filtered[0]).toMatchObject({
			queryKey: 'orders:browser:status=processing:search=jane:limit=200',
		});
	});

	it('creates no demand for unbounded browse of non-order collections', () => {
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { stock_status: 'instock' },
				limit: 10,
			})
		).toEqual([]);
	});
});

describe('declareRequirements / registerActiveBinding / reset refill', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	it('declares requirements and swallows search rejections', async () => {
		const engine = createFakeEngine(database);
		engine.searchFailure = new Error('offline');
		const handles = declareRequirements(engine as never, [
			{ id: 'a', collection: 'products', kind: 'search', term: 'mug' },
			{ id: 'b', collection: 'products', kind: 'targeted-records', wooIds: [1] },
		]);
		expect(handles).toHaveLength(2);
		expect(engine.requireCalls.map((r) => r.kind)).toEqual(['search', 'targeted-records']);
		// the rejected search handle must not produce an unhandled rejection
		await expect(handles[1].ready).resolves.toMatchObject({ action: 'serve-local' });
	});

	it('re-declares registered bindings (force-refreshed) after a reset', async () => {
		const engine = createFakeEngine(database);
		const unregister = registerActiveBinding(engine as never, {
			id: 'grid',
			collectionName: 'products',
			selector: { id: { $in: [1, 2] } },
			limit: 10,
		});

		const refill = prepareCollectionResetRefill(engine as never, ['products']);
		await refill();

		const targeted = engine.requireCalls.find((r) => r.kind === 'targeted-records');
		expect(targeted).toMatchObject({
			id: 'grid:collection-reset:targeted',
			collection: 'products',
			forceRefresh: true,
			priority: 1000,
			wooIds: [1, 2],
		});

		// once unregistered, a later reset re-declares nothing for the binding
		unregister();
		const engine2 = createFakeEngine(database);
		await prepareCollectionResetRefill(engine2 as never, ['products'])();
		expect(engine2.requireCalls.filter((r) => r.kind === 'targeted-records')).toEqual([]);
	});

	it('synthesizes the taxRates refresh on a taxes reset', async () => {
		const engine = createFakeEngine(database);
		await prepareCollectionResetRefill(engine as never, ['taxes'])();
		expect(engine.requireCalls).toEqual([
			{
				id: 'taxRates:collection-reset',
				collection: 'taxRates',
				kind: 'refresh',
				forceRefresh: true,
				priority: 1000,
			},
		]);
	});
});
