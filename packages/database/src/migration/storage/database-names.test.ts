import {
	getFastStoreDatabaseNames,
	getStoreDatabaseNames,
	getUserDatabaseNames,
	isFastStoreDatabaseName,
	isKnownAppDatabaseName,
	isStoreDatabaseName,
	USER_DATABASE_NAMES,
} from './database-names';

describe('database name helpers', () => {
	it('returns the user database names', () => {
		expect(USER_DATABASE_NAMES).toEqual({
			oldName: 'wcposusers_v2',
			newName: 'wcposusers_v3',
		});
		expect(getUserDatabaseNames()).toBe(USER_DATABASE_NAMES);
	});

	it('returns the store database names', () => {
		expect(getStoreDatabaseNames('abc123')).toEqual({
			oldName: 'store_v2_abc123',
			newName: 'store_v3_abc123',
		});
	});

	it('returns the fast store database names', () => {
		expect(getFastStoreDatabaseNames('abc123')).toEqual({
			oldName: 'fast_store_v3_abc123',
			newName: 'fast_store_v4_abc123',
		});
	});

	it('matches store and fast-store database names by prefix', () => {
		expect(isStoreDatabaseName('store_v2_abc123')).toBe(true);
		expect(isStoreDatabaseName('store_v3_abc123')).toBe(true);
		expect(isStoreDatabaseName('fast_store_v3_abc123')).toBe(false);

		expect(isFastStoreDatabaseName('fast_store_v3_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('fast_store_v4_abc123')).toBe(true);
		expect(isFastStoreDatabaseName('store_v2_abc123')).toBe(false);
	});

	it('matches app database names by prefix', () => {
		expect(isKnownAppDatabaseName('wcposusers_v2')).toBe(true);
		expect(isKnownAppDatabaseName('wcposusers_v3')).toBe(true);
		expect(isKnownAppDatabaseName('store_v2_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('store_v3_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('fast_store_v3_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('fast_store_v4_abc123')).toBe(true);
		expect(isKnownAppDatabaseName('temporary')).toBe(false);
	});
});
