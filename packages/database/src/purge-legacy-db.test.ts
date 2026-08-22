const mockDeleteLegacySQLiteDirectory = jest.fn();

/**
 * `Documents/SQLite` is expo-sqlite's SHARED directory, not a WCPOS-owned one, so
 * the purge has to name what it removes: legacy WCPOS databases and their
 * `-wal`/`-shm` sidecars, and nothing else. The counted total is databases, not
 * files — it reaches the cashier as "Successfully purged N legacy database
 * entries".
 */
const sqliteEntries = [
	'wcposusers_v4.db',
	'wcposusers_v4.db-wal',
	'wcposusers_v4.db-shm',
	'fast_store_v5_shop.db',
	// Not legacy (`store_v5_` is not a legacy prefix — store goes v3, v4, v6) and
	// not ours. Both must survive.
	'store_v5_shop.db',
	'store_v6_shop.db',
	'some-other-library.db',
].map((name) => ({ name, delete: jest.fn() }));

const opfsEntries = [
	'rxdb-wcposusers_v4-sites-0',
	'rxdb-store_v4_shop-products-0',
	'rxdb-fast_store_v5_shop-orders-0',
	'rxdb-wcposusers_v6-sites-0',
	'rxdb-store_v6_shop-products-0',
	'rxdb-fast_store_v6_shop-orders-0',
	'unrelated',
].map((name) => ({ name, delete: jest.fn() }));

class MockDirectory {
	name: string;
	uri: string;
	exists = true;

	constructor(...parts: ({ uri?: string } | string)[]) {
		this.uri = parts
			.map((part) => (typeof part === 'string' ? part : (part.uri ?? '')))
			.filter(Boolean)
			.join('/');
		this.name = String(parts[parts.length - 1] ?? '');
	}

	list() {
		if (this.uri.includes('.expo-opfs')) {
			return opfsEntries;
		}
		if (this.uri.includes('SQLite')) {
			return sqliteEntries;
		}

		return [];
	}

	delete() {
		mockDeleteLegacySQLiteDirectory(this.uri);
	}
}

jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	Paths: {
		document: { uri: 'document-dir' },
	},
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		error: jest.fn(),
	}),
}));

describe('purgeLegacyDatabases native', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it('deletes only legacy SQLite and OPFS entries, counting databases not files', async () => {
		const { purgeLegacyDatabases } = await import('./purge-legacy-db');

		// 2 legacy SQLite databases (their -wal/-shm sidecars go too, but are not
		// separate databases) + 3 legacy OPFS entries.
		await expect(purgeLegacyDatabases()).resolves.toEqual({
			success: true,
			message: 'Successfully purged 5 legacy database entries',
			databasesDeleted: 5,
		});
		// The shared directory itself is never removed.
		expect(mockDeleteLegacySQLiteDirectory).not.toHaveBeenCalled();
		expect(
			sqliteEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual([
			'wcposusers_v4.db',
			'wcposusers_v4.db-wal',
			'wcposusers_v4.db-shm',
			'fast_store_v5_shop.db',
		]);
		expect(
			opfsEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual([
			'rxdb-wcposusers_v4-sites-0',
			'rxdb-store_v4_shop-products-0',
			'rxdb-fast_store_v5_shop-orders-0',
		]);
	});
});
