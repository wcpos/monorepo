import {
	classifyStorageEntries,
	collectionFromEntryName,
	type StorageContext,
} from './storage-footprint-logic';

const ACTIVE_SCOPE = 'pos_v2_abcdefabcdef_s578_c12';
const CONTEXT: StorageContext = {
	activeScopeDbName: ACTIVE_SCOPE,
	storeDbName: 'store_v6_local1',
	userDbName: 'wcposusers_v6',
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
			collectionFromEntryName('rxdb-store_v6_local1-products__categories-0', 'store_v6_local1')
		).toBe('products/categories');
		// Hyphenated collections keep their full name.
		expect(
			collectionFromEntryName(
				`rxdb-${ACTIVE_SCOPE}-products-search-v2-en_flexsearch-0`,
				ACTIVE_SCOPE
			)
		).toBe('products-search-v2-en_flexsearch');
	});

	it('rejects other databases, including prefix-sharing ones', () => {
		expect(collectionFromEntryName('rxdb-store_v6_local12-orders-0', 'store_v6_local1')).toBeNull();
		expect(collectionFromEntryName('not-rxdb', 'store_v6_local1')).toBeNull();
	});
});

describe('classifyStorageEntries', () => {
	it('splits the active sign-in into data, search indexes and bookkeeping', () => {
		const breakdown = classifyStorageEntries(
			[
				entry(`rxdb-${ACTIVE_SCOPE}-orders-0`, 100),
				entry(`rxdb-${ACTIVE_SCOPE}-products-0`, 50),
				// Scope-db bookkeeping is not data:
				entry(`rxdb-${ACTIVE_SCOPE}-syncCheckpoints-0`, 7),
				entry(`rxdb-${ACTIVE_SCOPE}-recordMutations-0`, 3),
				entry(`rxdb-${ACTIVE_SCOPE}-_rxdb_internal-0`, 1),
				// Search indexes, wherever they live:
				entry(`rxdb-${ACTIVE_SCOPE}-products-search-v2-en_flexsearch-0`, 20),
				entry('rxdb-store_v6_local1-logs-search-v2-en_flexsearch-0', 5),
				// The store and user databases hold local bookkeeping:
				entry('rxdb-store_v6_local1-logs-0', 30),
				entry('rxdb-wcposusers_v6-sites-0', 2),
			],
			CONTEXT
		);
		expect(breakdown.activeDataBytes).toBe(150);
		expect(breakdown.searchIndexBytes).toBe(25);
		expect(breakdown.bookkeepingBytes).toBe(43);
		expect(breakdown.otherStoresBytes).toBe(0);
		expect(breakdown.orphanedBytes).toBe(0);
		expect(breakdown.unknownBytes).toBe(0);
		expect(breakdown.measuredTotalBytes).toBe(218);
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
			[entry('rxdb-store_v6_otherstore-orders-0', 80)],
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
