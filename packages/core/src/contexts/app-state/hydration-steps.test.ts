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

jest.mock('@wcpos/database/create-db', () => ({
	createStoreDB: (...args: unknown[]) => createStoreDBMock(...args),
}));

jest.mock('@wcpos/database', () => ({
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
import { type HydrationContext, hydrationSteps, switchUserSessionStore } from './hydration-steps';
// eslint-disable-next-line import/first -- Register the real engine port for session commits.
import { registerEngineScopeSwitcher } from './engine-scope-port';

afterEach(() => registerEngineScopeSwitcher(null));

const documentLookup = (document: unknown) => ({
	findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
});

// The embedded boot merges its payload into an existing credential document.
const mergeable = <T extends object>(doc: T) =>
	Object.assign(doc, { getLatest: () => doc, incrementalModify: jest.fn(async () => undefined) });

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

	it('merges server-owned fields into existing stores and inserts new stores', async () => {
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({})) });
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
		const wpCredentialsDoc = mergeable({
			uuid: 'credentials-1',
			patch: jest.fn(async () => undefined),
		});
		const bulkInsert = jest.fn(async () => undefined);
		const userDB = {
			sites: {
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => siteDoc) }),
				incrementalUpsert: jest.fn(async () => siteDoc),
			},
			wp_credentials: documentLookup(wpCredentialsDoc),
			stores: {
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => existingStore) })
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => existingStore) }),
				bulkInsert,
			},
		};
		const appState = {
			get: jest.fn(async () => ({ storeID: existingStore.localID })),
			set: jest.fn(async () => undefined),
		};
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS');

		await step!.execute({
			userDB: { ...userDB, states: { v2: appState } } as any,
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
		expect(createStoreDBMock).toHaveBeenCalledWith(existingStore.localID);
		expect(appState.set).toHaveBeenCalledWith('current', expect.any(Function));
		expect(bulkInsert).toHaveBeenCalledWith([
			expect.objectContaining({
				id: 2,
				name: 'New Store',
				prevent_overselling: false,
			}),
		]);
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
					incrementalUpsert: jest.fn(async () => site),
				},
				wp_credentials: documentLookup(credentials),
				stores: { ...documentLookup(null), bulkInsert: jest.fn() },
			},
			initialProps: { site, wp_credentials: credentials, stores: [{ id: 1 }] },
		} as unknown as HydrationContext;
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
		// The payload carries no `stores`, `last_access` or `date_*`. A full-document
		// upsert reset them until the step's final patch, so a throw in between (the
		// step fails soft) persisted `stores: []` and the app showed no stores.
		const original = {
			uuid: 'credentials-1',
			display_name: 'Old Name',
			stores: ['store-a'],
			last_access: '2026-10-01T00:00:00.000Z',
			date_created_gmt: '2026-01-01T00:00:00',
			date_modified_gmt: '2026-09-01T00:00:00',
		};
		let stored: Record<string, unknown> = { ...original };
		type Modifier = (current: Record<string, unknown>) => Record<string, unknown>;
		const credentialDoc = {
			uuid: original.uuid,
			getLatest: () => credentialDoc,
			incrementalModify: jest.fn(async (modify: Modifier) => {
				stored = modify({ ...stored });
			}),
			patch: jest.fn(async (patch: Record<string, unknown>) => {
				stored = { ...stored, ...patch };
			}),
		};
		// RxDB's `upsert` replaces the document: omitted properties take their defaults.
		const upsert = jest.fn(async (json: Record<string, unknown>) => {
			stored = {
				stores: [],
				last_access: '',
				date_created_gmt: '',
				date_modified_gmt: '',
				...json,
			};
			return credentialDoc;
		});
		const credentialLookup = documentLookup(credentialDoc);
		const site = { uuid: 'site-1' };
		const context = {
			appState: { get: jest.fn(async () => null), set: jest.fn() },
			user: { uuid: 'user-1' },
			userDB: {
				sites: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					incrementalUpsert: jest.fn(async () => site),
				},
				wp_credentials: { ...credentialLookup, upsert, incrementalUpsert: upsert },
				stores: {
					...documentLookup(null),
					bulkInsert: jest.fn(async () => {
						throw new Error('store insert failed');
					}),
				},
			},
			initialProps: {
				site,
				wp_credentials: { uuid: original.uuid, display_name: 'New Name' },
				stores: [{ id: 1 }],
			},
		} as unknown as HydrationContext;
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS')!;

		await expect(step.execute(context)).rejects.toThrow('store insert failed');
		expect(credentialLookup.findOne).toHaveBeenCalledWith('credentials-1');
		expect(upsert).not.toHaveBeenCalled();
		expect(stored).toEqual({ ...original, display_name: 'New Name' });
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
						findOne: jest
							.fn()
							.mockReturnValueOnce({ exec: async () => null })
							.mockReturnValue({ exec: async () => site }),
						schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
						incrementalUpsert: async () => site,
					},
					wp_credentials: documentLookup(credentials),
					stores: {
						findOne: jest
							.fn()
							.mockReturnValueOnce({ exec: async () => null })
							.mockReturnValue({ exec: async () => store }),
						bulkInsert: jest.fn(),
					},
				},
				initialProps: { site, wp_credentials: credentials, stores: [{ id: 1 }] },
			} as unknown as HydrationContext;
			const database = Object.assign(context.userDB!, {
				states: { v2: context.appState },
				addState: async () => context.appState,
				users: documentLookup(context.user),
				// CREATE_USER_DB also ensures the register document on this lane; an existing
				// one keeps ensureRegister from inserting.
				getLocal: async () => ({ toJSON: () => ({ data: { id: 'register-1', sites: {} } }) }),
			});
			jest.requireMock('@wcpos/database').createUserDB.mockResolvedValue(database);
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

describe('PROCESS_INITIAL_PROPS display advertisement', () => {
	it('keeps a display advertisement the initial props do not carry', async () => {
		// The free plugin builds inline initial props without Pro's store filters,
		// so `display` is never present there; the cashier response is the only
		// payload that may withdraw it.
		type StoreData = Record<string, unknown> & { display?: unknown };
		type StoreDouble = StoreData & {
			incrementalPatch: jest.Mock<Promise<void>, [Record<string, unknown>]>;
			incrementalModify: jest.Mock<Promise<void>, [(doc: StoreData) => StoreData]>;
			getLatest: () => StoreDouble;
		};
		const existingStore: StoreDouble = {
			id: 1,
			localID: '0123456789',
			display: { contract: 1, signaling: '/wcpos/v2/display' },
			incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
				Object.assign(existingStore, patch);
			}),
			incrementalModify: jest.fn(async (modify: (doc: StoreData) => StoreData) => {
				const next = modify({ ...existingStore });
				delete existingStore.display;
				Object.assign(existingStore, next);
			}),
			getLatest: () => existingStore,
		};
		const siteDoc = { uuid: 'site-1' };
		const wpCredentialsDoc = mergeable({
			uuid: 'credentials-1',
			patch: jest.fn(async () => undefined),
		});
		// The changed pointer is hydrated before it is committed (main #2127): the
		// existence check sees no site yet, the hydration afterwards finds the upserted
		// one, the credentials and the store, and opens the store database.
		createStoreDBMock.mockResolvedValue({ addState: jest.fn(async () => ({ id: 'state' })) });
		const userDB = {
			sites: {
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => siteDoc) }),
				incrementalUpsert: jest.fn(async () => siteDoc),
			},
			wp_credentials: documentLookup(wpCredentialsDoc),
			stores: {
				findOne: jest.fn(() => ({ exec: jest.fn(async () => existingStore) })),
				bulkInsert: jest.fn(async () => undefined),
			},
		};
		const appState = {
			get: jest.fn(async () => ({ storeID: existingStore.localID })),
			set: jest.fn(async () => undefined),
		};
		type StepContext = Parameters<NonNullable<(typeof hydrationSteps)[number]['execute']>>[0];
		const step = hydrationSteps.find(({ name }) => name === 'PROCESS_INITIAL_PROPS');
		await step!.execute({
			userDB: { ...userDB, states: { v2: appState } } as unknown as StepContext['userDB'],
			appState: appState as unknown as StepContext['appState'],
			user: { uuid: 'user-1' } as unknown as StepContext['user'],
			initialProps: {
				site: siteDoc,
				wp_credentials: wpCredentialsDoc,
				stores: [{ id: 1, calc_taxes: 'yes' }],
			},
		});
		expect(existingStore.display).toEqual({ contract: 1, signaling: '/wcpos/v2/display' });
		expect(existingStore.incrementalModify).not.toHaveBeenCalled();
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
			use_instance_header: false,
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

		expect(siteDoc.incrementalPatch).toHaveBeenCalledWith({
			use_jwt_as_param: false,
			use_rest_route_param: false,
			use_protocol_headers: true,
			use_instance_header: false,
		});
		expect(siteDoc.use_protocol_headers).toBe(true);
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
