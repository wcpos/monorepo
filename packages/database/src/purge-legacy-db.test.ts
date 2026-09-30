jest.mock('./database-generation', () => ({ DATABASE_GENERATION: 'v8' }));

const mockDeleteDirectory = jest.fn();

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
	// Not legacy (`store_v5_` is not a legacy prefix — store goes v3, v4, v7) and
	// not ours. Both must survive.
	'store_v5_shop.db',
	'store_v7_shop.db',
	'store_v8_shop.db',
	'some-other-library.db',
].map((name) => ({ name, delete: jest.fn() }));

const opfsEntries = [
	'rxdb-wcposusers_v4-sites-0',
	'rxdb-store_v4_shop-products-0',
	'rxdb-fast_store_v5_shop-orders-0',
	'rxdb-wcposusers_v7-sites-0',
	'rxdb-store_v7_shop-products-0',
	'rxdb-fast_store_v7_shop-orders-0',
	'rxdb-wcposusers_v8-sites-0',
	'rxdb-pos_v5_shop-orders-0',
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
		mockDeleteDirectory(this.uri);
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

	it('removes the retired OPFS root whole and only legacy files from shared SQLite', async () => {
		const { purgeLegacyDatabases } = await import('./purge-legacy-db');

		// Three old SQLite databases plus eight rxdb entries in the retired root.
		await expect(purgeLegacyDatabases()).resolves.toMatchObject({
			success: true,
			databasesDeleted: 11,
		});
		expect(mockDeleteDirectory.mock.calls).toEqual([['document-dir/.expo-opfs']]);
		expect(
			sqliteEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual([
			'wcposusers_v4.db',
			'wcposusers_v4.db-wal',
			'wcposusers_v4.db-shm',
			'fast_store_v5_shop.db',
			'store_v7_shop.db',
		]);
	});

	it('clearAllDB removes the live directory and both legacy roots', async () => {
		const { clearAllDB } = await import('./clear-all-db');
		await expect(clearAllDB()).resolves.toMatchObject({ success: true });
		expect(mockDeleteDirectory.mock.calls.map(([uri]) => uri).sort()).toEqual([
			'document-dir/.expo-opfs',
			'document-dir/SQLite',
			'document-dir/wcpos-sqlite',
		]);
		expect(sqliteEntries.every((entry) => entry.delete.mock.calls.length === 0)).toBe(true);
	});
});
