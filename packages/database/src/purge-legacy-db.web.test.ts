const indexedDbNames = [
	'wcposusers_v4',
	'store_v4_shop',
	'fast_store_v5_shop',
	'wcposusers_v7',
	'store_v7_shop',
	'fast_store_v7_shop',
	'unrelated',
];
const opfsNames = [
	'rxdb-wcposusers_v4-sites-0',
	'rxdb-store_v4_shop-products-0',
	'rxdb-fast_store_v5_shop-orders-0',
	'rxdb-wcposusers_v7-sites-0',
	'rxdb-store_v7_shop-products-0',
	'rxdb-fast_store_v7_shop-orders-0',
	'unrelated',
];

const mockDeleteDatabase = jest.fn((name: string) => {
	const request = {} as IDBOpenDBRequest;
	queueMicrotask(() => request.onsuccess?.(new Event('success')));
	return request;
});
const mockRemoveEntry = jest.fn(async (_name: string, _options?: FileSystemRemoveOptions) => {});
const mockOpfsRoot = {
	async *[Symbol.asyncIterator]() {
		for (const name of opfsNames) {
			yield [name, {}] as [string, FileSystemHandle];
		}
	},
	removeEntry: mockRemoveEntry,
};

describe('purgeLegacyDatabases web', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			value: {
				databases: jest.fn(async () => indexedDbNames.map((name) => ({ name }))),
				deleteDatabase: mockDeleteDatabase,
			},
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: {
				storage: {
					getDirectory: jest.fn(async () => mockOpfsRoot),
				},
			},
		});
	});

	it('never purges the SQLite pool alongside v6 filesystem entries', async () => {
		const { SQLITE_POOL_DIRECTORY } = await import('./adapters/storage/sqlite-pool');
		opfsNames.push(SQLITE_POOL_DIRECTORY, 'rxdb-store_v6_shop-logs-0');
		try {
			const { purgeLegacyDatabases } = await import('./purge-legacy-db.web');
			await purgeLegacyDatabases();
			expect(mockRemoveEntry).toHaveBeenCalledWith('rxdb-store_v6_shop-logs-0', {
				recursive: true,
			});
			expect(mockRemoveEntry).not.toHaveBeenCalledWith(SQLITE_POOL_DIRECTORY, expect.anything());
		} finally {
			opfsNames.splice(-2);
		}
	});

	it('never reaches a kept drainable scope database, by name or by the pool', async () => {
		const { SQLITE_POOL_DIRECTORY } = await import('./adapters/storage/sqlite-pool');
		const drainable = 'pos_v5_0123456789ab_s1_c2';
		const older = 'pos_v4_0123456789ab_s1_c2';
		opfsNames.push(
			SQLITE_POOL_DIRECTORY,
			`rxdb-${drainable}--0--orders`,
			`rxdb-${older}--0--orders`
		);
		indexedDbNames.push(drainable, older);
		try {
			const { purgeLegacyDatabases } = await import('./purge-legacy-db.web');
			await purgeLegacyDatabases();
			expect(mockRemoveEntry).toHaveBeenCalledWith(`rxdb-${older}--0--orders`, {
				recursive: true,
			});
			expect(mockDeleteDatabase).toHaveBeenCalledWith(older);
			expect(mockRemoveEntry).not.toHaveBeenCalledWith(SQLITE_POOL_DIRECTORY, expect.anything());
			expect(mockRemoveEntry).not.toHaveBeenCalledWith(
				`rxdb-${drainable}--0--orders`,
				expect.anything()
			);
			expect(mockDeleteDatabase).not.toHaveBeenCalledWith(drainable);
		} finally {
			opfsNames.splice(-3);
			indexedDbNames.splice(-2);
		}
	});

	it('deletes only legacy IndexedDB and OPFS entries', async () => {
		const { purgeLegacyDatabases } = await import('./purge-legacy-db.web');

		await expect(purgeLegacyDatabases()).resolves.toEqual({
			success: true,
			message: 'Successfully purged 6 legacy database entries',
			databasesDeleted: 6,
		});
		expect(mockDeleteDatabase.mock.calls.map(([name]) => name)).toEqual([
			'wcposusers_v4',
			'store_v4_shop',
			'fast_store_v5_shop',
		]);
		expect(mockRemoveEntry.mock.calls).toEqual([
			['rxdb-wcposusers_v4-sites-0', { recursive: true }],
			['rxdb-store_v4_shop-products-0', { recursive: true }],
			['rxdb-fast_store_v5_shop-orders-0', { recursive: true }],
		]);
	});
});
