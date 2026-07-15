import {
	getFastStoreDatabaseName,
	getStoreDatabaseName,
	getUserDatabaseName,
	isFastStoreDatabaseName,
	isKnownAppDatabaseName,
	isStoreDatabaseName,
} from './database-names';

describe('database name helpers', () => {
	it('returns the current database names', () => {
		expect(getUserDatabaseName()).toBe('wcposusers_v4');
		expect(getStoreDatabaseName('abc123')).toBe('store_v4_abc123');
		expect(getFastStoreDatabaseName('abc123')).toBe('fast_store_v5_abc123');
	});

	it('matches store and fast-store database names from every generation', () => {
		expect(isStoreDatabaseName('store_v2_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v3_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v4_abc123')).toBe(true);
		expect(isStoreDatabaseName('fast_store_v3_abc123')).toBe(false);

		expect(isFastStoreDatabaseName('fast_store_v3_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v4_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v5_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('store_v2_abc123')).toBe(false);
	});

	it('matches app database names from every generation', () => {
		expect(isKnownAppDatabaseName('wcposusers_v2')).toBe(true);
		expect(isKnownAppDatabaseName('wcposusers_v3')).toBe(true);
		expect(isKnownAppDatabaseName('wcposusers_v4')).toBe(true);
		expect(isKnownAppDatabaseName('store_v2_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('store_v3_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('store_v4_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('fast_store_v3_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('fast_store_v4_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('fast_store_v5_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('temporary')).toBe(false);
	});
});
