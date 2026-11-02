import { setDatabase } from '@wcpos/utils/logger';

import { bindSurvivingStoreLogs, hydrateUserSession } from '../../src/user-db/session';

const createStoreDBMock = jest.fn();
jest.mock('@wcpos/database/create-db', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({ setDatabase: jest.fn() }));

const documentLookup = (document: unknown) => ({
	findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
});

describe('hydrateUserSession', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({ id: 'state' })) });
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
});

it('does not look up empty ids or open a database for an absent store', async () => {
	const userDB = {
		sites: documentLookup(null),
		wp_credentials: documentLookup(null),
		stores: documentLookup(null),
	};
	createStoreDBMock.mockClear();
	await expect(hydrateUserSession(userDB as never, {})).resolves.toEqual({
		site: undefined,
		wpCredentials: undefined,
		store: undefined,
		storeDB: undefined,
		extraData: undefined,
	});
	for (const collection of Object.values(userDB)) expect(collection.findOne).not.toHaveBeenCalled();
	expect(createStoreDBMock).not.toHaveBeenCalled();
});

it('binds only surviving logs and repeated bindings never unbind', () => {
	const logs = {};
	bindSurvivingStoreLogs(undefined);
	expect(setDatabase).not.toHaveBeenCalled();
	bindSurvivingStoreLogs({ collections: { logs } } as never);
	bindSurvivingStoreLogs({ collections: { logs } } as never);
	expect(jest.mocked(setDatabase).mock.calls).toEqual([[logs], [logs]]);
});
