import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	getActiveBarcodeSelectors,
	setActiveBarcodeSelectors,
	type SyncEvent,
} from '@wcpos/sync-core';

import { createRxdbSyncEngine } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

const seedPosBootstrapLanes = vi.hoisted(() => vi.fn());

vi.mock('./scheduler/rx-pos-bootstrap-seeder', () => ({ seedPosBootstrapLanes }));

setPremiumFlag();

let identity = 0;

function configResponse(): Response {
	return Response.json({
		fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
		barcode_fields: {
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
			tax_rates: [],
		},
	});
}

describe('scope-open barcode selector hydration', () => {
	beforeEach(() => {
		identity += 1;
		setActiveBarcodeSelectors('products', []);
		setActiveBarcodeSelectors('variations', []);
		seedPosBootstrapLanes.mockReset();
		seedPosBootstrapLanes.mockResolvedValue(undefined);
	});

	it('hydrates selectors before bootstrap seeding', async () => {
		const order: string[] = [];
		const selectorsAtSeed: { products: string[]; variations: string[] }[] = [];
		seedPosBootstrapLanes.mockImplementation(async () => {
			order.push('seed');
			selectorsAtSeed.push({
				products: [...getActiveBarcodeSelectors('products')],
				variations: [...getActiveBarcodeSelectors('variations')],
			});
		});
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async (_url, init) => {
					order.push('hydrate');
					expect(init?.signal).toBeDefined();
					return configResponse();
				},
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		await engine.ready;

		expect(order).toEqual(['hydrate', 'seed']);
		expect(selectorsAtSeed).toEqual([
			{ products: ['global_unique_id'], variations: ['meta_data:_barcode'] },
		]);
		await engine.dispose();
	});

	it('continues bootstrap and preserves selectors when hydration fails', async () => {
		const diagnostics: SyncEvent[] = [];
		setActiveBarcodeSelectors('products', ['existing-product']);
		setActiveBarcodeSelectors('variations', ['existing-variation']);
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async () => {
					throw new Error('config unavailable');
				},
				diagnostics: (event) => diagnostics.push(event),
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		await expect(engine.ready).resolves.toBeDefined();
		expect(seedPosBootstrapLanes).toHaveBeenCalledOnce();
		// A previous engine's carriers (set above) must NOT survive into this
		// engine's failed hydration — the scope-open reset leaves the registry
		// empty so scans fall back online instead of using the wrong site's
		// carriers (#869 review).
		expect(getActiveBarcodeSelectors('products')).toEqual([]);
		expect(getActiveBarcodeSelectors('variations')).toEqual([]);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				type: 'engine.barcode-selector-hydrate-failed',
				level: 'debug',
			})
		);
		await engine.dispose();
	});

	it('clears the registry on dispose so a later engine cannot inherit carriers', async () => {
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async () => configResponse(),
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);
		await engine.ready;
		expect(getActiveBarcodeSelectors('products')).toEqual(['global_unique_id']);
		expect(getActiveBarcodeSelectors('variations')).toEqual(['meta_data:_barcode']);

		await engine.dispose();

		expect(getActiveBarcodeSelectors('products')).toEqual([]);
		expect(getActiveBarcodeSelectors('variations')).toEqual([]);
	});
});
