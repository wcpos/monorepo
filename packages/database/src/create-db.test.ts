import {
	storeCollections,
	syncCollections,
	temporaryCollections,
	userCollections,
} from './collections';

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

jest.mock('./adapters/fast', () => ({
	fastStorageConfig: {
		storage: { name: 'fast-storage' },
		multiInstance: false,
	},
}));

jest.mock('./adapters/ephemeral', () => ({
	ephemeralStorageConfig: { storage: { name: 'ephemeral-storage' } },
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => mockLogger,
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		CONNECTION_FAILED: 'CONNECTION_FAILED',
	},
}));

describe('create-db', () => {
	beforeEach(() => {
		jest.clearAllMocks();
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
		[
			'createFastStoreDB',
			'fast_store_v6_abc123',
			syncCollections,
			async (module: typeof import('./create-db')) => module.createFastStoreDB('abc123'),
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
