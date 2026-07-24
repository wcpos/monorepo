import {
	APP_DATABASE_PREFIXES,
	containsScopeDatabaseName,
	getFastStoreDatabaseName,
	getStoreDatabaseName,
	getUserDatabaseName,
	isFastStoreDatabaseName,
	isKnownAppDatabaseName,
	isLegacyAppDatabaseName,
	isStoreDatabaseName,
	LEGACY_FAST_STORE_PREFIXES,
	LEGACY_STORE_PREFIXES,
	LEGACY_USER_DATABASE_NAMES,
} from './database-names';
import { isKnownAppIndexedDbDatabase, isKnownAppOpfsEntry } from './clear-all-db.web';

describe('database name helpers', () => {
	it('returns the current database names', () => {
		expect(getUserDatabaseName()).toBe('wcposusers_v6');
		expect(getStoreDatabaseName('abc123')).toBe('store_v6_abc123');
		expect(getFastStoreDatabaseName('abc123')).toBe('fast_store_v6_abc123');
	});

	it('exposes the exact legacy database generations', () => {
		expect(LEGACY_USER_DATABASE_NAMES).toEqual(['wcposusers_v2', 'wcposusers_v3', 'wcposusers_v4']);
		expect(LEGACY_STORE_PREFIXES).toEqual(['store_v2_', 'store_v3_', 'store_v4_']);
		expect(LEGACY_FAST_STORE_PREFIXES).toEqual([
			'fast_store_v3_',
			'fast_store_v4_',
			'fast_store_v5_',
		]);
	});

	it.each([
		'wcposusers_v2',
		'wcposusers_v3-sites-0',
		'wcposusers_v4',
		'store_v2_abc123',
		'store_v3_abc123',
		'store_v4_abc123',
		'fast_store_v3_abc123',
		'fast_store_v4_abc123',
		'fast_store_v5_abc123',
	])('classifies %s as legacy', (name) => {
		expect(isLegacyAppDatabaseName(name)).toBe(true);
	});

	it.each([
		'wcposusers_v6',
		'wcposusers_v6-sites-0',
		'store_v6_abc123',
		'fast_store_v6_abc123',
		'temporary',
	])('does not classify %s as legacy', (name) => {
		expect(isLegacyAppDatabaseName(name)).toBe(false);
	});

	it('matches store and fast-store database names from every generation', () => {
		expect(isStoreDatabaseName('store_v2_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v3_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v4_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v6_abc123')).toBe(true);
		expect(isStoreDatabaseName('fast_store_v3_abc123')).toBe(false);

		expect(isFastStoreDatabaseName('fast_store_v3_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v4_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v5_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v6_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('store_v2_abc123')).toBe(false);
	});

	it('keeps clear-all coverage for every database generation', () => {
		const knownNames = [
			...LEGACY_USER_DATABASE_NAMES,
			'wcposusers_v6',
			...LEGACY_STORE_PREFIXES.map((prefix) => `${prefix}abc123`),
			'store_v6_abc123',
			...LEGACY_FAST_STORE_PREFIXES.map((prefix) => `${prefix}abc123`),
			'fast_store_v6_abc123',
		];

		expect(knownNames.every(isKnownAppDatabaseName)).toBe(true);
		expect(APP_DATABASE_PREFIXES).toEqual(
			expect.arrayContaining(['wcposusers_', 'store_v6_', 'fast_store_v6_'])
		);
		expect(isKnownAppDatabaseName('temporary')).toBe(false);
	});

	// Mirrors scopeDatabaseName() in packages/sync-core/src/storeScopeIdentity.ts:
	// `pos_v<generation>_<siteHash12>_s<store>_c<cashier>`.
	const SCOPE_DB = 'pos_v2_0123456789ab_s0_c1';

	it.each([
		SCOPE_DB,
		`${SCOPE_DB}_test-namespace`,
		`rxdb-dexie-${SCOPE_DB}--0--orders`,
		`rxdb-${SCOPE_DB}`,
	])('finds scope database names in %s', (name) => {
		expect(containsScopeDatabaseName(name)).toBe(true);
	});

	it.each([
		'pos_v2_abc123', // fragment only — not the full site/store/cashier shape
		'reports_pos_v2_cache', // unrelated same-origin storage must never match
		'pos_v2_0123456789ab', // missing store and cashier components
		'pos_v2_0123456789ab_s0', // missing cashier component
		'pos_v2_0123456789XY_s0_c1', // site hash must be lowercase hex
	])('does not treat %s as a scope database name', (name) => {
		expect(containsScopeDatabaseName(name)).toBe(false);
	});

	it('keeps known app names distinct from unrelated databases', () => {
		expect(isKnownAppDatabaseName('wcposusers_v14')).toBe(true);
		expect(isKnownAppDatabaseName('random-db')).toBe(false);
		expect(containsScopeDatabaseName('random-db')).toBe(false);
	});

	it('classifies scope databases for both web storage filters', () => {
		expect(isKnownAppIndexedDbDatabase(SCOPE_DB)).toBe(true);
		expect(isKnownAppOpfsEntry(`rxdb-${SCOPE_DB}`)).toBe(true);
		expect(isKnownAppIndexedDbDatabase('reports_pos_v2_cache')).toBe(false);
		expect(isKnownAppOpfsEntry('reports_pos_v2_cache')).toBe(false);
	});
});
