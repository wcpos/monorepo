import { scopeDatabaseName } from '@wcpos/sync-core';

import type { CreateAppSyncEngineOptions } from './create-app-engine';

const BASE_OPTIONS = {
	wpApiUrl: 'https://store.example.test/wp-json/',
	credentials: { getLatest: () => ({ access_token: 'test-token' }) },
	scope: {
		site: 'https://store.example.test',
		storeId: 'store-1',
		cashierId: 'cashier-1',
	},
	multiInstance: false,
	useRestRouteParam: false,
} satisfies CreateAppSyncEngineOptions;

const OTHER_SITE_OPTIONS = {
	...BASE_OPTIONS,
	wpApiUrl: 'https://other.example.test/wp-json/',
	scope: {
		...BASE_OPTIONS.scope,
		site: 'https://other.example.test',
	},
} satisfies CreateAppSyncEngineOptions;

type ScopeIdentity = { site: string; storeId: string | number; cashierId: string | number };

function createEngineDouble(
	dispose: () => Promise<void> = () => Promise.resolve(),
	switchScope?: (identity: ScopeIdentity) => Promise<void>
) {
	const dbListeners = new Set<(db: unknown) => void>();
	let active: { identity: ScopeIdentity } | null = null;
	const activate = (identity: ScopeIdentity | null) => {
		active = identity ? { identity } : null;
		for (const cb of dbListeners) cb({});
	};
	return {
		dispose: jest.fn(dispose),
		scope: {
			// A resolved switch means the engine ACTIVATED the scope (db$ fired);
			// a custom impl decides for itself whether and when it activates.
			switch: jest.fn(
				switchScope ??
					((identity: ScopeIdentity) => {
						activate(identity);
						return Promise.resolve();
					})
			),
		},
		db$: jest.fn((cb: (db: unknown) => void) => {
			dbListeners.add(cb);
			cb(active ? {} : null);
			return () => dbListeners.delete(cb);
		}),
		active: jest.fn(() => active),
		/** The engine landing on `identity`: active() flips and db$ fans out, as the real engine does inside scope.switch. */
		activate,
	};
}

function loadCreateAppEngine(
	createEngine: () => ReturnType<typeof createEngineDouble> = createEngineDouble,
	platformIsWeb = false,
	initiallyActive = true
) {
	jest.resetModules();
	const appMetricsObserver = jest.fn();
	const reportNetworkResponse = jest.fn();
	const recordTransport = jest.fn();
	const recordServerLoad = jest.fn();
	const networkInfo = jest.fn();
	const networkWarn = jest.fn();
	const networkError = jest.fn();
	const markStorageTerminallyFailed = jest.fn((_databaseName: string, _reason: string) => true);
	const forceFreeDatabaseRegistration = jest.fn((_databaseName: string) => true);
	const getDatabaseEpoch = jest.fn(() => 0);
	const writeLeaders: {
		isLeader: jest.Mock<boolean>;
		dispose: jest.Mock<void>;
	}[] = [];
	const electWriteLeader = jest.fn(() => {
		const leader = { isLeader: jest.fn(() => true), dispose: jest.fn() };
		writeLeaders.push(leader);
		return leader;
	});
	const writeOutcomeBridges: {
		moveTo: jest.Mock<void, [string | null]>;
		close: jest.Mock<void>;
		publish: jest.Mock<void>;
		subscribe: jest.Mock;
	}[] = [];
	const createWriteOutcomeBridge = jest.fn(() => {
		const bridge = {
			moveTo: jest.fn(),
			close: jest.fn(),
			publish: jest.fn(),
			subscribe: jest.fn(() => () => undefined),
		};
		writeOutcomeBridges.push(bridge);
		return bridge;
	});
	const writeOutcomeChannelName = jest.fn(
		(databaseName: string) => `wcpos-write-outcomes:${databaseName}`
	);
	const createRxdbSyncEngine = jest.fn(
		(
			_ports: {
				fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
				queryTotal?: {
					fetchWooQueryTotal(input: {
						request: {
							queryKey: string;
							endpoint: string;
							params: Record<string, string | number | boolean>;
							totalHeader: 'X-WP-Total';
						};
						signal?: AbortSignal;
					}): Promise<number | null>;
				};
				databaseOpenBarrier?: Promise<void>;
				diagnostics?: typeof appMetricsObserver;
				multiInstance?: boolean;
				writePlaneOwner?: () => boolean;
				holdAutomaticTicks?: () => boolean;
				writeOutcomeBridge?: { moveTo: (name: string | null) => void };
			},
			scope: ScopeIdentity
		) => {
			const engine = createEngine();
			if (initiallyActive) engine.activate(scope);
			return engine;
		}
	);

	jest.doMock('@wcpos/sync-engine', () => ({
		createRxdbSyncEngine,
		createWriteOutcomeBridge,
		// The engine fetcher hydrates 2xx responses through this seam (B9); an
		// identity stub keeps these engine-lifecycle tests transport-free.
		hydrateResponse: jest.fn(async (response: Response) => response),
		writeOutcomeChannelName,
	}));
	jest.doMock('@wcpos/hooks', () => ({ reportNetworkResponse }), {
		virtual: true,
	});
	jest.doMock('@wcpos/utils/platform', () => ({
		Platform: { isWeb: platformIsWeb },
	}));
	jest.doMock('./web-write-leader', () => ({ electWriteLeader }));
	jest.doMock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({
		markStorageTerminallyFailed,
	}));
	jest.doMock('@wcpos/database/plugins/rx-database-registry', () => ({
		forceFreeDatabaseRegistration,
	}));
	jest.doMock('@wcpos/database/adapters/default', () => ({
		defaultConfig: { storage: { name: 'test-storage' } },
	}));
	jest.doMock('@wcpos/utils/logger', () => ({
		getLogger: jest.fn(() => ({
			debug: jest.fn(),
			info: networkInfo,
			warn: networkWarn,
			error: networkError,
		})),
		getDatabaseEpoch,
	}));
	jest.doMock('./metrics', () => ({
		appMetricsObserver,
		recordTransport,
		recordServerLoad,
		collectionFromSyncUrl: jest.fn(() => undefined),
		getMetricsEpoch: jest.fn(() => 0),
	}));

	const { createAppSyncEngine, switchAppEngineScope } =
		jest.requireActual<typeof import('./create-app-engine')>('./create-app-engine');
	return {
		createAppSyncEngine,
		switchAppEngineScope,
		createRxdbSyncEngine,
		appMetricsObserver,
		recordTransport,
		recordServerLoad,
		reportNetworkResponse,
		networkInfo,
		networkWarn,
		networkError,
		markStorageTerminallyFailed,
		forceFreeDatabaseRegistration,
		getDatabaseEpoch,
		electWriteLeader,
		writeLeaders,
		createWriteOutcomeBridge,
		writeOutcomeBridges,
	};
}

describe('createAppSyncEngine scope cache', () => {
	it('prompts sign-in once per newly exhausted token', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine, networkError } = loadCreateAppEngine();
		let accessToken = 'rejected-token';
		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: { getLatest: () => ({ access_token: accessToken }) },
			refreshAuth: async () => accessToken,
		});
		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		const prompts = () => networkError.mock.calls.filter(([, options]) => options.showToast);
		try {
			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			expect(prompts()).toEqual([
				[
					expect.stringContaining('sign in again'),
					expect.objectContaining({ code: 'AUTH101', showToast: true }),
				],
			]);

			accessToken = 'another-rejected-token';
			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			expect(prompts()).toHaveLength(2);
		} finally {
			fetch.mockRestore();
		}
	});

	it('does not prompt for a store the engine has already been switched away from', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine, networkError } = loadCreateAppEngine();
		let accessToken = 'rejected-token';
		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: { getLatest: () => ({ access_token: accessToken }) },
			refreshAuth: async () => accessToken,
		});
		const supersededPorts = createRxdbSyncEngine.mock.calls[0]![0];
		const prompts = () => networkError.mock.calls.filter(([, options]) => options.showToast);
		try {
			// The cashier switches to another store; the cached engine is replaced.
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, site: 'https://other.example.test' },
			});

			// A 401 retry that was already in flight on the OLD engine now settles.
			await supersededPorts.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');

			expect(prompts()).toEqual([]);
			// The obsolete engine still latches, so its own lanes stay held.
			expect(supersededPorts.holdAutomaticTicks?.()).toBe(true);
		} finally {
			fetch.mockRestore();
		}
	});

	it('holds automatic ticks for an exhausted token until live credentials change', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const { requestStateManager } = jest.requireActual<
			typeof import('@wcpos/hooks/use-http-client')
		>('@wcpos/hooks/use-http-client');
		const setAuthFailed = jest.spyOn(requestStateManager, 'setAuthFailed');
		let accessToken = 'expired-token';
		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: { getLatest: () => ({ access_token: accessToken }) },
			refreshAuth: async () => {
				accessToken = 'rejected-token';
				return accessToken;
			},
		});
		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		try {
			expect(ports.holdAutomaticTicks?.()).toBe(false);
			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			expect(ports.holdAutomaticTicks?.()).toBe(true);
			expect(setAuthFailed).not.toHaveBeenCalled();
			expect(requestStateManager.isAuthFailed()).toBe(false);
			createAppSyncEngine({
				...BASE_OPTIONS,
				credentials: { getLatest: () => ({ access_token: 'reauthenticated-token' }) },
			});
			expect(ports.holdAutomaticTicks?.()).toBe(false);
		} finally {
			setAuthFailed.mockRestore();
			fetch.mockRestore();
		}
	});

	it('passes query transport through to exact GET and push POST URLs', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 200 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine({
			...BASE_OPTIONS,
			wpApiUrl: 'https://store.example.test/?rest_route=/',
			useRestRouteParam: true,
		});
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products?page=2');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=7', {
			method: 'POST',
		});

		expect(fetch.mock.calls[0]?.[0]).toBe(
			'https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fproducts&page=2&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&store_id=store-1&_wcpos_envelope=1'
		);
		expect(fetch.mock.calls[1]?.[0]).toBe(
			'https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fpush%2Forders&cursor=7&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&store_id=store-1'
		);
		fetch.mockRestore();
	});

	it('reports settled non-server-error transport responses as network pulses', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(1234);
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockRejectedValueOnce(new Error('network down'));
		const { createAppSyncEngine, createRxdbSyncEngine, reportNetworkResponse } =
			loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await expect(fetcher?.('https://store.example.test/wp-json/wcpos/v2/products')).rejects.toThrow(
			'network down'
		);

		expect(reportNetworkResponse).toHaveBeenCalledTimes(2);
		expect(reportNetworkResponse).toHaveBeenNthCalledWith(
			1,
			'https://store.example.test/wp-json/',
			1234
		);
		expect(reportNetworkResponse).toHaveBeenNthCalledWith(
			2,
			'https://store.example.test/wp-json/',
			1234
		);
		now.mockRestore();
		fetch.mockRestore();
	});

	it('preserves the response timestamp when a 401 event is emitted after a failed retry', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(100);
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementationOnce(async () => {
				now.mockReturnValue(200);
				return new Response(null, { status: 401 });
			})
			.mockImplementationOnce(async () => {
				now.mockReturnValue(800);
				throw new Error('network down');
			});
		const { createAppSyncEngine, createRxdbSyncEngine, reportNetworkResponse } =
			loadCreateAppEngine();
		createAppSyncEngine({
			...BASE_OPTIONS,
			refreshAuth: async () => 'refreshed-token',
		});
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await expect(fetcher?.('https://store.example.test/wp-json/wcpos/v2/products')).rejects.toThrow(
			'network down'
		);

		expect(reportNetworkResponse).toHaveBeenCalledWith('https://store.example.test/wp-json/', 200);
		now.mockRestore();
		fetch.mockRestore();
	});

	it('A → B → A invalidates requests from both the first A and B clock-skew generations', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
		let resolveB!: (response: Response) => void;
		let resolveRefresh!: (token: string) => void;
		const refreshAuth = jest.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveRefresh = resolve;
				})
		);
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						resolveB = resolve;
					})
			)
			.mockResolvedValueOnce(
				new Response(null, {
					status: 200,
					headers: { Date: 'Thu, 01 Jan 1970 00:02:00 GMT' },
				})
			)
			.mockResolvedValueOnce(
				new Response(null, {
					status: 200,
					headers: { Date: 'Thu, 01 Jan 1970 00:03:00 GMT' },
				})
			);
		const { createAppSyncEngine, createRxdbSyncEngine, networkWarn } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
		const priorRequest = fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(refreshAuth).toHaveBeenCalledTimes(1);

		createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
		const requestFromB = fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		createAppSyncEngine(BASE_OPTIONS);
		resolveRefresh('refreshed-token');
		await priorRequest;
		resolveB(new Response(null, { headers: { Date: 'Thu, 01 Jan 1970 00:04:00 GMT' } }));
		await requestFromB;
		expect(networkWarn).not.toHaveBeenCalled();
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');

		expect(networkWarn).toHaveBeenCalledTimes(1);
		expect(networkWarn).toHaveBeenCalledWith(
			'Server clock is 180s ahead of the device clock',
			expect.any(Object)
		);
		now.mockRestore();
		fetch.mockRestore();
	});

	it('persists warn/error readiness and lane diagnostics to the health log', () => {
		const {
			createAppSyncEngine,
			createRxdbSyncEngine,
			appMetricsObserver,
			networkWarn,
			networkError,
		} = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const diagnostics = createRxdbSyncEngine.mock.calls[0]?.[0].diagnostics;

		diagnostics?.({
			type: 'engine.ready-stalled',
			level: 'error',
			message: 'open stalled',
			fields: { phase: 'create-database', elapsedMs: 15_000 },
		});
		diagnostics?.({
			type: 'engine.pos-bootstrap-error',
			level: 'warn',
			message: 'seed failed',
			fields: { scopeId: 'scope-1' },
		});
		diagnostics?.({
			type: 'engine.lane.tick',
			level: 'error',
			fields: { lane: 'change-signal', status: 'error' },
		});

		expect(appMetricsObserver).toHaveBeenCalledTimes(3);
		expect(networkError).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('engine.lane.tick', {
			code: 'SYNC401',
			context: expect.objectContaining({
				type: 'engine.lane.tick',
				lane: 'change-signal',
				status: 'error',
			}),
			terminal: {
				operationType: 'sync.lane',
				outcome: 'failed',
			},
		});
		expect(networkWarn).toHaveBeenCalledTimes(2);
		expect(networkWarn).toHaveBeenCalledWith('open stalled', {
			code: 'CLIENT111',
			context: expect.objectContaining({
				type: 'engine.ready-stalled',
				phase: 'create-database',
				elapsedMs: 15_000,
			}),
			terminal: {
				operationType: 'sync.startup',
				outcome: 'unknown',
			},
		});
		expect(networkWarn).toHaveBeenCalledWith('seed failed', {
			code: 'CLIENT101',
			context: expect.objectContaining({
				type: 'engine.pos-bootstrap-error',
				scopeId: 'scope-1',
			}),
			terminal: {
				operationType: 'sync.startup',
				outcome: 'failed',
			},
		});
	});

	it('persists a warn/error diagnostics event to the log database', () => {
		const { createAppSyncEngine, createRxdbSyncEngine, networkError } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const diagnostics = createRxdbSyncEngine.mock.calls[0]?.[0].diagnostics;

		diagnostics?.({
			type: 'push.error',
			level: 'error',
			collection: 'orders',
			message: 'HTTP 500',
		});

		expect(networkError).toHaveBeenCalledWith('HTTP 500', {
			code: 'SYNC121',
			context: expect.objectContaining({
				type: 'push.error',
				direction: 'push',
			}),
			terminal: { operationType: 'sync.record', outcome: 'failed' },
		});
	});

	it('drops a superseded engine’s late diagnostics from the health log', () => {
		const { createAppSyncEngine, createRxdbSyncEngine, appMetricsObserver, networkError } =
			loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const outgoingDiagnostics = createRxdbSyncEngine.mock.calls[0]?.[0].diagnostics;
		// A site change disposes the first engine and caches the second.
		createAppSyncEngine(OTHER_SITE_OPTIONS);
		const incomingDiagnostics = createRxdbSyncEngine.mock.calls[1]?.[0].diagnostics;

		// The outgoing engine's initial-open chain settles late: metrics still
		// tally it, but nothing lands in the incoming store's health log.
		outgoingDiagnostics?.({
			type: 'engine.ready-failed',
			level: 'error',
			message: 'late failure',
		});
		expect(appMetricsObserver).toHaveBeenCalledTimes(1);
		expect(networkError).not.toHaveBeenCalled();

		incomingDiagnostics?.({
			type: 'engine.ready-failed',
			level: 'error',
			message: 'live failure',
		});
		expect(networkError).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('live failure', {
			code: 'CLIENT101',
			context: expect.objectContaining({ type: 'engine.ready-failed' }),
			terminal: {
				operationType: 'sync.startup',
				outcome: 'failed',
			},
		});
	});

	// A logging sink must NEVER be able to fail the request it is describing. This
	// call site is on the fetcher's success path, so before the guard an escaping
	// observer exception propagated out of fetcher() and looked to the caller like
	// a failed HTTP request — turning a request that actually succeeded into a
	// failure (and, on the push path, a lost order).
	it('returns the identical engine when the same scope is constructed twice', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();

		const first = createAppSyncEngine(BASE_OPTIONS);
		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope },
		});

		expect(second).toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
	});

	it('switches scope in place when the store changes on the same site', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);
		const changedScope = { ...BASE_OPTIONS.scope, storeId: 'store-2' };

		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: changedScope,
		});
		const cached = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: changedScope,
		});

		expect(second).toBe(first);
		expect(cached).toBe(first);
		expect(first.scope.switch).toHaveBeenCalledWith(changedScope);
		expect(first.scope.switch).toHaveBeenCalledTimes(1);
		expect(first.dispose).not.toHaveBeenCalled();
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
	});

	it('disposes and recreates when the site changes', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		const second = createAppSyncEngine(OTHER_SITE_OPTIONS);

		expect(second).not.toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(2);
		expect(first.dispose).toHaveBeenCalledTimes(1);
	});

	it('awaited scope switch commits the cache identity only on success', async () => {
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } =
			loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		await switchAppEngineScope({
			site: { wp_api_url: BASE_OPTIONS.scope.site },
			wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
			store: { id: 'store-2' },
		});

		expect(first.scope.switch).toHaveBeenCalledWith({
			site: BASE_OPTIONS.scope.site,
			storeId: 'store-2',
			cashierId: BASE_OPTIONS.scope.cashierId,
		});
		// The follow-up render with the new scope is a plain cache hit — no second
		// transition, no engine recreation.
		const cached = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
		expect(cached).toBe(first);
		expect(first.scope.switch).toHaveBeenCalledTimes(1);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
	});

	it('publishes header, leadership and outcome channel at activation before switch settlement', async () => {
		// Before activation the outgoing scope's lanes may still be running and
		// must keep their own header; after it, the incoming open's hydrate,
		// seed and prime must carry the new one.
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		const storeHeaderOf = (call: unknown[]) =>
			new Headers((call[1] as RequestInit | undefined)?.headers).get('X-WCPOS-Store');
		const seen: (string | null)[] = [];
		let ports: { fetcher?: (url: string) => Promise<Response> } = {};
		let first!: ReturnType<typeof createEngineDouble>;
		first = createEngineDouble(undefined, async (identity) => {
			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');
			seen.push(storeHeaderOf(fetch.mock.calls.at(-1)!));
			expect(electWriteLeader).toHaveBeenCalledTimes(1);
			first.activate(identity);
			expect(electWriteLeader).toHaveBeenCalledTimes(2);
			expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenLastCalledWith(
				`wcpos-write-outcomes:${scopeDatabaseName(identity)}`
			);
			await ports.fetcher?.(
				'https://store.example.test/wp-json/wcpos/v2/changes/config-fingerprint'
			);
			seen.push(storeHeaderOf(fetch.mock.calls.at(-1)!));
		});
		const {
			createAppSyncEngine,
			switchAppEngineScope,
			createRxdbSyncEngine,
			electWriteLeader,
			writeOutcomeBridges,
		} = loadCreateAppEngine(() => first, true);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			ports = createRxdbSyncEngine.mock.calls[0]![0];

			await switchAppEngineScope({
				site: { wp_api_url: BASE_OPTIONS.scope.site },
				wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
				store: { id: 'store-2' },
			});
			expect(seen).toEqual(['store-1', 'store-2']);
		} finally {
			fetch.mockRestore();
		}
	});

	it('a stale outgoing render neither switches back nor replaces activated auth', async () => {
		// The engine has activated store-2 inside scope.switch but the switch
		// has not resolved, so render intent still names store-1. A memo recompute
		// rendering store-1 is a cache hit; it must not put store-1 back on the wire.
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		const storeHeaderOf = (call: unknown[]) =>
			new Headers((call[1] as RequestInit | undefined)?.headers).get('X-WCPOS-Store');
		let ports: { fetcher?: (url: string) => Promise<Response> } = {};
		let render!: () => void;
		let seen: string | null = null;
		let first!: ReturnType<typeof createEngineDouble>;
		first = createEngineDouble(undefined, async (identity) => {
			expect(first.scope.switch).toHaveBeenCalledTimes(1);
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: identity,
				credentials: { getLatest: () => ({ access_token: 'incoming-token' }) },
			});
			first.activate(identity);
			render();
			await ports.fetcher?.(
				'https://store.example.test/wp-json/wcpos/v2/changes/config-fingerprint'
			);
			seen = storeHeaderOf(fetch.mock.calls.at(-1)!);
		});
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first
		);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			ports = createRxdbSyncEngine.mock.calls[0]![0];
			render = () => createAppSyncEngine(BASE_OPTIONS);

			await switchAppEngineScope({
				site: { wp_api_url: BASE_OPTIONS.scope.site },
				wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
				store: { id: 'store-2' },
			});
			expect(seen).toBe('store-2');
			expect(first.scope.switch).toHaveBeenCalledTimes(1);
			expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(
				'Bearer incoming-token'
			);
		} finally {
			fetch.mockRestore();
		}
	});

	it('keeps outgoing auth until activation and adopts the matching pending cashier', async () => {
		const first = createEngineDouble(undefined, () => new Promise(() => undefined));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		try {
			createAppSyncEngine(BASE_OPTIONS);
			const fetcher = createRxdbSyncEngine.mock.calls[0]![0].fetcher!;
			const incoming = {
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-2' },
				credentials: { getLatest: () => ({ access_token: 'cashier-2' }) },
			};
			createAppSyncEngine(incoming);
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-3' },
				credentials: { getLatest: () => ({ access_token: 'cashier-3' }) },
			});
			await fetcher('https://store.example.test/wp-json/wcpos/v2/orders');
			expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(
				'Bearer test-token'
			);
			createAppSyncEngine({
				...incoming,
				credentials: { getLatest: () => ({ access_token: 'refreshed-cashier-2' }) },
			});
			expect(first.scope.switch).toHaveBeenCalledTimes(3);
			first.activate(incoming.scope);
			await fetcher('https://store.example.test/wp-json/wcpos/v2/orders');
			expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(
				'Bearer refreshed-cashier-2'
			);
		} finally {
			fetch.mockRestore();
		}
	});

	it('collection-reset emissions do not re-elect leadership or reset clock-skew evaluation', async () => {
		const first = createEngineDouble();
		const {
			createAppSyncEngine,
			createRxdbSyncEngine,
			networkWarn,
			electWriteLeader,
			writeOutcomeBridges,
		} = loadCreateAppEngine(() => first, true);
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(
				async () =>
					new Response(null, { status: 200, headers: { Date: 'Thu, 01 Jan 1970 00:03:00 GMT' } })
			);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			const fetcher = createRxdbSyncEngine.mock.calls[0]![0].fetcher!;
			await fetcher('https://store.example.test/wp-json/wcpos/v2/orders');
			first.activate({ ...BASE_OPTIONS.scope, site: 'HTTP://STORE.EXAMPLE.TEST/' });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/orders');
			expect(networkWarn).toHaveBeenCalledTimes(1);
			expect(electWriteLeader).toHaveBeenCalledTimes(1);
			expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenCalledTimes(1);
		} finally {
			now.mockRestore();
			fetch.mockRestore();
		}
	});

	it('an earlier rejected switch never clobbers the header a later activation set', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		const storeHeaderOf = (call: unknown[]) =>
			new Headers((call[1] as RequestInit | undefined)?.headers).get('X-WCPOS-Store');
		let first!: ReturnType<typeof createEngineDouble>;
		first = createEngineDouble(undefined, async (identity) => {
			if (identity.storeId === 'store-2') {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('store-2 refused');
			}
			first.activate(identity);
		});
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first
		);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			const ports = createRxdbSyncEngine.mock.calls[0]![0];
			const session = (storeId: string) => ({
				site: { wp_api_url: BASE_OPTIONS.scope.site },
				wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
				store: { id: storeId },
			});
			const refused = switchAppEngineScope(session('store-2'));
			const landed = switchAppEngineScope(session('store-3'));
			await expect(refused).rejects.toThrow('store-2 refused');
			await landed;

			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			expect(storeHeaderOf(fetch.mock.calls.at(-1)!)).toBe('store-3');
		} finally {
			fetch.mockRestore();
		}
	});

	it('a rejected switch leaves the committed store header in place', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		const storeHeaderOf = (call: unknown[]) =>
			new Headers((call[1] as RequestInit | undefined)?.headers).get('X-WCPOS-Store');
		const error = new Error('scope refused');
		const first = createEngineDouble(undefined, () => Promise.reject(error));
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first
		);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			const ports = createRxdbSyncEngine.mock.calls[0]![0];

			await expect(
				switchAppEngineScope({
					site: { wp_api_url: BASE_OPTIONS.scope.site },
					wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
					store: { id: 'store-2' },
				})
			).rejects.toBe(error);

			await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');
			expect(storeHeaderOf(fetch.mock.calls.at(-1)!)).toBe(String(BASE_OPTIONS.scope.storeId));
		} finally {
			fetch.mockRestore();
		}
	});

	it('awaited scope switch rejection leaves the cache identity untouched', async () => {
		const error = new Error('scope refused');
		const first = createEngineDouble(undefined, () => Promise.reject(error));
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first
		);
		createAppSyncEngine(BASE_OPTIONS);

		await expect(
			switchAppEngineScope({
				site: { wp_api_url: BASE_OPTIONS.scope.site },
				wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
				store: { id: 'store-2' },
			})
		).rejects.toBe(error);

		// The old scope is still the cached identity: rendering it is a cache hit.
		expect(createAppSyncEngine(BASE_OPTIONS)).toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
	});

	it.each(['rejects', 'resolves'] as const)(
		"a second awaited switch to a pending target shares the first's outcome: %s",
		async (outcome) => {
			let resolveSwitch!: () => void;
			let rejectSwitch!: (error: Error) => void;
			const pending = new Promise<void>((resolve, reject) => {
				resolveSwitch = resolve;
				rejectSwitch = reject;
			});
			const first = createEngineDouble(undefined, () => pending);
			const { createAppSyncEngine, switchAppEngineScope } = loadCreateAppEngine(() => first);
			createAppSyncEngine(BASE_OPTIONS);
			const target = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
			const session = {
				site: { wp_api_url: target.site },
				wpCredentials: { id: target.cashierId },
				store: { id: target.storeId },
			};
			const resolved = jest.fn(() => first.active()?.identity);
			const rejected = jest.fn();
			const switches = [switchAppEngineScope(session), switchAppEngineScope(session)];
			const observed = switches.map((switched) => switched.then(resolved, rejected));
			for (let turn = 0; turn < 5; turn += 1) {
				await Promise.resolve();
			}

			expect(first.scope.switch).toHaveBeenCalledTimes(1);
			expect(first.scope.switch).toHaveBeenCalledWith(target);
			expect(first.active()?.identity).toEqual(BASE_OPTIONS.scope);
			expect(resolved).not.toHaveBeenCalled();
			expect(rejected).not.toHaveBeenCalled();

			if (outcome === 'rejects') {
				const error = new Error('scope refused');
				rejectSwitch(error);
				await Promise.all(observed);
				expect(rejected.mock.calls).toEqual([[error], [error]]);
				expect(resolved).not.toHaveBeenCalled();
				expect(first.active()?.identity).toEqual(BASE_OPTIONS.scope);
			} else {
				first.activate(target);
				resolveSwitch();
				await Promise.all(observed);
				expect(resolved).toHaveBeenCalledTimes(2);
				expect(resolved.mock.results.map(({ value }) => value)).toEqual([target, target]);
				expect(rejected).not.toHaveBeenCalled();
			}
		}
	);

	it('awaited switches dedupe only the latest outstanding target', () => {
		const first = createEngineDouble(undefined, () => new Promise(() => undefined));
		const { createAppSyncEngine, switchAppEngineScope } = loadCreateAppEngine(() => first);
		createAppSyncEngine(BASE_OPTIONS);
		const session = (storeId: string) => ({
			site: { wp_api_url: BASE_OPTIONS.scope.site },
			wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
			store: { id: storeId },
		});
		void switchAppEngineScope(session('store-2'));
		void switchAppEngineScope(session('store-2'));
		expect(first.scope.switch).toHaveBeenCalledTimes(1);
		void switchAppEngineScope(session('store-3'));
		void switchAppEngineScope(session('store-2'));
		void switchAppEngineScope(session('store-2'));
		expect(first.scope.switch).toHaveBeenCalledTimes(3);
		expect(first.scope.switch).toHaveBeenLastCalledWith({
			...BASE_OPTIONS.scope,
			storeId: 'store-2',
		});
	});

	it('allocation-scope renders and awaited switches are inert during initial open', async () => {
		const first = createEngineDouble(undefined, () => new Promise(() => undefined));
		const { createAppSyncEngine, switchAppEngineScope } = loadCreateAppEngine(
			() => first,
			false,
			false
		);
		createAppSyncEngine(BASE_OPTIONS);
		await switchAppEngineScope({
			site: { wp_api_url: BASE_OPTIONS.scope.site },
			wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
			store: { id: BASE_OPTIONS.scope.storeId },
		});
		expect(first.scope.switch).not.toHaveBeenCalled();
		void switchAppEngineScope({
			site: { wp_api_url: BASE_OPTIONS.scope.site },
			wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
			store: { id: 'store-2' },
		});
		createAppSyncEngine(BASE_OPTIONS);
		expect(first.scope.switch).toHaveBeenCalledTimes(1);
	});

	it('awaited scope switch is a no-op for cross-site or incomplete sessions', async () => {
		const { createAppSyncEngine, switchAppEngineScope } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		await switchAppEngineScope({
			site: { wp_api_url: OTHER_SITE_OPTIONS.scope.site },
			wpCredentials: { id: 'cashier-1' },
			store: { id: 'store-2' },
		});
		await switchAppEngineScope({
			site: { wp_api_url: BASE_OPTIONS.scope.site },
		});

		expect(first.scope.switch).not.toHaveBeenCalled();
	});

	it('terminally fails every retained scope database on disposal timeout', async () => {
		jest.useFakeTimers();
		try {
			const first = createEngineDouble(() => new Promise(() => undefined));
			const engines = [first, createEngineDouble()];
			const { createAppSyncEngine, markStorageTerminallyFailed, forceFreeDatabaseRegistration } =
				loadCreateAppEngine(() => engines.shift() ?? first);
			createAppSyncEngine(BASE_OPTIONS);
			const secondScope = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
			createAppSyncEngine({ ...BASE_OPTIONS, scope: secondScope });
			await first.scope.switch.mock.results[0]?.value;

			createAppSyncEngine(OTHER_SITE_OPTIONS);
			jest.advanceTimersByTime(10_000);

			const marked = markStorageTerminallyFailed.mock.calls.map((call) => call[0]);
			expect(marked).toEqual(
				expect.arrayContaining([
					scopeDatabaseName(BASE_OPTIONS.scope),
					scopeDatabaseName(secondScope),
				])
			);
			const freed = forceFreeDatabaseRegistration.mock.calls.map((call) => call[0]);
			expect(freed).toEqual(
				expect.arrayContaining([
					scopeDatabaseName(BASE_OPTIONS.scope),
					scopeDatabaseName(secondScope),
				])
			);
			const firstMarkedName = marked[0];
			const firstFreedIndex = forceFreeDatabaseRegistration.mock.calls.findIndex(
				([databaseName]) => databaseName === firstMarkedName
			);
			expect(markStorageTerminallyFailed.mock.invocationCallOrder[0]).toBeLessThan(
				forceFreeDatabaseRegistration.mock.invocationCallOrder[firstFreedIndex]
			);
		} finally {
			jest.useRealTimers();
		}
	});

	it('marks the target database of a still-inflight awaited switch on disposal timeout', async () => {
		jest.useFakeTimers();
		try {
			// The awaited switch never settles — the wedge under repair is the
			// switch itself, so its target database name must already be retained
			// when a racing cross-site disposal hits the deadline.
			const first = createEngineDouble(
				() => new Promise(() => undefined),
				() => new Promise(() => undefined)
			);
			const engines = [first, createEngineDouble()];
			const {
				createAppSyncEngine,
				switchAppEngineScope,
				markStorageTerminallyFailed,
				forceFreeDatabaseRegistration,
			} = loadCreateAppEngine(() => engines.shift() ?? first);
			createAppSyncEngine(BASE_OPTIONS);
			const targetScope = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
			void switchAppEngineScope({
				site: { wp_api_url: BASE_OPTIONS.scope.site },
				wpCredentials: { id: BASE_OPTIONS.scope.cashierId },
				store: { id: 'store-2' },
			});
			await Promise.resolve();
			expect(first.scope.switch).toHaveBeenCalledTimes(1);

			createAppSyncEngine(OTHER_SITE_OPTIONS);
			jest.advanceTimersByTime(10_000);

			const marked = markStorageTerminallyFailed.mock.calls.map((call) => call[0]);
			const freed = forceFreeDatabaseRegistration.mock.calls.map((call) => call[0]);
			for (const names of [marked, freed]) {
				expect(names).toEqual(
					expect.arrayContaining([
						scopeDatabaseName(BASE_OPTIONS.scope),
						scopeDatabaseName(targetScope),
					])
				);
			}
		} finally {
			jest.useRealTimers();
		}
	});

	it('never adopts staged auth options when a render-path switch rejects', async () => {
		const first = createEngineDouble(undefined, () => Promise.reject(new Error('scope refused')));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
		createAppSyncEngine(BASE_OPTIONS);

		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: { getLatest: () => ({ access_token: 'new-cashier-token' }) },
			scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-2' },
		});
		await Promise.resolve();

		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 200 }));
		try {
			const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
			await fetcher!('https://store.example.test/wp-json/wcpos/v2/products');
			const headers = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
			expect(headers.get('Authorization')).toBe('Bearer test-token');
		} finally {
			fetch.mockRestore();
		}
	});

	// pro#425 — the store header must track the engine's scope through every
	// transition, because a stale one diverts a price edit into the wrong store's
	// meta (or, on a store-scoped product, into the global WooCommerce price).
	describe('store scope header lifecycle', () => {
		async function sentStoreHeader(
			createRxdbSyncEngine: ReturnType<typeof loadCreateAppEngine>['createRxdbSyncEngine'],
			expectedAuth = 'test-token'
		) {
			const fetch = jest
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(new Response(null, { status: 200 }));
			try {
				const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
				await fetcher!('https://store.example.test/wp-json/wcpos/v2/push/products');
				const headers = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
				expect(headers.get('Authorization')).toBe(`Bearer ${expectedAuth}`);
				return headers.get('X-WCPOS-Store');
			} finally {
				fetch.mockRestore();
			}
		}

		it('construction publishes the allocation scope’s header and elects leadership once', async () => {
			const first = createEngineDouble();
			const { createAppSyncEngine, createRxdbSyncEngine, electWriteLeader, writeOutcomeBridges } =
				loadCreateAppEngine(() => first, true, false);
			createAppSyncEngine(BASE_OPTIONS);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
			expect(createRxdbSyncEngine.mock.calls[0]![0].writePlaneOwner?.()).toBe(true);
			expect(electWriteLeader).toHaveBeenCalledTimes(1);
			expect(electWriteLeader).toHaveBeenCalledWith(
				`wcpos-write-leader:${scopeDatabaseName(BASE_OPTIONS.scope)}`,
				expect.any(Object)
			);
			expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenCalledWith(
				`wcpos-write-outcomes:${scopeDatabaseName(BASE_OPTIONS.scope)}`
			);
			first.activate(BASE_OPTIONS.scope);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
			expect(electWriteLeader).toHaveBeenCalledTimes(1);
			expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenCalledTimes(1);
		});

		it('null activation clears a previously published header', async () => {
			const first = createEngineDouble();
			const engines = [first, createEngineDouble()];
			const { createAppSyncEngine, createRxdbSyncEngine, electWriteLeader } = loadCreateAppEngine(
				() => engines.shift()!,
				true
			);
			createAppSyncEngine(BASE_OPTIONS);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
			first.activate(null);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBeNull();
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			first.activate(BASE_OPTIONS.scope);
			expect(electWriteLeader).toHaveBeenCalledTimes(2);
		});

		it('sends the constructed scope store', async () => {
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
			createAppSyncEngine(BASE_OPTIONS);

			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
		});

		it('adopts the new store on a same-site render-path switch', async () => {
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
			createAppSyncEngine(BASE_OPTIONS);

			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
			});
			await Promise.resolve();

			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-2');
		});

		it('render B, C, B in one tick ends with B active', async () => {
			let switches = Promise.resolve();
			const first = createEngineDouble(undefined, (identity) => {
				switches = switches.then(() => first.activate(identity));
				return switches;
			});
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
			createAppSyncEngine(BASE_OPTIONS);
			const b = { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } };
			const c = { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-3' } };

			createAppSyncEngine(b);
			createAppSyncEngine(c);
			createAppSyncEngine(b);
			// A same-target refresh updates the LAST B request, not the first one.
			createAppSyncEngine({
				...b,
				credentials: { getLatest: () => ({ access_token: 'latest-b-token' }) },
			});
			await switches;

			expect(first.active()?.identity).toEqual(b.scope);
			expect(await sentStoreHeader(createRxdbSyncEngine, 'latest-b-token')).toBe('store-2');
			expect(first.scope.switch).toHaveBeenCalledTimes(3);
		});

		// Like staged auth, a target that never activated
		// must never replace the outgoing store on the wire.
		it('never adopts the target store when a render-path switch rejects', async () => {
			const first = createEngineDouble(undefined, () => Promise.reject(new Error('refused')));
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
			createAppSyncEngine(BASE_OPTIONS);

			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
			});
			await Promise.resolve();

			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
		});

		// Codex review, PR #1122. A→B→C where B and C both reject: B's rejection
		// is ignored (the cache already names C), then C's rejection used to
		// restore the snapshot taken at C's start — which was B, a scope the
		// engine never reached. The engine sits on A while the header claims B,
		// so a price edit is written against the wrong store.
		it('two rejected requests never publish their staged auth or scope', async () => {
			const first = createEngineDouble(undefined, () => Promise.reject(new Error('refused')));
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
			createAppSyncEngine(BASE_OPTIONS); // store-1 — the only scope ever activated

			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
				credentials: { getLatest: () => ({ access_token: 'cashier-2' }) },
			});
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-3' },
				credentials: { getLatest: () => ({ access_token: 'cashier-3' }) },
			});
			await Promise.resolve();
			await Promise.resolve();

			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
		});

		// The same sequence, but the first switch SUCCEEDS — and settles only
		// AFTER a second switch has superseded it as the active target. The
		// engine really is on store-2 by then, so store-2, not store-1, is what
		// the failed switch to store-3 must fall back to.
		//
		// The interleaving is the whole point: committing a success only while
		// it is still the active target loses store-2 here, and the fallback
		// silently rewinds two scopes past where the engine actually sits.
		it('an activated superseded request remains authoritative when its successor fails', async () => {
			// Both deferred, settled in issue order — the engine serializes its
			// switches, so a later one cannot settle before an earlier one.
			let releaseFirstSwitch!: () => void;
			let rejectSecondSwitch!: (error: Error) => void;
			let call = 0;
			const first = createEngineDouble(undefined, (identity) => {
				call += 1;
				if (call === 1) {
					return new Promise<void>((resolve) => {
						// Landing = the engine activated store-2 (db$ fired), then settled.
						releaseFirstSwitch = () => {
							first.activate(identity);
							resolve();
						};
					});
				}
				return new Promise<void>((_resolve, reject) => {
					rejectSecondSwitch = reject;
				});
			});
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => first);
			createAppSyncEngine(BASE_OPTIONS);

			// store-2 starts switching but does not settle yet.
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
				credentials: { getLatest: () => ({ access_token: 'cashier-2' }) },
			});
			// store-3 supersedes it as the active target, and will reject.
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-3' },
				credentials: { getLatest: () => ({ access_token: 'cashier-3' }) },
			});
			// store-2 lands first: the engine IS on store-2.
			releaseFirstSwitch();
			await Promise.resolve();
			await Promise.resolve();
			expect(await sentStoreHeader(createRxdbSyncEngine, 'cashier-2')).toBe('store-2');
			// Then store-3 fails, and must rewind to store-2 — not past it.
			rejectSecondSwitch(new Error('refused'));
			await Promise.resolve();
			await Promise.resolve();

			expect(await sentStoreHeader(createRxdbSyncEngine, 'cashier-2')).toBe('store-2');
		});
	});

	it('logs a rejected same-site switch and retries the failed target scope', async () => {
		const switchError = new Error('scope switch failed');
		const first = createEngineDouble(undefined, () => Promise.reject(switchError));
		const engines = [first, createEngineDouble()];
		const { createAppSyncEngine, networkError } = loadCreateAppEngine(() => {
			const engine = engines.shift();
			if (!engine) return first;
			return engine;
		});
		createAppSyncEngine(BASE_OPTIONS);
		const target = { ...BASE_OPTIONS.scope, storeId: 'store-2' };

		createAppSyncEngine({ ...BASE_OPTIONS, scope: target });
		await Promise.resolve();
		await Promise.resolve();
		createAppSyncEngine({ ...BASE_OPTIONS, scope: target });

		expect(first.scope.switch).toHaveBeenCalledTimes(2);
		expect(networkError).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: 'SYNC999',
				context: expect.objectContaining({
					scopeKey: expect.any(String),
				}),
			})
		);
	});

	it('switches within the new site while the prior site disposal is pending', async () => {
		jest.useFakeTimers();
		try {
			const first = createEngineDouble(() => new Promise(() => undefined));
			const second = createEngineDouble();
			const engines = [first, second];
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => {
				const engine = engines.shift();
				if (!engine) throw new Error('missing engine double');
				return engine;
			});
			createAppSyncEngine(BASE_OPTIONS);
			const otherSiteEngine = createAppSyncEngine(OTHER_SITE_OPTIONS);
			const targetScope = { ...OTHER_SITE_OPTIONS.scope, storeId: 'store-2' };

			const switched = createAppSyncEngine({
				...OTHER_SITE_OPTIONS,
				scope: targetScope,
			});
			await second.scope.switch.mock.results[0]?.value;
			const cached = createAppSyncEngine({
				...OTHER_SITE_OPTIONS,
				scope: targetScope,
			});

			expect(switched).toBe(otherSiteEngine);
			expect(cached).toBe(otherSiteEngine);
			expect(second.scope.switch).toHaveBeenCalledTimes(1);
			expect(second.dispose).not.toHaveBeenCalled();
			expect(createRxdbSyncEngine).toHaveBeenCalledTimes(2);
			jest.advanceTimersByTime(10_000);
			await Promise.resolve();
		} finally {
			jest.useRealTimers();
		}
	});

	it('treats multi-instance and trailing-slash changes on the same scope as a cache hit', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			wpApiUrl: 'https://store.example.test/wp-json',
			scope: { ...BASE_OPTIONS.scope, site: 'HTTP://STORE.EXAMPLE.TEST/' },
			multiInstance: true,
		});

		expect(second).toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
		expect(first.dispose).not.toHaveBeenCalled();
	});

	it('a same-scope render before initial activation adopts the new credentials', async () => {
		const first = createEngineDouble();
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first,
			false,
			false
		);
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
		try {
			createAppSyncEngine(BASE_OPTIONS);
			expect(first.active()).toBeNull();
			expect(
				createAppSyncEngine({
					...BASE_OPTIONS,
					credentials: { getLatest: () => ({ access_token: 'new-token' }) },
				})
			).toBe(first);
			first.activate(BASE_OPTIONS.scope);
			await createRxdbSyncEngine.mock.calls[0]![0].fetcher!(
				'https://store.example.test/wp-json/wcpos/v2/orders'
			);
			expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(
				'Bearer new-token'
			);
			expect(first.scope.switch).not.toHaveBeenCalled();
		} finally {
			fetch.mockRestore();
		}
	});

	it('uses the latest credentials and JWT mode after a same-scope cache hit', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const initialRefreshAuth = jest.fn().mockResolvedValue('initial-token');
		createAppSyncEngine({ ...BASE_OPTIONS, refreshAuth: initialRefreshAuth });
		const latestCredentials = {
			getLatest: jest.fn(() => ({ access_token: 'latest-token' })),
		};
		const latestRefreshAuth = jest.fn().mockResolvedValue(null);

		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: latestCredentials,
			refreshAuth: latestRefreshAuth,
			useJwtAsParam: true,
		});
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(latestCredentials.getLatest).toHaveBeenCalledTimes(2);
		expect(initialRefreshAuth).not.toHaveBeenCalled();
		expect(latestRefreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith(
			'https://store.example.test/wp-json/wcpos/v2/products?authorization=Bearer+latest-token&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&store_id=store-1&_wcpos_envelope=1',
			expect.objectContaining({ headers: expect.objectContaining({}) })
		);
		const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		const headers = init.headers as Headers;
		expect(headers.get('Authorization')).toBeNull();
		expect(headers.get('X-WCPOS')).toBe('1');
		fetch.mockRestore();
	});

	it('uses the latest transport mode after a same-scope cache hit', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 200 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);

		createAppSyncEngine({ ...BASE_OPTIONS, useRestRouteParam: true });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(fetch.mock.calls[0]?.[0]).toBe(
			'https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fproducts&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&store_id=store-1&_wcpos_envelope=1'
		);
		fetch.mockRestore();
	});

	it('does not persist a sync completion after the active store changes', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 500 }));
		const { createAppSyncEngine, createRxdbSyncEngine, getDatabaseEpoch, networkError } =
			loadCreateAppEngine();
		getDatabaseEpoch.mockReturnValueOnce(0).mockReturnValue(1);
		createAppSyncEngine(BASE_OPTIONS);
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(networkError).not.toHaveBeenCalled();
		fetch.mockRestore();
	});

	it('waits for an earlier disposal before reopening the same physical database', async () => {
		let resolveFirstDisposal: () => void = () => undefined;
		const firstDisposal = new Promise<void>((resolve) => {
			resolveFirstDisposal = resolve;
		});
		const engines = [
			createEngineDouble(() => firstDisposal),
			createEngineDouble(),
			createEngineDouble(),
		];
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => {
			const engine = engines.shift();
			if (!engine) throw new Error('missing engine double');
			return engine;
		});
		const first = createAppSyncEngine(BASE_OPTIONS);

		createAppSyncEngine(OTHER_SITE_OPTIONS);
		createAppSyncEngine(BASE_OPTIONS);
		const databaseOpenBarrier = createRxdbSyncEngine.mock.calls[2]?.[0].databaseOpenBarrier;
		let barrierSettled = false;
		const open = databaseOpenBarrier?.then(() => {
			barrierSettled = true;
		});

		expect(first.dispose).toHaveBeenCalledTimes(1);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(3);
		await Promise.resolve();
		expect(barrierSettled).toBe(false);

		resolveFirstDisposal();
		await open;

		expect(barrierSettled).toBe(true);
	});

	it("a pending target's database gets the disposal barrier", async () => {
		let resolveDisposal!: () => void;
		const disposal = new Promise<void>((resolve) => {
			resolveDisposal = resolve;
		});
		const first = createEngineDouble(
			() => disposal,
			() => new Promise(() => undefined)
		);
		const engines = [first, createEngineDouble(), createEngineDouble()];
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() =>
			engines.shift()!
		);
		try {
			createAppSyncEngine(BASE_OPTIONS);
			const target = { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } };
			createAppSyncEngine(target);
			// B must be covered even when the latest render intent now names C.
			createAppSyncEngine({
				...BASE_OPTIONS,
				scope: { ...BASE_OPTIONS.scope, storeId: 'store-3' },
			});
			expect(first.active()?.identity).toEqual(BASE_OPTIONS.scope);
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			createAppSyncEngine(target);

			const barrier = createRxdbSyncEngine.mock.calls[2]![0].databaseOpenBarrier;
			expect(first.dispose).toHaveBeenCalledTimes(1);
			expect(barrier).toBeDefined();
			let settled = false;
			void barrier!.then(() => {
				settled = true;
			});
			await Promise.resolve();
			expect(settled).toBe(false);
			resolveDisposal();
			await barrier;
			expect(settled).toBe(true);
		} finally {
			resolveDisposal();
			await disposal;
		}
	});

	it('a disposal waits for every matching pending barrier', async () => {
		let resolveFirstDisposal!: () => void;
		let resolveSecondDisposal!: () => void;
		const firstDisposal = new Promise<void>((resolve) => {
			resolveFirstDisposal = resolve;
		});
		const secondDisposal = new Promise<void>((resolve) => {
			resolveSecondDisposal = resolve;
		});
		const target = { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } };
		const first = createEngineDouble(() => firstDisposal);
		const second = createEngineDouble(() => secondDisposal);
		const combined = createEngineDouble(
			() => Promise.resolve(),
			() => new Promise(() => undefined)
		);
		const engines = [
			first,
			createEngineDouble(),
			second,
			createEngineDouble(),
			combined,
			createEngineDouble(),
			createEngineDouble(),
		];
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() =>
			engines.shift()!
		);
		let databaseOpenBarrier: Promise<void> | undefined;
		try {
			// Leave separate closes pending for A and B, then queue B on a new engine active at A.
			createAppSyncEngine(BASE_OPTIONS);
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			createAppSyncEngine(target);
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			expect(first.dispose).toHaveBeenCalledTimes(1);
			expect(second.dispose).toHaveBeenCalledTimes(1);
			createAppSyncEngine(BASE_OPTIONS);
			createAppSyncEngine(target);
			expect(combined.active()?.identity).toEqual(BASE_OPTIONS.scope);
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			createAppSyncEngine(target);

			databaseOpenBarrier = createRxdbSyncEngine.mock.calls[6]![0].databaseOpenBarrier;
			expect(databaseOpenBarrier).toBeDefined();
			const openDatabase = jest.fn();
			const open = databaseOpenBarrier!.then(openDatabase);
			expect(combined.dispose).not.toHaveBeenCalled();

			resolveFirstDisposal();
			for (let turn = 0; turn < 10; turn += 1) {
				await Promise.resolve();
			}
			expect(combined.dispose).not.toHaveBeenCalled();
			expect(openDatabase).not.toHaveBeenCalled();

			resolveSecondDisposal();
			await open;
			expect(combined.dispose).toHaveBeenCalledTimes(1);
			expect(openDatabase).toHaveBeenCalledTimes(1);
			expect(combined.dispose.mock.invocationCallOrder[0]).toBeLessThan(
				openDatabase.mock.invocationCallOrder[0]
			);
		} finally {
			resolveFirstDisposal();
			resolveSecondDisposal();
			await Promise.all([firstDisposal, secondDisposal, databaseOpenBarrier]);
		}
	});

	it('force-releases a hung disposal barrier at the deadline', async () => {
		jest.useFakeTimers();
		try {
			const engines = [
				createEngineDouble(() => new Promise(() => undefined)),
				createEngineDouble(),
				createEngineDouble(),
			];
			const {
				createAppSyncEngine,
				createRxdbSyncEngine,
				markStorageTerminallyFailed,
				forceFreeDatabaseRegistration,
				networkError,
			} = loadCreateAppEngine(() => {
				const engine = engines.shift();
				if (!engine) throw new Error('missing engine double');
				return engine;
			});
			createAppSyncEngine(BASE_OPTIONS);

			createAppSyncEngine(OTHER_SITE_OPTIONS);
			createAppSyncEngine(BASE_OPTIONS);
			const databaseOpenBarrier = createRxdbSyncEngine.mock.calls[2]?.[0].databaseOpenBarrier;
			let barrierSettled = false;
			let barrierSettledWhenFreed: boolean | null = null;
			forceFreeDatabaseRegistration.mockImplementation(() => {
				barrierSettledWhenFreed = barrierSettled;
				return true;
			});
			const open = databaseOpenBarrier?.then(() => {
				barrierSettled = true;
			});
			for (let turn = 0; turn < 5; turn += 1) {
				await Promise.resolve();
			}

			jest.advanceTimersByTime(10_000);
			for (let turn = 0; turn < 5; turn += 1) {
				await Promise.resolve();
			}

			expect(barrierSettled).toBe(true);
			await open;
			expect(markStorageTerminallyFailed).toHaveBeenCalledTimes(1);
			expect(markStorageTerminallyFailed).toHaveBeenCalledWith(
				scopeDatabaseName(BASE_OPTIONS.scope),
				expect.any(String)
			);
			expect(forceFreeDatabaseRegistration).toHaveBeenCalledWith(
				scopeDatabaseName(BASE_OPTIONS.scope)
			);
			expect(markStorageTerminallyFailed.mock.invocationCallOrder[0]).toBeLessThan(
				forceFreeDatabaseRegistration.mock.invocationCallOrder[0]
			);
			// The successor may only be released AFTER the registration is freed —
			// a barrier that settles first would race the successor's open into DB8.
			expect(barrierSettledWhenFreed).toBe(false);
			expect(networkError).toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});

	it('does not trip the disposal deadline after a fast disposal', async () => {
		jest.useFakeTimers();
		try {
			let resolveDisposal: () => void = () => undefined;
			const disposal = new Promise<void>((resolve) => {
				resolveDisposal = resolve;
			});
			const engines = [createEngineDouble(() => disposal), createEngineDouble()];
			const {
				createAppSyncEngine,
				markStorageTerminallyFailed,
				forceFreeDatabaseRegistration,
				networkError,
			} = loadCreateAppEngine(() => {
				const engine = engines.shift();
				if (!engine) throw new Error('missing engine double');
				return engine;
			});
			createAppSyncEngine(BASE_OPTIONS);
			createAppSyncEngine(OTHER_SITE_OPTIONS);

			expect(jest.getTimerCount()).toBe(1);
			resolveDisposal();
			for (let turn = 0; turn < 5; turn += 1) {
				await Promise.resolve();
			}
			jest.runAllTimers();

			expect(markStorageTerminallyFailed).not.toHaveBeenCalled();
			expect(forceFreeDatabaseRegistration).not.toHaveBeenCalled();
			expect(networkError).not.toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});

	it('enables multi-instance and threads elected ownership on web', () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks: {} },
		});
		const { createAppSyncEngine, createRxdbSyncEngine, electWriteLeader } = loadCreateAppEngine(
			undefined,
			true
		);

		createAppSyncEngine(BASE_OPTIONS);

		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		expect(ports.multiInstance).toBe(true);
		expect(ports.writePlaneOwner?.()).toBe(true);
		expect(electWriteLeader).toHaveBeenCalledWith(
			`wcpos-write-leader:${scopeDatabaseName(BASE_OPTIONS.scope)}`,
			expect.objectContaining({ onUnavailable: expect.any(Function) })
		);
	});

	it('moves the web leadership lock when the cached engine switches scope', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks: {} },
		});
		const { createAppSyncEngine, electWriteLeader, writeLeaders } = loadCreateAppEngine(
			undefined,
			true
		);
		createAppSyncEngine(BASE_OPTIONS);
		const targetScope = { ...BASE_OPTIONS.scope, storeId: 'store-2' };

		createAppSyncEngine({ ...BASE_OPTIONS, scope: targetScope });
		await Promise.resolve();

		expect(writeLeaders[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(electWriteLeader).toHaveBeenLastCalledWith(
			`wcpos-write-leader:${scopeDatabaseName(targetScope)}`,
			expect.objectContaining({ onUnavailable: expect.any(Function) })
		);
	});

	it('opens the write-outcome channel for the scope and moves it on a switch (#1209)', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks: {} },
		});
		const { createAppSyncEngine, createRxdbSyncEngine, writeOutcomeBridges } = loadCreateAppEngine(
			undefined,
			true
		);
		createAppSyncEngine(BASE_OPTIONS);

		// One bridge, injected as the engine port and pointed at this store's channel.
		expect(writeOutcomeBridges).toHaveLength(1);
		expect(createRxdbSyncEngine.mock.calls[0]![0].writeOutcomeBridge).toBe(writeOutcomeBridges[0]);
		expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenLastCalledWith(
			`wcpos-write-outcomes:${scopeDatabaseName(BASE_OPTIONS.scope)}`
		);

		const targetScope = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
		createAppSyncEngine({ ...BASE_OPTIONS, scope: targetScope });
		await Promise.resolve();

		// It follows the lock, or a tab keeps hearing the previous store's outcomes.
		expect(writeOutcomeBridges[0]?.moveTo).toHaveBeenLastCalledWith(
			`wcpos-write-outcomes:${scopeDatabaseName(targetScope)}`
		);
	});

	it('opens no write-outcome channel off the web (#1209)', () => {
		const { createAppSyncEngine, createRxdbSyncEngine, createWriteOutcomeBridge } =
			loadCreateAppEngine(undefined, false);

		createAppSyncEngine(BASE_OPTIONS);

		// Native and Electron are single-window: in-process events already reach
		// every consumer, so there is no peer to tell.
		expect(createWriteOutcomeBridge).not.toHaveBeenCalled();
		expect(createRxdbSyncEngine.mock.calls[0]![0].writeOutcomeBridge).toBeUndefined();
	});

	it('keeps single-instance behavior and emits diagnostics when Web Locks are unavailable', () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: {},
		});
		const { createAppSyncEngine, createRxdbSyncEngine, electWriteLeader, appMetricsObserver } =
			loadCreateAppEngine(undefined, true);

		createAppSyncEngine({ ...BASE_OPTIONS, multiInstance: true });

		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		expect(ports.multiInstance).toBe(false);
		expect(ports.writePlaneOwner?.()).toBe(true);
		// The degraded diagnostic is now the election module's responsibility (it
		// fires onUnavailable — see web-write-leader.test.ts). Verify the host wires
		// it: the callback it handed to electWriteLeader emits the warning.
		const electArgs = electWriteLeader.mock.calls[0] as unknown as [
			string,
			{ onUnavailable: () => void },
		];
		electArgs[1].onUnavailable();
		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'engine.write-leader.degraded',
				level: 'warn',
			})
		);
	});
});
