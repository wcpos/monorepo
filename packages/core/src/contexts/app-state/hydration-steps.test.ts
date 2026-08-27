import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

jest.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA256' },
	CryptoEncoding: { HEX: 'HEX' },
	digestStringAsync: jest.fn(async () => '0123456789abcdef'),
}));

const createStoreDBMock = jest.fn();
const mockAppLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};
const mockPlatform = { isWeb: true };
// Indirection so the jest.mock factory (hoisted) can reach a mock defined later.
const platformFetchRef: { fn: (...args: unknown[]) => unknown } = {
	fn: (...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args),
};

jest.mock('@wcpos/database', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
	createUserDB: jest.fn(),
	sanitizeWPCredentialsData: (data: unknown) => data,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => mockAppLogger,
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: mockPlatform,
}));

jest.mock('./initial-props', () => ({
	initialProps: null,
}));

jest.mock('@wcpos/hooks/platform-fetch', () => ({
	platformFetch: (...args: unknown[]) => platformFetchRef.fn(...args),
}));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import {
	hydrateUserSession,
	hydrationSteps,
	runConnectCompatibilityProbes,
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
				appState as any,
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
			appState as any,
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
				appState as any,
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
			appState as any,
			'store-2',
			{ switchEngineScope }
		);

		expect(order).toEqual(['engine', 'persist']);
	});
});

describe('hydration step fail modes', () => {
	it('only PROCESS_INITIAL_PROPS fails soft; the load-bearing steps stay hard', () => {
		// A poisoned embedded payload must degrade to the previous session or the
		// connect screen — never an infinite splash retry loop. The other steps
		// produce state the app cannot boot without, so they must keep rejecting.
		const failSoftByName = Object.fromEntries(
			hydrationSteps.map((step) => [step.name, !!step.failSoft])
		);
		expect(failSoftByName).toEqual({
			INITIALIZE_USER_DB: false,
			PROCESS_INITIAL_PROPS: true,
			TEST_AUTHORIZATION: false,
			HYDRATE_USER_SESSION: false,
		});
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
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
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
			appState: appState as any,
			user: { uuid: 'user-1' } as any,
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

describe('probe transport', () => {
	/**
	 * The 1.10.2 connect outage: these probes called the renderer's global fetch.
	 * On Electron the renderer origin is the custom scheme `wcpos://-`, so every
	 * store request is cross-origin, and a host that rewrites
	 * Access-Control-Allow-Origin to echo the caller's Origin returns an EMPTY
	 * value for a custom scheme. The probes threw, both echo spellings read as
	 * dead, and the app told the merchant "The store's REST API did not answer at
	 * any address" about a store that answered 200 over the IPC bridge.
	 *
	 * The existing tests here cannot catch a regression: they stub `global.fetch`,
	 * and the web build of `platformFetch` calls exactly that, so raw fetch and
	 * platformFetch are indistinguishable to them. This test separates the two —
	 * the global is rigged to throw, so anything reaching it fails loudly.
	 */
	const platformFetchMock = jest.fn();
	const forbiddenGlobalFetch = jest.fn(() => {
		throw new Error('probe used the global fetch — it must go through platformFetch');
	});

	beforeEach(() => {
		platformFetchMock.mockReset();
		forbiddenGlobalFetch.mockClear();
		mockPlatform.isWeb = true;
		global.fetch = forbiddenGlobalFetch as unknown as typeof fetch;
		// Point the mocked module at this block's spy; the default delegates to the
		// global so every OTHER test in this file keeps its existing fetch stub.
		platformFetchRef.fn = platformFetchMock;
		platformFetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => 'application/json' },
			clone: () => ({ text: async () => '' }),
			text: async () => '',
			json: async () => ({
				v: 1,
				headers: { authorization: { received: true, length: 12 } },
				params: { authorization: true, wcpos: true, store_id: true },
			}),
		});
	});

	it('sends the authorization probes through platformFetch, never the global', async () => {
		const result = await testAuthorizationMethod(
			'https://example.com/wp-json/wcpos/v2/',
			'mock.connect.test',
			'1.10.0',
			'https://example.com/wp-json/'
		);

		expect(platformFetchMock).toHaveBeenCalled();
		expect(forbiddenGlobalFetch).not.toHaveBeenCalled();
		expect(result.ok).toBe(true);
	});

	afterEach(() => {
		platformFetchRef.fn = (...args: unknown[]) =>
			(globalThis.fetch as (...a: unknown[]) => unknown)(...args);
	});
});

describe('TEST_AUTHORIZATION', () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		mockPlatform.isWeb = true;
		mockAppLogger.warn.mockClear();
		mockAppLogger.error.mockClear();
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('clears stale query auth without running connect-only compatibility probes', async () => {
		// First call is the B8 echo probe — answer with the probe body so the
		// step resolves header mode from it directly.
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({
				v: 1,
				headers: { authorization: { received: true, length: 12 } },
				params: { authorization: true, wcpos: true, store_id: true },
			})),
		});
		const siteDoc = {
			use_jwt_as_param: true,
			use_rest_route_param: true,
			use_protocol_headers: true,
			incrementalPatch: jest.fn(
				async (patch: {
					use_jwt_as_param: boolean;
					use_rest_route_param: boolean;
					use_protocol_headers: boolean;
				}) => {
					Object.assign(siteDoc, patch);
				}
			),
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

		expect(siteDoc.incrementalPatch).toHaveBeenCalledWith({
			use_jwt_as_param: false,
			use_rest_route_param: false,
			use_protocol_headers: false,
		});
		expect(siteDoc.use_jwt_as_param).toBe(false);
		expect(siteDoc.use_rest_route_param).toBe(false);
		expect(siteDoc.use_protocol_headers).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('continues without persisting transport settings when authorization is blocked', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({
				v: 1,
				headers: { authorization: { received: false, length: 0 } },
				params: { authorization: false, wcpos: true, store_id: true },
			})),
		});
		const siteDoc = {
			incrementalPatch: jest.fn(),
			getLatest: jest.fn(),
		};
		siteDoc.getLatest.mockReturnValue(siteDoc);
		const step = hydrationSteps.find(({ name }) => name === 'TEST_AUTHORIZATION');

		await expect(
			step!.execute({
				userDB: { sites: documentLookup(siteDoc) } as never,
				initialProps: {
					site: {
						uuid: 'site-1',
						wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
					},
					wp_credentials: { access_token: 'token' },
					stores: [],
				},
			})
		).resolves.toEqual({});

		expect(siteDoc.incrementalPatch).not.toHaveBeenCalled();
	});
});

describe('runConnectCompatibilityProbes', () => {
	const fetchMock = jest.fn();
	const echoBody = (received: boolean, length: number) => ({
		v: 1,
		headers: { authorization: { received, length } },
		params: { authorization: false, wcpos: true, store_id: true },
	});
	const response = (status: number, data: unknown = null) => ({
		ok: status >= 200 && status < 300,
		status,
		json: jest.fn(async () => data),
		text: jest.fn(async () => (data === null ? '' : JSON.stringify(data))),
	});
	const run = () =>
		runConnectCompatibilityProbes({
			pathBase: 'https://example.com/wp-json/wcpos/v2/',
			pathRoot: 'https://example.com/wp-json/',
			useRestRouteParam: false,
		});

	beforeEach(() => {
		fetchMock.mockReset();
		mockAppLogger.warn.mockClear();
		mockAppLogger.error.mockClear();
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('warns only when the bare ping is readable and the nasty search is blocked', async () => {
		fetchMock
			.mockResolvedValueOnce(response(200))
			.mockResolvedValueOnce(response(403))
			.mockResolvedValueOnce(response(500))
			.mockResolvedValueOnce(response(500));

		await expect(run()).resolves.toEqual({
			blocking: null,
			warnings: [ERROR_CODES.SEARCH_BLOCKED_BY_WAF],
		});
		expect(String(fetchMock.mock.calls[1][0])).toContain('s=%C3%9Cnion+select+caf%C3%A9');
		expect(mockAppLogger.warn).toHaveBeenCalledWith(
			'Host security filter blocks ordinary search terms',
			{
				code: ERROR_CODES.SEARCH_BLOCKED_BY_WAF,
				showToast: true,
				context: { classification: 'SEARCH_BLOCKED_BY_WAF' },
			}
		);
	});

	it.each([
		['both pings are forbidden', response(403), response(403)],
		['the bare ping fails', new Error('offline'), response(403)],
	])('does not infer search blocking when %s', async (_name, bare, nasty) => {
		if (bare instanceof Error) fetchMock.mockRejectedValueOnce(bare);
		else fetchMock.mockResolvedValueOnce(bare);
		fetchMock
			.mockResolvedValueOnce(nasty)
			.mockResolvedValueOnce(response(500))
			.mockResolvedValueOnce(response(500));

		await expect(run()).resolves.toEqual({ blocking: null, warnings: [] });
		expect(mockAppLogger.warn).not.toHaveBeenCalled();
	});

	it('blocks when the second authenticated echo replays the first token length', async () => {
		fetchMock
			.mockResolvedValueOnce(response(200))
			.mockResolvedValueOnce(response(200))
			.mockResolvedValueOnce(response(200, echoBody(true, 24)))
			.mockResolvedValueOnce(response(200, echoBody(true, 24)));

		await expect(run()).resolves.toEqual({
			blocking: ERROR_CODES.CACHE_SHARED_REPLAY,
			warnings: [],
		});
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[3][0]);
		expect(fetchMock.mock.calls[2][1].headers.Authorization).toHaveLength(24);
		expect(fetchMock.mock.calls[3][1].headers.Authorization).toHaveLength(36);
		expect(mockAppLogger.error).toHaveBeenCalledWith('Shared cache replay detected', {
			code: ERROR_CODES.CACHE_SHARED_REPLAY,
			showToast: true,
		});
	});

	it.each([
		['healthy echoes', echoBody(true, 24), echoBody(true, 36)],
		['stripped Authorization headers', echoBody(false, 0), echoBody(false, 0)],
		['a malformed second echo', echoBody(true, 24), { status: 'success' }],
	])('does not infer cache replay from %s', async (_name, first, second) => {
		fetchMock
			.mockResolvedValueOnce(response(200))
			.mockResolvedValueOnce(response(200))
			.mockResolvedValueOnce(response(200, first))
			.mockResolvedValueOnce(response(200, second));

		await expect(run()).resolves.toEqual({ blocking: null, warnings: [] });
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(mockAppLogger.error).not.toHaveBeenCalled();
	});
});

describe('testAuthorizationMethod', () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		mockAppLogger.warn.mockClear();
		mockAppLogger.error.mockClear();
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('uses Authorization headers without testing query parameter auth when headers work', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, json: jest.fn() }).mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({ status: 'success' })),
		});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[0][0])).toContain('/wp-json/wcpos/v2/echo');
		expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/wp-json/wcpos/v2/auth/test');
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			headers: {
				Authorization: 'Bearer token',
			},
		});
	});

	it('falls back to query parameter auth when headers fail', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({
				ok: true,
				json: jest.fn(async () => ({ status: 'success' })),
			});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: true,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(String(fetchMock.mock.calls[2][0])).toContain('authorization=Bearer+token');
		expect(fetchMock.mock.calls[2][1]).toMatchObject({
			headers: {
				'X-WCPOS': '1',
			},
		});
	});

	it('returns an uncoded failure when both legacy auth methods answer but reject credentials', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: null });

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[1][1]).toMatchObject({
			headers: {
				Authorization: 'Bearer token',
				'X-WCPOS': '1',
			},
		});
		expect(String(fetchMock.mock.calls[2][0])).toContain('authorization=Bearer+token');
		expect(fetchMock.mock.calls[2][1]).toMatchObject({
			headers: {
				'X-WCPOS': '1',
			},
		});
		expect(mockAppLogger.error).not.toHaveBeenCalled();
	});

	it('passes abort signals to auth probes so requests can time out', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, json: jest.fn() });

		await testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token');

		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
		expect(fetchMock.mock.calls[2][1].signal).toBeInstanceOf(AbortSignal);
	});

	it('keeps the shorter echo timeout active while reading the response body', async () => {
		jest.useFakeTimers();
		try {
			let resolveBody!: (value: unknown) => void;
			const body = new Promise<unknown>((resolve) => {
				resolveBody = resolve;
			});
			fetchMock
				.mockResolvedValueOnce({ ok: true, json: jest.fn(() => body) })
				.mockResolvedValueOnce({ ok: false, json: jest.fn() })
				.mockResolvedValueOnce({ ok: false, json: jest.fn() });

			const authorization = testAuthorizationMethod(
				'https://example.com/wp-json/wcpos/v2/',
				'token'
			);
			await Promise.resolve();
			const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

			expect(signal.aborted).toBe(false);
			jest.advanceTimersByTime(3000);
			expect(signal.aborted).toBe(true);

			resolveBody(null);
			await expect(authorization).resolves.toEqual({
				ok: false,
				code: ERROR_CODES.REST_TRANSPORT_BLOCKED,
			});
		} finally {
			jest.useRealTimers();
		}
	});

	const echoBody = (overrides: Record<string, unknown> = {}) => ({
		v: 1,
		headers: {
			authorization: { received: true, length: 12 },
			'content-type': { received: true, length: 16 },
			'x-wcpos': { received: true, length: 1 },
			'x-wcpos-store': { received: true, length: 1 },
			'idempotency-key': { received: true, length: 16 },
			'if-match': { received: true, length: 18 },
			'if-none-match': { received: true, length: 18 },
			'x-wcpos-idempotency-key': { received: true, length: 16 },
		},
		params: { authorization: true, wcpos: true, store_id: true },
		...overrides,
	});

	it('accepts an old-shape echo without cors and conservatively keeps protocol params', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => echoBody()),
		});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const echoUrl = String(fetchMock.mock.calls[0][0]);
		expect(echoUrl).toContain('/wp-json/wcpos/v2/echo');
		// Both credential channels ride the single probe request — but the URL
		// carries a MASKED token (same shape and length), never the secret.
		expect(echoUrl).toContain('authorization=Bearer+xxxxx');
		expect(echoUrl).not.toContain('token');
		expect(echoUrl).toContain('wcpos=1');
		expect(echoUrl).toContain('store_id=1');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			headers: {
				Authorization: 'Bearer token',
				'X-WCPOS': '1',
				'X-WCPOS-Store': '1',
				'Idempotency-Key': 'wcpos-echo-probe',
				'If-Match': '"wcpos-echo-probe"',
				'If-None-Match': '"wcpos-echo-probe"',
				'X-WCPOS-Idempotency-Key': 'wcpos-echo-probe',
			},
		});
	});

	it('enables protocol headers when both signal names are in the echo header floor', async () => {
		const body = echoBody();
		Object.assign(body.headers, {
			'x-wcpos-protocol': { received: false, length: 0 },
			'x-wcpos-client': { received: false, length: 0 },
		});
		fetchMock.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => body) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: true,
		});
	});

	it('enables protocol headers when the echo proves reflected CORS names are authorized', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => echoBody({ cors: { reflects_request_headers: true } })),
		});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: true,
		});
	});

	it('classifies a challenge page returned by the path echo', async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				headers: { get: jest.fn(() => 'text/html; charset=UTF-8') },
				text: jest.fn(async () => '<html><script src="/cdn-cgi/challenge-platform/cf-chl.js">'),
			})
			.mockRejectedValueOnce(new Error('query echo blocked'))
			.mockResolvedValueOnce({ ok: false, status: 404, text: jest.fn(async () => '') });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.BOT_CHALLENGE_BLOCKING_API });

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('does not read a Cloudflare-branded plain error page as a bot challenge', async () => {
		// A CF-branded 520/maintenance page carries the brand name but no
		// challenge machinery — it must stay on the transport/outage diagnosis.
		const cfErrorPage = {
			ok: false,
			status: 520,
			headers: { get: jest.fn(() => 'text/html; charset=UTF-8') },
			text: jest.fn(
				async () => '<html><body>Web server is down — cloudflare performance & security</body>'
			),
		};
		fetchMock
			.mockResolvedValueOnce(cfErrorPage)
			.mockResolvedValueOnce({ ...cfErrorPage, text: jest.fn(async () => '<html>down') })
			.mockResolvedValueOnce({ ok: false, status: 404, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 404, text: jest.fn(async () => '') });

		const result = await testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token');
		expect(result).toMatchObject({ ok: false });
		expect((result as { code: unknown }).code).not.toBe(ERROR_CODES.BOT_CHALLENGE_BLOCKING_API);
	});

	it('treats a 503 pair with a 5xx ping as an outage, not a header limit', async () => {
		// The header-limit diagnosis needs the MINIMAL-header lane healthy; a
		// 503-answering ping is the same outage answering everywhere.
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 503, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 503, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 503, text: jest.fn(async () => '') });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: null });

		expect(mockAppLogger.error).not.toHaveBeenCalled();
	});

	it('classifies legacy header 400 plus parameter 414 as an oversized token', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 401, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 400, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 414, text: jest.fn(async () => '') });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.AUTH_TOKEN_TOO_LARGE });
	});

	it('classifies two 503 echo spellings when the bare ping answers', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 503, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ ok: false, status: 503, text: jest.fn(async () => '') })
			.mockResolvedValueOnce({ status: 200 });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.RESPONSE_HEADERS_REJECTED });

		expect(String(fetchMock.mock.calls[2][0])).toContain('/wp-json/wcpos/v2/ping?wcpos=1');
	});

	it('classifies web preflight blocking when an unheadered echo remains readable', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('path CORS failure'))
			.mockRejectedValueOnce(new Error('query CORS failure'))
			.mockResolvedValueOnce({ status: 200 })
			.mockResolvedValueOnce({ ok: true, status: 200 });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.CORS_PREFLIGHT_BLOCKED });

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock.mock.calls[3][1]).toMatchObject({ cache: 'no-store' });
		expect(fetchMock.mock.calls[3][1]).not.toHaveProperty('headers');
	});

	it('does not classify a readable simple-echo error as preflight blocking', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('path CORS failure'))
			.mockRejectedValueOnce(new Error('query CORS failure'))
			.mockResolvedValueOnce({ status: 200 })
			.mockResolvedValueOnce({ ok: false, status: 403 });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.REST_TRANSPORT_BLOCKED });
	});

	it('classifies broken web CORS when only a no-cors ping resolves', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('path CORS failure'))
			.mockRejectedValueOnce(new Error('query CORS failure'))
			.mockRejectedValueOnce(new Error('cors ping failure'))
			.mockRejectedValueOnce(new Error('simple echo failure'))
			.mockResolvedValueOnce({ type: 'opaque', status: 0 });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.CORS_MISCONFIGURED });

		expect(fetchMock).toHaveBeenCalledTimes(5);
		expect(fetchMock.mock.calls[4][1]).toMatchObject({ cache: 'no-store', mode: 'no-cors' });
	});

	it('retries a 404 path echo in query form and derives auth from that response', async () => {
		const body = echoBody();
		(body.headers as Record<string, { received: boolean; length: number }>).authorization = {
			received: false,
			length: 0,
		};
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn(async () => body) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: true,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(String(fetchMock.mock.calls[0][0])).toContain('/wp-json/wcpos/v2/echo');
		expect(String(fetchMock.mock.calls[1][0])).toContain('rest_route=%2Fwcpos%2Fv2%2Fecho');
	});

	it('retries a network-failed path echo in query form', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('blocked'))
			.mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn(async () => echoBody()) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});
	});

	it('probes only query form when the stored base is already query form', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: jest.fn(async () => echoBody()),
		});

		await expect(
			testAuthorizationMethod('https://example.com/?rest_route=/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toContain('rest_route=%2Fwcpos%2Fv2%2Fecho');
		expect(String(fetchMock.mock.calls[0][0])).not.toContain('/wp-json/');
	});

	it('treats native network-dead-with-dead-ping as offline, not hostile', async () => {
		// Everything network-dead INCLUDING the ping discriminator is the
		// store-offline shape (finding d9): no host-blocked code, no toast —
		// the online-status UX owns outages.
		mockPlatform.isWeb = false;
		fetchMock
			.mockRejectedValueOnce(new Error('path blocked'))
			.mockRejectedValueOnce(new Error('query blocked'))
			.mockRejectedValueOnce(new Error('ping dead'));

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: null });

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(String(fetchMock.mock.calls[2][0])).toContain('/wcpos/v2/ping');
		expect(mockAppLogger.error).not.toHaveBeenCalled();
	});

	it('names the transport block on native when the ping proves the store alive', async () => {
		mockPlatform.isWeb = false;
		fetchMock
			.mockRejectedValueOnce(new Error('path blocked'))
			.mockRejectedValueOnce(new Error('query blocked'))
			.mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn() });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.REST_TRANSPORT_BLOCKED });

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(mockAppLogger.error).toHaveBeenCalledWith(expect.any(String), {
			code: ERROR_CODES.REST_TRANSPORT_BLOCKED,
			showToast: true,
			context: {
				wcposApiUrl: 'https://example.com/wp-json/wcpos/v2/',
				classification: 'REST_TRANSPORT_BLOCKED',
			},
		});
	});

	it('returns and logs the transport-blocked verdict when both legacy transports are blocked', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.REST_TRANSPORT_BLOCKED });

		expect(mockAppLogger.error).toHaveBeenCalledWith(expect.any(String), {
			code: ERROR_CODES.REST_TRANSPORT_BLOCKED,
			showToast: true,
			context: {
				wcposApiUrl: 'https://example.com/wp-json/wcpos/v2/',
				classification: 'REST_TRANSPORT_BLOCKED',
			},
		});
	});

	it('treats a path echo 401 as an auth-level answer and skips query echo', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn() })
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: jest.fn(async () => ({ status: 'success' })),
			});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/wp-json/wcpos/v2/auth/test');
	});

	it('retries the legacy auth test in query form after path transport 404s', async () => {
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: jest.fn(async () => ({ status: 'success' })),
			});

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(String(fetchMock.mock.calls[2][0])).toContain('/wp-json/wcpos/v2/auth/test');
		expect(String(fetchMock.mock.calls[3][0])).toContain('rest_route=/wcpos/v2/auth/test');
	});

	it('flips to param mode when the echo shows the Authorization header stripped', async () => {
		const body = echoBody();
		(body.headers as Record<string, { received: boolean; length: number }>).authorization = {
			received: false,
			length: 0,
		};
		fetchMock.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => body) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: true,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns and logs credential-channel blocking without the legacy fallback', async () => {
		const body = echoBody({ params: { authorization: false, wcpos: true, store_id: true } });
		(body.headers as Record<string, { received: boolean; length: number }>).authorization = {
			received: false,
			length: 0,
		};
		fetchMock.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => body) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({ ok: false, code: ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mockAppLogger.error).toHaveBeenCalledWith(expect.any(String), {
			code: ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST,
			showToast: true,
			context: {
				wcposApiUrl: 'https://example.com/wp-json/wcpos/v2/',
				classification: 'AUTH_TOKEN_BLOCKED_BY_HOST',
			},
		});
	});

	it('reaches the path legacy test when the query echo answers with a non-probe 200', async () => {
		// Old server behind a sloppy cache: path echo 404 (route absent), query
		// echo answers 200 with garbage. Neither is network-dead, so the ladder
		// must fall through to auth/test — path first, since the path answered
		// at route level — never to both-transports-blocked.
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn(async () => '<html>') })
			.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => ({ status: 'success' })) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(String(fetchMock.mock.calls[2][0])).toContain('/wp-json/wcpos/v2/auth/test');
		expect(String(fetchMock.mock.calls[2][0])).not.toContain('rest_route');
	});

	it('retries the legacy test in query form when the path legacy transport is dead too', async () => {
		// path echo 404 → query echo garbage 200 → path auth/test 404 → query
		// auth/test succeeds: the query spelling carries the site.
		fetchMock
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn(async () => '<html>') })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => ({ status: 'success' })) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(String(fetchMock.mock.calls[3][0])).toContain('rest_route=/wcpos/v2/auth/test');
	});

	it('falls back to the legacy auth test when the echo body is incomplete', async () => {
		// { v: 1, headers: {}, params: {} } must read as probe-UNAVAILABLE, not
		// as "both channels blocked" — an empty map would otherwise skip the
		// legacy fallback on a healthy server.
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: jest.fn(async () => ({ v: 1, headers: {}, params: {} })),
			})
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => ({ status: 'success' })) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(String(fetchMock.mock.calls[2][0])).toContain('rest_route=/wcpos/v2/auth/test');
	});

	it('falls back to the legacy auth test when the echo body is not the probe shape', async () => {
		// A hostile host can answer 200 with an interstitial page; the guard
		// must treat that as echo-unavailable, not as an empty header map.
		fetchMock
			.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => ({ status: 'success' })) })
			.mockResolvedValueOnce({ ok: false, status: 404, json: jest.fn() })
			.mockResolvedValueOnce({ ok: true, json: jest.fn(async () => ({ status: 'success' })) });

		await expect(
			testAuthorizationMethod('https://example.com/wp-json/wcpos/v2/', 'token')
		).resolves.toEqual({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
			useProtocolHeaders: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(String(fetchMock.mock.calls[2][0])).toContain('rest_route=/wcpos/v2/auth/test');
	});
});
