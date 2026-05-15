jest.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA256' },
	CryptoEncoding: { HEX: 'HEX' },
	digestStringAsync: jest.fn(async () => '0123456789abcdef'),
}));

const createStoreDBMock = jest.fn();
const createFastStoreDBMock = jest.fn();

jest.mock('@wcpos/database', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
	createFastStoreDB: (...args: unknown[]) => createFastStoreDBMock(...args),
	createUserDB: jest.fn(),
	sanitizeWPCredentialsData: (data: unknown) => data,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { isWeb: true },
}));

jest.mock('./initial-props', () => ({
	initialProps: null,
}));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import { hydrateUserSession } from './hydration-steps';

const documentLookup = (document: unknown) => ({
	findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
});

describe('hydrateUserSession', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({ id: 'state' })) });
		createFastStoreDBMock.mockResolvedValue({ name: 'fast-store-db' });
	});

	it('throws when a selected store cannot create its store database', async () => {
		createStoreDBMock.mockResolvedValue(undefined);

		await expect(
			hydrateUserSession(
				{
					sites: documentLookup({ uuid: 'site-1' }),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-1' }),
				} as any,
				{ siteID: 'site-1', wpCredentialsID: 'cred-1', storeID: 'store-1' }
			)
		).rejects.toThrow('Failed to create store database');
	});

	it('throws when a selected store cannot create its fast store database', async () => {
		createFastStoreDBMock.mockResolvedValue(undefined);

		await expect(
			hydrateUserSession(
				{
					sites: documentLookup({ uuid: 'site-1' }),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-1' }),
				} as any,
				{ siteID: 'site-1', wpCredentialsID: 'cred-1', storeID: 'store-1' }
			)
		).rejects.toThrow('Failed to create fast store database');
	});
});
