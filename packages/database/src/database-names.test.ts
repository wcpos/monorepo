import {
	APP_DATABASE_PREFIXES,
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
});
