import { storeCollections, temporaryCollections, userCollections } from './collections';

const mockPostCreate = jest.fn();
const mockAddCollections = jest.fn(async () => ({
	orders: {
		postCreate: mockPostCreate,
	},
}));
const mockCreateRxDatabase = jest.fn(async ({ name }: { name: string }) => ({
	name,
	addCollections: mockAddCollections,
}));
const mockLogger = {
	error: jest.fn(),
};

jest.mock('rxdb', () => ({
	createRxDatabase: (args: { name: string }) => mockCreateRxDatabase(args),
}));

jest.mock('./adapters/default', () => ({
	defaultConfig: { storage: { name: 'default-storage' } },
}));

jest.mock('./adapters/ephemeral', () => ({
	ephemeralStorageConfig: { storage: { name: 'ephemeral-storage' } },
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => mockLogger,
}));

describe('create-db', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('indexes the logger searchable summary for health-log queries', () => {
		expect(storeCollections.logs.options?.searchFields).toContain('context.search');
	});

	it.each([
		[
			'createUserDB',
			'wcposusers_v6',
			userCollections,
			async (module: typeof import('./create-db')) => module.createUserDB(),
		],
		[
			'createStoreDB',
			'store_v6_abc123',
			storeCollections,
			async (module: typeof import('./create-db')) => module.createStoreDB('abc123'),
		],
	])(
		'creates the current database and adds collections for %s',
		async (_label, name, collections, factory) => {
			const module = await import('./create-db');

			const db = await factory(module);

			expect(db?.name).toBe(name);
			expect(mockCreateRxDatabase).toHaveBeenCalledWith(
				expect.objectContaining({ name, localDocuments: true })
			);
			expect(mockAddCollections).toHaveBeenCalledWith(collections);
			expect(mockLogger.error).not.toHaveBeenCalled();
		}
	);

	it.each([
		['createUserDB', async (module: typeof import('./create-db')) => module.createUserDB()],
		[
			'createStoreDB',
			async (module: typeof import('./create-db')) => module.createStoreDB('abc123'),
		],
	])(
		'lets %s reclaim its name, so a hydration retry does not throw DB8 over the real failure',
		async (_label, factory) => {
			const module = await import('./create-db');

			await factory(module);

			expect(mockCreateRxDatabase).toHaveBeenCalledWith(
				expect.objectContaining({ closeDuplicates: true })
			);
		}
	);

	it('creates the temporary database and installs its post-create hook', async () => {
		const module = await import('./create-db');

		const db = await module.createTemporaryDB();

		expect(db?.name).toBe('temporary');
		expect(mockCreateRxDatabase).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'temporary' })
		);
		expect(mockAddCollections).toHaveBeenCalledWith(temporaryCollections);
		expect(mockPostCreate).toHaveBeenCalledWith(expect.any(Function));
		expect(mockLogger.error).not.toHaveBeenCalled();
	});
});
