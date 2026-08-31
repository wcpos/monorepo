import { waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { startSearchReadiness } from '../src/search-readiness';
import { createEngineDatabase, createFakeEngine, engineProduct } from '../src/testing';

const searchLogger = getLogger(['wcpos', 'query', 'search']);
const searchError = jest.mocked(searchLogger.error);

/** Fast cadence so a test observes several audit ticks inside its own timeout. */
const TEST_TIMINGS = {
	warmupDelayMs: 5,
	auditInitialDelayMs: 20,
	auditIntervalMs: 20,
	auditFindTimeoutMs: 100,
};

describe('startSearchReadiness', () => {
	beforeEach(() => searchError.mockClear());

	it('warms the product and variation indexes without waiting for a search', async () => {
		const database = await createEngineDatabase(['products', 'variations']);
		const engine = createFakeEngine(database);
		const stub = { collection: { $: of(null) }, find: async () => [] };
		const initProducts = jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue(stub as never);
		const initVariations = jest
			.spyOn(database.collections.variations, 'initSearch')
			.mockResolvedValue(stub as never);

		const dispose = startSearchReadiness({
			engine,
			locale: 'warmup-locale',
			timings: TEST_TIMINGS,
		});
		try {
			await waitFor(() => expect(initProducts).toHaveBeenCalled());
			await waitFor(() => expect(initVariations).toHaveBeenCalled());
			expect(initProducts).toHaveBeenCalledWith(
				'warmup-locale',
				expect.objectContaining({
					searchFields: ['name', 'sku', 'barcode'],
					documentSnapshot: expect.any(Function),
				})
			);
		} finally {
			dispose();
			await database.close();
		}
	});

	it('leaves a healthy index alone: the sampled document is findable by its own tokens', async () => {
		const database = await createEngineDatabase(['products', 'variations']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'healthy-sample', id: 1, name: 'Coffee Grinder' })
		);
		const sample = await database.collections.products.findOne('healthy-sample').exec();
		if (!sample) throw new Error('missing healthy fixture');
		const find = jest.fn(async () => [sample]);
		jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find } as never);
		jest
			.spyOn(database.collections.variations, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find: async () => [] } as never);
		const recreateSearch = jest.fn();
		Object.assign(database.collections.products, { recreateSearch });

		const dispose = startSearchReadiness({
			engine,
			locale: 'healthy-audit',
			timings: TEST_TIMINGS,
		});
		try {
			await waitFor(() => expect(find).toHaveBeenCalled(), { timeout: 2000 });
			// Give the streak logic a second tick to (wrongly) accumulate.
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(recreateSearch).not.toHaveBeenCalled();
			expect(searchError).not.toHaveBeenCalled();
		} finally {
			dispose();
			await database.close();
		}
	});

	it('detects a false miss after misses on two distinct documents and rebuilds once', async () => {
		const database = await createEngineDatabase(['products', 'variations']);
		const engine = createFakeEngine(database);
		// Two documents: the streak only extends on a DIFFERENT missed document, so a
		// single-document store can never reach the threshold by resampling itself.
		await database.collections.products.bulkInsert([
			engineProduct({ uuid: 'missed-sample', id: 1, name: 'Coffee Grinder' }),
			engineProduct({ uuid: 'missed-sibling', id: 2, name: 'Tea Strainer' }),
		]);
		// The index never returns the document it should contain — a false miss.
		const find = jest.fn(async () => []);
		jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find } as never);
		jest
			.spyOn(database.collections.variations, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find: async () => [] } as never);
		const recreateSearch = jest.fn().mockResolvedValue(null);
		Object.assign(database.collections.products, { recreateSearch });

		const dispose = startSearchReadiness({
			engine,
			locale: 'false-miss-audit',
			timings: TEST_TIMINGS,
		});
		try {
			await waitFor(() => expect(recreateSearch).toHaveBeenCalledTimes(1), { timeout: 2000 });
			expect(searchError).toHaveBeenCalledWith(
				'Search index cannot find an indexed document by its own tokens',
				expect.objectContaining({
					code: ERROR_CODES.SEARCH_INDEX_FALSE_MISS,
					context: expect.objectContaining({
						collection: 'products',
						locale: 'false-miss-audit',
					}),
				})
			);
			// The once-per-session guard: further failing audits log but never
			// order a second rebuild.
			await waitFor(
				() =>
					expect(
						searchError.mock.calls.filter(
							([, options]) => (options?.context as { alreadyRebuilt?: boolean })?.alreadyRebuilt
						).length
					).toBeGreaterThan(0),
				{ timeout: 2000 }
			);
			expect(recreateSearch).toHaveBeenCalledTimes(1);
		} finally {
			dispose();
			await database.close();
		}
	});

	it('never rebuilds from repeated misses of the same single document', async () => {
		const database = await createEngineDatabase(['products', 'variations']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'only-doc', id: 1, name: 'Coffee Grinder' })
		);
		const find = jest.fn(async () => []);
		jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find } as never);
		jest
			.spyOn(database.collections.variations, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find: async () => [] } as never);
		const recreateSearch = jest.fn();
		Object.assign(database.collections.products, { recreateSearch });

		const dispose = startSearchReadiness({
			engine,
			locale: 'single-doc-audit',
			timings: TEST_TIMINGS,
		});
		try {
			// Let the audit resample the same document several times over.
			await waitFor(() => expect(find.mock.calls.length).toBeGreaterThanOrEqual(4), {
				timeout: 2000,
			});
			expect(recreateSearch).not.toHaveBeenCalled();
			expect(searchError).not.toHaveBeenCalled();
		} finally {
			dispose();
			await database.close();
		}
	});

	it('abstains when the index cannot answer in time — not ready is not a false miss', async () => {
		const database = await createEngineDatabase(['products', 'variations']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'not-ready-sample', id: 1, name: 'Coffee Grinder' })
		);
		// A stalled pipeline: find() never settles.
		const find = jest.fn(() => new Promise<never>(() => undefined));
		jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find } as never);
		jest
			.spyOn(database.collections.variations, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find: async () => [] } as never);
		const recreateSearch = jest.fn();
		Object.assign(database.collections.products, { recreateSearch });

		const dispose = startSearchReadiness({
			engine,
			locale: 'not-ready-audit',
			timings: TEST_TIMINGS,
		});
		try {
			await waitFor(() => expect(find.mock.calls.length).toBeGreaterThanOrEqual(2), {
				timeout: 2000,
			});
			expect(recreateSearch).not.toHaveBeenCalled();
			expect(searchError).not.toHaveBeenCalled();
		} finally {
			dispose();
			await database.close();
		}
	});
});
