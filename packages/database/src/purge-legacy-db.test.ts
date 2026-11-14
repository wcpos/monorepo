jest.mock('./database-generation', () => ({ DATABASE_GENERATION: 'v10' }));

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
	'store_v9_shop.db',
	'store_v10_shop.db',
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
	'rxdb-wcposusers_v9-sites-0',
	'rxdb-pos_v5_shop-orders-0',
	'unrelated',
].map((name) => ({ name, delete: jest.fn() }));

// The live SQLite root after the 2.0 schema reset: retired generations beside the
// current one, plus a kept drainable scope database and an older one.
const liveRootEntries = [
	'wcposusers_v8',
	'wcposusers_v8-wal',
	'store_v9_shop',
	'wcposusers_v10',
	'store_v10_shop',
	'pos_v6_0123456789ab_s1_c2',
	'pos_v4_0123456789ab_s1_c2',
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
		if (this.uri.includes('wcpos-sqlite')) {
			return liveRootEntries;
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

type Entry = { name: string; delete: jest.Mock };
const entries = (...names: string[]): Entry[] => names.map((name) => ({ name, delete: jest.fn() }));

/** Runs `run` with only these entries listed, then restores the shared harness lists. */
async function withOnly(
	only: { sqlite?: Entry[]; opfs?: Entry[]; live?: Entry[] },
	run: () => Promise<void>
) {
	const lists: [Entry[], Entry[]][] = [
		[sqliteEntries, only.sqlite ?? []],
		[opfsEntries, only.opfs ?? []],
		[liveRootEntries, only.live ?? []],
	];
	const saved = lists.map(([list, next]) => list.splice(0, list.length, ...next));
	try {
		await run();
	} finally {
		lists.forEach(([list], index) => list.splice(0, list.length, ...saved[index]!));
	}
}

describe('purgeLegacyDatabases native', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it('removes the retired OPFS root whole and only legacy files from shared SQLite', async () => {
		const { purgeLegacyDatabases } = await import('./purge-legacy-db');

		// Five old SQLite databases, nine rxdb entries in the retired root, and three
		// retired-generation databases in the live root (the `-wal` sidecar is not counted).
		await expect(purgeLegacyDatabases()).resolves.toMatchObject({
			success: true,
			databasesDeleted: 17,
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
			'store_v8_shop.db',
			'store_v9_shop.db',
		]);
		// The live root loses only retired generations; v10 and the drainable scope stay.
		expect(
			liveRootEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual(['wcposusers_v8', 'wcposusers_v8-wal', 'store_v9_shop', 'pos_v4_0123456789ab_s1_c2']);
		expect(mockDeleteDirectory).not.toHaveBeenCalledWith('document-dir/wcpos-sqlite');
	});

	it('never reaches a kept drainable scope database, by name or by directory', async () => {
		const drainable = 'pos_v6_0123456789ab_s1_c2';
		const older = 'pos_v4_0123456789ab_s1_c2';
		const added = [drainable, `${drainable}-wal`, older].map((name) => ({
			name,
			delete: jest.fn(),
		}));
		sqliteEntries.push(...added);
		try {
			const { purgeLegacyDatabases } = await import('./purge-legacy-db');
			await purgeLegacyDatabases();
			expect(
				added.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
			).toEqual([older]);
			// The live root, where a kept drainable database actually lives, is never deleted.
			expect(mockDeleteDirectory).not.toHaveBeenCalledWith('document-dir/wcpos-sqlite');
		} finally {
			sqliteEntries.splice(-added.length);
		}
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

	it.each([
		['a retired-root child', { opfs: entries('rxdb-wcposusers_v6') }, true],
		['a shared SQLite database', { sqlite: entries('wcposusers_v4') }, true],
		['a live-root database', { live: entries('wcposusers_v9') }, true],
		[
			'only store databases',
			{
				sqlite: entries('store_v7_shop.db'),
				opfs: entries('rxdb-store_v4_shop-products-0'),
				live: entries('store_v9_shop', 'wcposusers_v10'),
			},
			false,
		],
	])('reports whether a retired user database went: %s', async (_, only, found) => {
		await withOnly(only, async () => {
			const { purgeLegacyDatabases } = await import('./purge-legacy-db');
			await expect(purgeLegacyDatabases()).resolves.toMatchObject({
				legacyUserDatabaseFound: found,
			});
		});
	});

	it('still rejects when a purge throws, so nothing is reported', async () => {
		const [broken] = entries('wcposusers_v4');
		broken!.delete.mockImplementation(() => {
			throw new Error('disk gone');
		});
		await withOnly({ sqlite: [broken!] }, async () => {
			const { purgeLegacyDatabases } = await import('./purge-legacy-db');
			await expect(purgeLegacyDatabases()).rejects.toThrow('disk gone');
		});
	});
});
