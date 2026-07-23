import {
	getFastStoreDatabaseName,
	getStoreDatabaseName,
	getUserDatabaseName,
	isLegacyAppDatabaseName,
} from './database-names';
import { DATABASE_GENERATION as NATIVE_DATABASE_GENERATION } from './database-generation.native';

jest.mock('./database-generation', () => ({
	DATABASE_GENERATION: 'v7',
}));

describe('native database generation', () => {
	it('uses v7 names for a fresh native database boot', () => {
		expect(NATIVE_DATABASE_GENERATION).toBe('v7');
		expect(getUserDatabaseName()).toBe('wcposusers_v7');
		expect(getStoreDatabaseName('abc123')).toBe('store_v7_abc123');
		expect(getFastStoreDatabaseName('abc123')).toBe('fast_store_v7_abc123');
	});

	it.each(['wcposusers_v6', 'store_v6_abc123', 'fast_store_v6_abc123'])(
		'classifies the previous native generation %s as legacy',
		(name) => {
			expect(isLegacyAppDatabaseName(name)).toBe(true);
		}
	);
});
