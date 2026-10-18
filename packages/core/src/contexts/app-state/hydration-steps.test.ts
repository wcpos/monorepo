/** @jest-environment jsdom */

const mockRegisterPlugins = jest.fn();
jest.mock('@wcpos/query/user-db/bootstrap', () => {
	mockRegisterPlugins();
	return {};
});

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

jest.mock('@wcpos/database/create-db', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
	createUserDB: jest.fn(),
}));

jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	applyEmbeddedBootPayload: jest.fn(),
	openUserDatabase: jest.fn(),
	readSiteTransportInputs: jest.fn(),
	recordSiteTransport: jest.fn(),
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

// eslint-disable-next-line import/first -- Jest mocks must be registered before loading query commands.
import {
	applyEmbeddedBootPayload,
	openUserDatabase,
	readSiteTransportInputs,
	recordSiteTransport,
} from '@wcpos/query/user-db';
// eslint-disable-next-line import/first -- Keep imports after the logger mock initialization.
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import { type HydrationContext, hydrationSteps, switchUserSessionStore } from './hydration-steps';
// eslint-disable-next-line import/first -- Register the real engine port for session commits.
import { registerEngineScopeSwitcher } from './engine-scope-port';

beforeEach(() => {
	jest.mocked(applyEmbeddedBootPayload).mockReset();
	jest.mocked(openUserDatabase).mockReset();
	jest.mocked(readSiteTransportInputs).mockReset().mockResolvedValue({});
	jest.mocked(recordSiteTransport).mockReset();
});
afterEach(() => registerEngineScopeSwitcher(null));

const documentLookup = (document: unknown) => ({
	findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
});

// The embedded boot merges its payload into an existing credential document.
const mergeable = <T extends object>(doc: T) =>
	Object.assign(doc, { getLatest: () => doc, incrementalModify: jest.fn(async () => undefined) });

const pluginRegistrationsAtModuleLoad = mockRegisterPlugins.mock.calls.length;
it('loads the database plugins with the hydration module, before executing any step', () => {
	expect(pluginRegistrationsAtModuleLoad).toBe(1);
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
					states: { v2: appState },
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
				states: { v2: appState },
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

	it('refuses a store whose session would be incomplete, before the engine moves or the pointer persists', async () => {
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({})) });
		const appState = {
			get: jest.fn(async () => ({
				siteID: 'site-1',
				wpCredentialsID: 'cred-1',
				storeID: 'store-1',
			})),
			set: jest.fn(),
		};
		const switchEngineScope = jest.fn();
		registerEngineScopeSwitcher(switchEngineScope);

		await expect(
			switchUserSessionStore(
				{
					// The site row is gone — the #2112 shape.
					states: { v2: appState },
					sites: documentLookup(null),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-2' }),
				} as any,
				appState as any,
				'store-2'
			)
		).rejects.toThrow('Store session incomplete: missing site');

		expect(switchEngineScope).not.toHaveBeenCalled();
		expect(appState.set).not.toHaveBeenCalled();
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
		registerEngineScopeSwitcher(switchEngineScope);

		await expect(
			switchUserSessionStore(
				{
					states: { v2: appState },
					sites: documentLookup({ uuid: 'site-1' }),
					wp_credentials: documentLookup({ uuid: 'cred-1' }),
					stores: documentLookup({ localID: 'store-2' }),
				} as any,
				appState as any,
				'store-2'
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
		registerEngineScopeSwitcher(switchEngineScope);

		await switchUserSessionStore(
			{
				states: { v2: appState },
				sites: documentLookup({ uuid: 'site-1' }),
				wp_credentials: documentLookup({ uuid: 'cred-1' }),
				stores: documentLookup(store),
			} as any,
			appState as any,
			'store-2'
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
			// Fail-soft since it runs standalone too: it only refreshes optional
			// transport flags, and boot works on the persisted/default values.
			TEST_AUTHORIZATION: true,
			HYDRATE_USER_SESSION: false,
		});
	});
});

describe('PROCESS_INITIAL_PROPS', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each(['site', 'credentials', 'stores'])(
		'preserves URL cleanup ordering when the %s write throws',
		async (failureAt) => {
			window.history.replaceState({}, '', '/pos?store=2&keep=1');
			const failure = new Error('write failed');
			const write = (stage: string, value: unknown) => async () => {
				if (failureAt === stage) throw failure;
				return value;
			};
			const site = { uuid: 'site-1' };
			const userDB = {
				sites: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					insert: write('site', site),
				},
				wp_credentials: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					insert: write('credentials', { uuid: 'cred-1' }),
				},
				stores: { ...documentLookup(null), bulkInsert: write('stores', undefined) },
			};
			jest
				.mocked(applyEmbeddedBootPayload)
				.mockImplementation(jest.requireActual('@wcpos/query/user-db').applyEmbeddedBootPayload);
			try {
				await expect(
					hydrationSteps[1].execute({
						userDB,
						appState: { get: () => null },
						user: { uuid: 'user-1' },
						initialProps: { site, wp_credentials: { uuid: 'cred-1' }, stores: [{ id: 2 }] },
					} as unknown as HydrationContext)
				).rejects.toBe(failure);
				expect(window.location.search).toBe(failureAt === 'stores' ? '?keep=1' : '?store=2&keep=1');
			} finally {
				window.history.replaceState({}, '', '/');
			}
		}
	);

	it('hydrates and commits the processed store selection', async () => {
		const site = { uuid: 'site-1' };
		const credentials = { uuid: 'credentials-1' };
		const store = { localID: '0123456789' };
		const appState = { get: jest.fn(() => ({ storeID: store.localID })), set: jest.fn() };
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({})) });
		jest.mocked(applyEmbeddedBootPayload).mockResolvedValue({
			siteUuid: site.uuid,
			wpCredentialsUuid: credentials.uuid,
			stores: [{ id: 1, localID: store.localID }],
		});
		await hydrationSteps
			.find(({ name }) => name === 'PROCESS_INITIAL_PROPS')!
			.execute({
				userDB: {
					sites: documentLookup(site),
					wp_credentials: documentLookup(credentials),
					stores: documentLookup(store),
					states: { v2: appState },
				} as any,
				appState: appState as any,
				user: { uuid: 'user-1' } as any,
				initialProps: { site, wp_credentials: credentials, stores: [{ id: 1 }] },
			});
		expect(createStoreDBMock).toHaveBeenCalledWith(store.localID);
		expect(appState.set).toHaveBeenCalledWith('current', expect.any(Function));
	});

	it('reports AUTH131 and preserves the previous pointer for an incomplete selection', async () => {
		const previous = { siteID: 'old-site', storeID: 'old-store' };
		const site = { uuid: 'new-site' };
		const credentials = mergeable({ uuid: 'new-credentials', patch: jest.fn() });
		const appState = { get: jest.fn(() => previous), set: jest.fn() };
		const context = {
			appState,
			user: { uuid: 'user-1' },
			userDB: {
				sites: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					insert: jest.fn(async () => site),
				},
				wp_credentials: documentLookup(credentials),
				stores: { ...documentLookup(null), bulkInsert: jest.fn() },
			},
			initialProps: { site, wp_credentials: credentials, stores: [{ id: 1 }] },
		} as unknown as HydrationContext;
		jest.mocked(applyEmbeddedBootPayload).mockResolvedValue({
			siteUuid: site.uuid,
			wpCredentialsUuid: credentials.uuid,
			stores: [{ id: 1, localID: '0123456789' }],
		});
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS')!;
		expect(step.failSoft).toBe(true);
		await expect(step.execute(context)).resolves.not.toHaveProperty('session');
		expect(mockAppLogger.error).toHaveBeenCalledWith(
			'Store session incomplete: missing storeDB, store, site, extraData',
			{
				code: ERROR_CODES.STORE_SESSION_INCOMPLETE,
				context: {
					missingFields: ['storeDB', 'store', 'site', 'extraData'],
					siteID: 'new-site',
					wpCredentialsID: 'new-credentials',
					storeID: '0123456789',
				},
			}
		);
		expect(appState.set).not.toHaveBeenCalled();
	});

	it('merges the embedded credential, so a failure before the stores patch keeps its links', async () => {
		// Storage preservation is pinned in query's applyEmbeddedBootPayload suite.
		// Core passes the narrow payload through and must not commit after a failure.
		const failure = new Error('store insert failed');
		jest.mocked(applyEmbeddedBootPayload).mockRejectedValueOnce(failure);
		const userDB = {};
		const user = { uuid: 'user-1' };
		const initialProps = {
			site: { uuid: 'site-1' },
			wp_credentials: { uuid: 'credentials-1', display_name: 'New Name' },
			stores: [{ id: 1 }],
		};
		const appState = { get: jest.fn(async () => null), set: jest.fn() };
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS')!;

		expect(step.failSoft).toBe(true);
		await expect(
			step.execute({ userDB, user, initialProps, appState } as unknown as HydrationContext)
		).rejects.toBe(failure);
		expect(applyEmbeddedBootPayload).toHaveBeenCalledWith(
			userDB,
			initialProps,
			user,
			expect.any(Function)
		);
		expect(appState.set).not.toHaveBeenCalled();
	});
});

describe('HYDRATE_USER_SESSION', () => {
	it.each([true, false])(
		'refreshes cached documents after authorization sets flags to %s without a second open',
		async (flag) => {
			createStoreDBMock.mockClear();
			const storeDB = { addState: jest.fn(async () => ({})) };
			createStoreDBMock.mockResolvedValue(storeDB);
			const site = {
				uuid: 'site-1',
				wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
				use_jwt_as_param: !flag,
				use_rest_route_param: !flag,
				use_protocol_headers: !flag,
				getLatest: () => latestSite,
				incrementalPatch: async (patch: Record<string, unknown>) => {
					latestSite = { ...latestSite, ...patch };
					return latestSite;
				},
			};
			let latestSite = site;
			const credentials = mergeable({
				uuid: 'credentials-1',
				access_token: 'token',
				patch: jest.fn(),
			});
			const store = { localID: '0123456789' };
			let current: { siteID?: string; wpCredentialsID?: string; storeID?: string } | null = null;
			const context = {
				appState: {
					get: () => current,
					set: async (_key: string, update: () => typeof current) => {
						current = update();
					},
				},
				user: { uuid: 'user-1' },
				userDB: {
					sites: {
						findOne: jest.fn().mockReturnValue({ exec: async () => site }),
						schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
						insert: async () => site,
					},
					wp_credentials: documentLookup(credentials),
					stores: {
						findOne: jest.fn().mockReturnValue({ exec: async () => store }),
						bulkInsert: jest.fn(),
					},
				},
				initialProps: { site, wp_credentials: credentials, stores: [{ id: 1 }] },
			} as unknown as HydrationContext;
			Object.assign(context.userDB!, { states: { v2: context.appState } });
			jest.mocked(openUserDatabase).mockResolvedValue({
				userDB: context.userDB!,
				sessionPointer: context.appState!,
				translationsCache: context.appState!,
				user: context.user!,
			});
			jest.mocked(applyEmbeddedBootPayload).mockResolvedValue({
				siteUuid: site.uuid,
				wpCredentialsUuid: credentials.uuid,
				stores: [{ id: 1, localID: store.localID }],
			});
			jest.mocked(recordSiteTransport).mockImplementation(async (_db, _uuid, flags) => {
				latestSite = {
					...latestSite,
					use_jwt_as_param: !!flags.useJwtAsParam,
					use_rest_route_param: !!flags.useRestRouteParam,
					use_protocol_headers: !!flags.useProtocolHeaders,
				};
			});
			jest.requireMock('./initial-props').initialProps = context.initialProps;
			const originalFetch = platformFetchRef.fn;
			platformFetchRef.fn = jest.fn(async (url) => ({
				status: flag && !String(url).includes('rest_route') ? 404 : 200,
				ok: !flag || String(url).includes('rest_route'),
				json: async () => ({
					v: 1,
					headers: { authorization: { received: !flag, length: 12 } },
					cors: { reflects_request_headers: flag },
					params: { authorization: true, wcpos: true, store_id: true },
				}),
			}));
			try {
				for (const step of hydrationSteps) {
					if (!step.shouldExecute || step.shouldExecute(context)) {
						Object.assign(context, await step.execute(context));
					}
				}
			} finally {
				platformFetchRef.fn = originalFetch;
				jest.requireMock('./initial-props').initialProps = null;
			}
			expect(context.site).toBe(latestSite);
			expect(context.site).not.toBe(site);
			expect(context.site).toMatchObject({
				use_jwt_as_param: flag,
				use_rest_route_param: flag,
				use_protocol_headers: flag,
			});
			expect(createStoreDBMock).toHaveBeenCalledTimes(1);
			expect(context.storeDB).toBe(storeDB);
			expect(context.extraData).toBe(context.session?.extraData);
			const hydrateStep = hydrationSteps.find(({ name }) => name === 'HYDRATE_USER_SESSION')!;

			current = { siteID: site.uuid, wpCredentialsID: credentials.uuid, storeID: 'another-store' };
			await hydrateStep.execute(context);
			expect(createStoreDBMock).toHaveBeenCalledTimes(2);
		}
	);

	it('returns incomplete persisted hydration for provider recovery rather than committing or throwing a presence assertion', async () => {
		const credentials = { uuid: 'credentials-1' };
		const appState = {
			get: jest.fn(() => ({
				siteID: 'site-1',
				wpCredentialsID: credentials.uuid,
				storeID: 'store-1',
			})),
			set: jest.fn(),
		};
		const step = hydrationSteps.find(({ name }) => name === 'HYDRATE_USER_SESSION')!;
		await expect(
			step.execute({
				appState,
				userDB: {
					sites: documentLookup(null),
					wp_credentials: documentLookup(credentials),
					stores: documentLookup(null),
				},
			} as unknown as HydrationContext)
		).resolves.toEqual({
			site: null,
			wpCredentials: credentials,
			store: null,
			storeDB: undefined,
			extraData: undefined,
		});
		expect(appState.set).not.toHaveBeenCalled();
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

		expect(recordSiteTransport).toHaveBeenCalledWith(
			expect.anything(),
			'site-1',
			expect.objectContaining({
				useJwtAsParam: false,
				useRestRouteParam: false,
				useProtocolHeaders: false,
				useInstanceHeader: false,
			})
		);
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

		expect(recordSiteTransport).not.toHaveBeenCalled();
	});

	it('standalone web resolves the current session site and persists the transport verdict', async () => {
		// Standalone has no boot payload; the step must resolve the session's
		// site itself, or the whole standalone fleet never gains (or sheds) the
		// header-transport verdict without a manual reconnect.
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn(async () => ({
				v: 1,
				headers: {
					authorization: { received: true, length: 12 },
					// Floor keys the probe never sends: they prove header capability
					// and must NOT read as dead headers.
					'x-wcpos-protocol': { received: false, length: 0 },
					'x-wcpos-client': { received: false, length: 0 },
				},
				params: { authorization: true, wcpos: true, store_id: true },
			})),
		});
		const siteDoc = {
			uuid: 'site-1',
			wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
			use_jwt_as_param: true,
			use_protocol_headers: false,
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

		jest.mocked(readSiteTransportInputs).mockResolvedValue({
			siteUuid: siteDoc.uuid,
			wcposApiUrl: siteDoc.wcpos_api_url,
			accessToken: 'token',
			wpApiUrl: undefined,
			wcposVersion: undefined,
		});
		await step!.execute({
			userDB: {
				sites: documentLookup(siteDoc),
				wp_credentials: documentLookup({ access_token: 'token' }),
			} as never,
			appState: {
				get: jest.fn(async () => ({ siteID: 'site-1', wpCredentialsID: 'cred-1' })),
			} as never,
			initialProps: null,
		});

		expect(recordSiteTransport).toHaveBeenCalledWith(
			expect.anything(),
			'site-1',
			expect.objectContaining({
				useJwtAsParam: false,
				useRestRouteParam: false,
				useProtocolHeaders: true,
				useInstanceHeader: false,
			})
		);
		// Unsent floor names are unknown, not dead: no false alarm on a healthy store.
		expect(mockAppLogger.warn).not.toHaveBeenCalledWith(
			'Some POS request headers do not reach this server',
			expect.anything()
		);
	});

	it('standalone web with no current session skips the probe entirely', async () => {
		const step = hydrationSteps.find(({ name }) => name === 'TEST_AUTHORIZATION');

		await expect(
			step!.execute({
				userDB: { sites: documentLookup(null) } as never,
				appState: { get: jest.fn(async () => null) } as never,
				initialProps: null,
			})
		).resolves.toEqual({});

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
