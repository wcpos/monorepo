import {
	getStoreDatabaseName,
	getUserDatabaseName,
	isLegacyAppDatabaseName,
} from './database-names';
import { DATABASE_GENERATION as NATIVE_DATABASE_GENERATION } from './database-generation.native';

jest.mock('./database-generation', () => ({
	DATABASE_GENERATION: 'v9',
}));

describe('native database generation', () => {
	it('uses v9 names for a fresh native database boot', () => {
		expect(NATIVE_DATABASE_GENERATION).toBe('v9');
		expect(getUserDatabaseName()).toBe('wcposusers_v9');
		expect(getStoreDatabaseName('abc123')).toBe('store_v9_abc123');
	});

	it.each([
		'wcposusers_v6',
		'store_v6_abc123',
		'fast_store_v6_abc123',
		'wcposusers_v8',
		'store_v8_abc123',
		'fast_store_v8_abc123',
		'wcposusers_v7',
		'store_v7_abc123',
		'fast_store_v7_abc123',
	])('classifies the previous native generation %s as legacy', (name) => {
		expect(isLegacyAppDatabaseName(name)).toBe(true);
	});
});

it.each(['wcposusers_v9', 'store_v9_abc123', 'fast_store_v9_abc123'])(
	'preserves current native %s',
	(name) => {
		expect(isLegacyAppDatabaseName(name)).toBe(false);
	}
);
