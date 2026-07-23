const mockDeleteLegacySQLiteDirectory = jest.fn();

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

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		TRANSACTION_FAILED: 'TRANSACTION_FAILED',
	},
}));

describe('purgeLegacyDatabases native', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it('deletes the legacy SQLite directory and only legacy OPFS entries', async () => {
		const { purgeLegacyDatabases } = await import('./purge-legacy-db');

		await expect(purgeLegacyDatabases()).resolves.toEqual({
			success: true,
			message: 'Successfully purged 4 legacy database entries',
			databasesDeleted: 4,
		});
		expect(mockDeleteLegacySQLiteDirectory).toHaveBeenCalledWith('document-dir/SQLite');
		expect(
			opfsEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual([
			'rxdb-wcposusers_v4-sites-0',
			'rxdb-store_v4_shop-products-0',
			'rxdb-fast_store_v5_shop-orders-0',
		]);
	});
});
