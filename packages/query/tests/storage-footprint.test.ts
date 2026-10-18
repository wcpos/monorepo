import type { UserDatabase } from '@wcpos/database';
import type { StorageFootprint } from '@wcpos/database/measure-storage-types';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { measureStorageFootprint } from '../src/reads/storage-footprint';
import {
	classifyStorageEntries,
	collectionFromEntryName,
	type StorageContext,
} from '../src/reads/storage-footprint';

const ACTIVE_SCOPE = 'pos_v2_abcdefabcdef_s578_c12';
const CONTEXT: StorageContext = {
	activeScopeDbName: ACTIVE_SCOPE,
	storeDbName: 'store_v7_local1',
	userDbName: 'wcposusers_v7',
	knownSiteHashes: new Set(['abcdefabcdef', 'feedfeedfeed']),
};

const entry = (name: string, bytes: number, legacy?: boolean) => ({
	name,
	bytes,
	...(legacy ? { legacy: true } : {}),
});

describe('collectionFromEntryName', () => {
	it('extracts the collection between the exact db name and the version suffix', () => {
		expect(collectionFromEntryName(`rxdb-${ACTIVE_SCOPE}-orders-0`, ACTIVE_SCOPE)).toBe('orders');
		expect(collectionFromEntryName(`rxdb-${ACTIVE_SCOPE}-taxRates-0`, ACTIVE_SCOPE)).toBe(
			'taxRates'
		);
		// '/' round-trips through the on-disk '__' encoding.
		expect(
			collectionFromEntryName('rxdb-store_v7_local1-products__categories-0', 'store_v7_local1')
		).toBe('products/categories');
		// Hyphenated collections keep their full name.
		expect(
			collectionFromEntryName(`rxdb-${ACTIVE_SCOPE}-receipt-email-queue-0`, ACTIVE_SCOPE)
		).toBe('receipt-email-queue');
	});

	it('rejects other databases, including prefix-sharing ones', () => {
		expect(collectionFromEntryName('rxdb-store_v7_local12-orders-0', 'store_v7_local1')).toBeNull();
		expect(collectionFromEntryName('not-rxdb', 'store_v7_local1')).toBeNull();
	});
});

describe('classifyStorageEntries', () => {
	it('splits the active sign-in into data and bookkeeping', () => {
		const breakdown = classifyStorageEntries(
			[
				entry(`rxdb-${ACTIVE_SCOPE}-orders-0`, 100),
				entry(`rxdb-${ACTIVE_SCOPE}-products-0`, 50),
				// Scope-db bookkeeping is not data:
				entry(`rxdb-${ACTIVE_SCOPE}-syncCheckpoints-0`, 7),
				entry(`rxdb-${ACTIVE_SCOPE}-recordMutations-0`, 3),
				entry(`rxdb-${ACTIVE_SCOPE}-_rxdb_internal-0`, 1),
				// The store and user databases hold local bookkeeping:
				entry('rxdb-store_v7_local1-logs-0', 30),
				entry('rxdb-wcposusers_v7-sites-0', 2),
			],
			CONTEXT
		);
		expect(breakdown.activeDataBytes).toBe(150);
		expect(breakdown.bookkeepingBytes).toBe(43);
		expect(breakdown.otherStoresBytes).toBe(0);
		expect(breakdown.orphanedBytes).toBe(0);
		expect(breakdown.unknownBytes).toBe(0);
		expect(breakdown.measuredTotalBytes).toBe(193);
	});

	it('buckets other cashiers, other stores and signed-out sites', () => {
		const breakdown = classifyStorageEntries(
			[
				// Same store, different cashier:
				entry('rxdb-pos_v2_abcdefabcdef_s578_c99-orders-0', 40),
				// Known site, different stores (two collections of one store + one more store):
				entry('rxdb-pos_v2_abcdefabcdef_s600_c12-orders-0', 25),
				entry('rxdb-pos_v2_abcdefabcdef_s600_c12-products-0', 25),
				entry('rxdb-pos_v2_feedfeedfeed_s578_c12-orders-0', 10),
				// Signed-out site — no user-db row explains it:
				entry('rxdb-pos_v2_0000dead0000_s1_c1-orders-0', 60),
			],
			CONTEXT
		);
		expect(breakdown.otherCashiersBytes).toBe(40);
		expect(breakdown.otherStoresBytes).toBe(60);
		expect(breakdown.otherStoresCount).toBe(2);
		expect(breakdown.orphanedBytes).toBe(60);
	});

	it('buckets legacy generations and legacy platform entries as orphaned', () => {
		const breakdown = classifyStorageEntries(
			[
				entry('rxdb-store_v4_3e7dbcdb53-orders-0', 100),
				entry('rxdb-fast_store_v5_3e7dbcdb53-orders-0', 50),
				entry('rxdb-wcposusers_v4-sites-0', 5),
				// Electron legacy SQLite files / native SQLite dir arrive pre-flagged:
				entry('store_v3.sqlite3', 200, true),
			],
			CONTEXT
		);
		expect(breakdown.orphanedBytes).toBe(355);
		expect(breakdown.measuredTotalBytes).toBe(355);
	});

	it('sends current-generation store dbs of other stores to the other-stores bucket', () => {
		const breakdown = classifyStorageEntries(
			[entry('rxdb-store_v7_otherstore-orders-0', 80)],
			CONTEXT
		);
		expect(breakdown.otherStoresBytes).toBe(80);
	});

	it('keeps unclassifiable bytes visible instead of inflating a bucket', () => {
		const breakdown = classifyStorageEntries(
			[entry('rxdb-something_unrecognized-x-0', 9), entry('random-file', 4)],
			CONTEXT
		);
		expect(breakdown.unknownBytes).toBe(13);
		expect(breakdown.measuredTotalBytes).toBe(13);
	});

	it('classifies without an active scope (engine disposed mid-probe)', () => {
		const breakdown = classifyStorageEntries([entry(`rxdb-${ACTIVE_SCOPE}-orders-0`, 100)], {
			...CONTEXT,
			activeScopeDbName: null,
		});
		// No active scope key — the entry is still a known site's scope, so it
		// counts as another store rather than vanishing.
		expect(breakdown.otherStoresBytes).toBe(100);
	});
});

const mockMeasureAppStorage = jest.fn<Promise<StorageFootprint | null>, []>();
const mockSiteHashFor = jest.fn((site: string) =>
	site.includes('/wp-json') ? 'aaaaaaaaaaaa' : 'bbbbbbbbbbbb'
);
const mockSitesExec = jest.fn();

const activeScope = () => ({ database: { name: 'pos_v6_aaaaaaaaaaaa_s1_c1' } });
const mockEngine = {
	active: jest.fn(activeScope),
	ready: Promise.resolve(),
	whenActive: jest.fn(async () => activeScope()),
};
const mockUserDB = {
	name: 'wcposusers_v6',
	sites: { find: () => ({ exec: mockSitesExec }) },
};
const mockStoreDB = { name: 'store_v6_active' };

jest.mock('@wcpos/database', () => ({
	measureAppStorage: () => mockMeasureAppStorage(),
}));
jest.mock('@wcpos/sync-core', () => ({
	...jest.requireActual('@wcpos/sync-core'),
	siteHashFor: (site: string) => mockSiteHashFor(site),
}));

describe('measureStorageFootprint', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSitesExec.mockResolvedValue([
			{
				uuid: 'site-a',
				url: 'https://shop.example.test',
				wp_api_url: 'https://shop.example.test/wp-json/',
			},
		]);
	});
	it('classifies scopes using the same wp_api_url identity as the engine', async () => {
		mockMeasureAppStorage.mockResolvedValue({
			entries: [
				{
					name: 'rxdb-pos_v6_aaaaaaaaaaaa_s2_c1-orders-0',
					bytes: 25,
				},
			],
			estimateBytes: null,
			estimateDetails: null,
			imageCacheBytes: null,
			opaqueCacheEntries: 0,
		});

		const summary = await measureStorageFootprint(
			mockEngine as unknown as RxdbSyncEngine,
			mockUserDB as unknown as UserDatabase,
			mockStoreDB.name
		);

		expect(mockSiteHashFor).toHaveBeenCalledWith('https://shop.example.test/wp-json/');
		expect(summary?.breakdown.otherStoresBytes).toBe(25);
		expect(summary?.breakdown.orphanedBytes).toBe(0);
	});

	it('keeps the headline and unattributed bytes tied to measured storage', async () => {
		mockMeasureAppStorage.mockResolvedValue({
			entries: [
				{ name: 'unrecognized-file', bytes: 2 * 1024 * 1024 },
				{ name: 'rxdb-pos_v6_aaaaaaaaaaaa_s1_c1-orders-0', bytes: 16 * 1024 * 1024 },
			],
			estimateBytes: 2_900 * 1024 * 1024,
			estimateDetails: { caches: 2_800 * 1024 * 1024 },
			imageCacheBytes: 4 * 1024 * 1024,
			opaqueCacheEntries: 1,
		});

		const summary = await measureStorageFootprint(
			mockEngine as unknown as RxdbSyncEngine,
			mockUserDB as unknown as UserDatabase,
			mockStoreDB.name
		);

		expect(summary).toMatchObject({
			totalBytes: 22 * 1024 * 1024,
			cachedImagesBytes: 4 * 1024 * 1024,
			browserEstimateBytes: 2_900 * 1024 * 1024,
			unattributedBytes: 2 * 1024 * 1024,
		});
	});

	it('returns null when the platform cannot measure storage', async () => {
		mockMeasureAppStorage.mockResolvedValue(null);
		expect(
			await measureStorageFootprint(
				mockEngine as unknown as RxdbSyncEngine,
				mockUserDB as unknown as UserDatabase,
				mockStoreDB.name
			)
		).toBeNull();
	});
});
