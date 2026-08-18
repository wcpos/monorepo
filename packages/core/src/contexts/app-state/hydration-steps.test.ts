jest.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA256' },
	CryptoEncoding: { HEX: 'HEX' },
	digestStringAsync: jest.fn(async () => '0123456789abcdef'),
}));

const createStoreDBMock = jest.fn();

jest.mock('@wcpos/database', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
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
import {
	hydrateUserSession,
	hydrationSteps,
	switchUserSessionStore,
	testAuthorizationMethod,
} from './hydration-steps';

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

describe('switchUserSessionStore', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not persist the new store when hydration fails', async () => {
		const error = new Error('store database failed');
		createStoreDBMock.mockRejectedValue(error);
		const appState = {
			get: jest.fn(async () => ({
				siteID: 'site-1',
				wpCredentialsID: 'cred-1',
				storeID: 'store-1',
			})),
			set: jest.fn(),
		};

		await expect(
			switchUserSessionStore(
				{
					sites: documentLookup({ uuid: 'site-1' }),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-2' }),
				} as any,
				appState,
				'store-2'
			)
		).rejects.toBe(error);

		expect(appState.set).not.toHaveBeenCalled();
	});

	it('persists only after hydration resolves and returns the hydrated session', async () => {
		let resolveStoreDB: (storeDB: { addState: jest.Mock }) => void = () => undefined;
		const storeDBPromise = new Promise<{ addState: jest.Mock }>((resolve) => {
			resolveStoreDB = resolve;
		});
		createStoreDBMock.mockReturnValue(storeDBPromise);
		const current = {
			siteID: 'site-1',
			wpCredentialsID: 'cred-1',
			storeID: 'store-1',
		};
		const appState = {
			get: jest.fn(async () => current),
			set: jest.fn(async (_key: string, _updater: () => typeof current) => undefined),
		};
		const site = { uuid: 'site-1' };
		const wpCredentials = { uuid: 'cred-1' };
		const store = { localID: 'store-2' };

		const switching = switchUserSessionStore(
			{
				sites: documentLookup(site),
				wp_credentials: documentLookup(wpCredentials),
				stores: documentLookup(store),
			} as any,
			appState,
			'store-2'
		);
		for (let turn = 0; turn < 5; turn += 1) {
			await Promise.resolve();
		}
		expect(createStoreDBMock).toHaveBeenCalledWith('store-2');
		expect(appState.set).not.toHaveBeenCalled();

		const extraData = { id: 'state' };
		const storeDB = { addState: jest.fn(async () => extraData) };
		resolveStoreDB(storeDB);

		await expect(switching).resolves.toEqual({
			site,
			wpCredentials,
			store,
			storeDB,
			extraData,
		});
		expect(appState.set).toHaveBeenCalledWith('current', expect.any(Function));
		expect(appState.set.mock.calls[0][1]()).toEqual({ ...current, storeID: 'store-2' });
	});

	it('aborts before persisting when the engine scope switch rejects', async () => {
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({})) });
		const error = new Error('engine refused the scope');
		const appState = {
			get: jest.fn(async () => ({
				siteID: 'site-1',
				wpCredentialsID: 'cred-1',
				storeID: 'store-1',
			})),
			set: jest.fn(),
		};
		const switchEngineScope = jest.fn(async () => {
			throw error;
		});

		await expect(
			switchUserSessionStore(
				{
					sites: documentLookup({ uuid: 'site-1' }),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-2' }),
				} as any,
				appState,
				'store-2',
				{ switchEngineScope }
			)
		).rejects.toBe(error);

		expect(switchEngineScope).toHaveBeenCalledTimes(1);
		expect(appState.set).not.toHaveBeenCalled();
	});

	it('switches the engine scope with the hydrated session, before persisting', async () => {
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({})) });
		const order: string[] = [];
		const appState = {
			get: jest.fn(async () => ({
				siteID: 'site-1',
				wpCredentialsID: 'cred-1',
				storeID: 'store-1',
			})),
			set: jest.fn(async () => {
				order.push('persist');
			}),
		};
		const store = { localID: 'store-2' };
		const switchEngineScope = jest.fn(async (session: { store?: unknown }) => {
			order.push('engine');
			expect(session.store).toBe(store);
		});

		await switchUserSessionStore(
			{
				sites: documentLookup({ uuid: 'site-1' }),
				wp_credentials: documentLookup({ uuid: 'cred-1' }),
				stores: documentLookup(store),
			} as any,
			appState,
			'store-2',
			{ switchEngineScope }
		);

		expect(order).toEqual(['engine', 'persist']);
	});
});

describe('PROCESS_INITIAL_PROPS', () => {
	it('merges server-owned fields into existing stores and inserts new stores', async () => {
		const existingStore: any = {
			id: 1,
			localID: '0123456789',
			currency: 'USD',
			theme: 'dark',
			incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
				Object.assign(existingStore, patch);
			}),
		};
		existingStore.getLatest = jest.fn(() => existingStore);

		const siteDoc = { uuid: 'site-1' };
		const wpCredentialsDoc = {
			uuid: 'credentials-1',
			patch: jest.fn(async () => undefined),
		};
		const bulkInsert = jest.fn(async () => undefined);
		const userDB = {
			sites: {
				schema: { primaryPath: 'uuid' },
				findOne: jest.fn(() => ({ exec: jest.fn(async () => null) })),
				incrementalUpsert: jest.fn(async () => siteDoc),
			},
			wp_credentials: { upsert: jest.fn(async () => wpCredentialsDoc) },
			stores: {
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => existingStore) })
					.mockReturnValueOnce({ exec: jest.fn(async () => null) }),
				bulkInsert,
			},
		};
		const appState = {
			get: jest.fn(async () => ({ storeID: existingStore.localID })),
			set: jest.fn(async () => undefined),
		};
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS');

		await step!.execute({
			userDB: userDB as any,
			appState,
			user: { uuid: 'user-1' },
			initialProps: {
				site: siteDoc,
				wp_credentials: wpCredentialsDoc,
				stores: [
					{ id: 1, currency: 'EUR', calc_taxes: 'yes', theme: 'light' },
					{ id: 2, name: 'New Store' },
				],
			},
		});

		// calc_taxes is auto-synced; currency is app-editable and must NOT auto-sync
		expect(existingStore.incrementalPatch).toHaveBeenCalledWith({ calc_taxes: 'yes' });
		expect(existingStore.theme).toBe('dark');
		expect(bulkInsert).toHaveBeenCalledWith([
			expect.objectContaining({
				id: 2,
				name: 'New Store',
				prevent_overselling: false,
			}),
		]);
	});
});

describe('TEST_AUTHORIZATION', () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('clears stale query parameter auth when Authorization headers work', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({ status: 'success' })),
		});
		const siteDoc = {
			use_jwt_as_param: true,
			incrementalPatch: jest.fn(async (patch: { use_jwt_as_param: boolean }) => {
				Object.assign(siteDoc, patch);
			}),
			getLatest: jest.fn(),
		};
		siteDoc.getLatest.mockReturnValue(siteDoc);
		const step = hydrationSteps.find(({ name }) => name === 'TEST_AUTHORIZATION');

		await step!.execute({
			userDB: { sites: documentLookup(siteDoc) } as never,
			initialProps: {
				site: {
					uuid: 'site-1',
					wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
				},
				wp_credentials: { access_token: 'token' },
				stores: [],
			},
		});

		expect(siteDoc.incrementalPatch).toHaveBeenCalledWith({ use_jwt_as_param: false });
		expect(siteDoc.use_jwt_as_param).toBe(false);
	});
});

describe('testAuthorizationMethod', () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('uses Authorization headers without testing query parameter auth when headers work', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({ status: 'success' })),
		});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			useJwtAsParam: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/wp-json/wcpos/v2/auth/test');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			headers: {
				Authorization: 'Bearer token',
			},
		});
	});

	it('falls back to query parameter auth when headers fail', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, json: jest.fn() }).mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({ status: 'success' })),
		});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			useJwtAsParam: true,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1][0])).toContain('authorization=Bearer+token');
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			headers: {
				'X-WCPOS': '1',
			},
		});
	});

	it('returns null when neither header nor query parameter auth works', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toBeNull();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			headers: {
				Authorization: 'Bearer token',
				'X-WCPOS': '1',
			},
		});
		expect(String(fetchMock.mock.calls[1][0])).toContain('authorization=Bearer+token');
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			headers: {
				'X-WCPOS': '1',
			},
		});
	});

	it('passes abort signals to auth probes so requests can time out', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() });

		await testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token');

		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
	});
});
