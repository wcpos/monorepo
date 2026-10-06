import { scopeDatabaseName } from '@wcpos/sync-core';
import type { LegacyScopeDrainOutcome, LegacyScopeDrainPorts } from '@wcpos/sync-engine';
import {
	awaitLegacyUnsentReport,
	classifyUnsentChanges,
	forgetUnsentChanges,
	legacyUnsentOrderUuids,
	legacyUnsentReportOutstanding,
	legacyUnsentReportUncountable,
} from '@wcpos/utils/unsent-changes';

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

/** Let readiness maintenance (drain, then purge) run its awaited steps to completion. */
async function settle(): Promise<void> {
	for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

function createEngineDouble(
	dispose: () => Promise<void> = () => Promise.resolve(),
	switchScope?: (identity: ScopeIdentity) => Promise<void>
) {
	const dbListeners = new Set<(db: unknown) => void>();
	const eventListeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
	let active: { identity: ScopeIdentity } | null = null;
	const activate = (identity: ScopeIdentity | null) => {
		active = identity ? { identity } : null;
		for (const cb of dbListeners) cb({});
	};
	return {
		ready: Promise.resolve(),
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
		events: jest.fn((cb: (event: { type: string; [key: string]: unknown }) => void) => {
			eventListeners.add(cb);
			return () => eventListeners.delete(cb);
		}),
		/** An engine event, fanned out to every `events()` subscriber. */
		emit(event: { type: string; [key: string]: unknown }) {
			for (const cb of eventListeners) cb(event);
		},
		/** The engine landing on `identity`: active() flips and db$ fans out, as the real engine does inside scope.switch. */
		activate,
	};
}

function loadCreateAppEngine(
	createEngine: () => ReturnType<typeof createEngineDouble> = createEngineDouble,
	platformIsWeb = false,
	initiallyActive = true,
	/** The platform's scope database files: a native listing fake, or null (web/Electron). */
	scopeDatabaseFiles: { list(): Promise<string[]> } | null = null
) {
	jest.resetModules();
	const purgeLegacyDatabases = jest.fn(async () => undefined);
	jest.doMock('@wcpos/database/purge-legacy-db', () => ({ purgeLegacyDatabases }));
	const appMetricsObserver = jest.fn();
	const reportNetworkResponse = jest.fn();
	const recordTransport = jest.fn();
	const recordServerLoad = jest.fn();
	const networkDebug = jest.fn();
	const networkInfo = jest.fn();
	const networkWarn = jest.fn();
	const networkError = jest.fn();
	const setSyncEngineLogger = jest.fn();
	const getLogger = jest.fn(() => ({
		debug: networkDebug,
		info: networkInfo,
		warn: networkWarn,
		error: networkError,
	}));
	const markStorageTerminallyFailed = jest.fn((_databaseName: string, _reason: string) => true);
	const forceFreeDatabaseRegistration = jest.fn((_databaseName: string) => true);
	const getDatabaseEpoch = jest.fn(() => 0);
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
				holdAutomaticTicks?: () => boolean;
			},
			scope: ScopeIdentity
		) => {
			const engine = createEngine();
			if (initiallyActive) engine.activate(scope);
			return engine;
		}
	);

	const drainLegacyScopeDatabase = jest.fn(
		async (
			_ports: LegacyScopeDrainPorts,
			scope: ScopeIdentity
		): Promise<LegacyScopeDrainOutcome> => ({
			status: 'absent',
			databaseName: scopeDatabaseName(scope, { generation: 5 }),
		})
	);
	jest.doMock('@wcpos/database/scope-database-files', () => ({ scopeDatabaseFiles }));

	jest.doMock('@wcpos/sync-engine', () => ({
		createRxdbSyncEngine,
		drainLegacyScopeDatabase,
		setSyncEngineLogger,
		// The engine fetcher hydrates 2xx responses through this seam (B9); an
		// identity stub keeps these engine-lifecycle tests transport-free.
		hydrateResponse: jest.fn(async (response: Response) => response),
	}));
	jest.doMock('@wcpos/hooks', () => ({ reportNetworkResponse }), {
		virtual: true,
	});
	jest.doMock('@wcpos/utils/platform', () => ({
		Platform: { isWeb: platformIsWeb },
	}));
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
		getLogger,
		getDatabaseEpoch,
	}));
	jest.doMock('./metrics', () => ({
		appMetricsObserver,
		recordTransport,
		recordServerLoad,
		collectionFromSyncUrl: jest.fn(() => undefined),
		getMetricsEpoch: jest.fn(() => 0),
	}));

	const {
		createAppSyncEngine,
		switchAppEngineScope,
		createSessionFetcherOptions,
		inventoryLegacyScopeDatabases,
		runLegacyInventory,
	} = jest.requireActual<typeof import('./create-app-engine')>('./create-app-engine');
	const { setAppOnlineStatus } =
		jest.requireActual<typeof import('./connectivity')>('./connectivity');
	return {
		createAppSyncEngine,
		inventoryLegacyScopeDatabases,
		runLegacyInventory,
		drainLegacyScopeDatabase,
		setAppOnlineStatus,
		networkDebug,
		purgeLegacyDatabases,
		createSessionFetcherOptions,
		switchAppEngineScope,
		createRxdbSyncEngine,
		appMetricsObserver,
		setSyncEngineLogger,
		getLogger,
		recordTransport,
		recordServerLoad,
		reportNetworkResponse,
		networkInfo,
		networkWarn,
		networkError,
		markStorageTerminallyFailed,
		forceFreeDatabaseRegistration,
		getDatabaseEpoch,
	};
}

describe('createAppSyncEngine scope cache', () => {
	it('routes the engine warn sink to the orders logger category', () => {
		const { setSyncEngineLogger, getLogger, networkWarn } = loadCreateAppEngine();
		expect(setSyncEngineLogger).toHaveBeenCalledTimes(1);
		const sink = setSyncEngineLogger.mock.calls[0]![0];
		const message = 'Refund parent seed failed after order ingestion';
		const meta = { context: { parentRemoteId: 'remote-1', error: 'Error: boom' } };

		sink.warn(message, meta);

		expect(getLogger).toHaveBeenCalledWith(['wcpos', 'sync', 'orders']);
		expect(networkWarn).toHaveBeenCalledWith(message, meta);
	});

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

	it('publishes header at activation before switch settlement without peer channels', async () => {
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
			first.activate(identity);
			await ports.fetcher?.(
				'https://store.example.test/wp-json/wcpos/v2/changes/config-fingerprint'
			);
			seen.push(storeHeaderOf(fetch.mock.calls.at(-1)!));
		});
		const { createAppSyncEngine, switchAppEngineScope, createRxdbSyncEngine } = loadCreateAppEngine(
			() => first,
			true
		);
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

	it.each([false, true])(
		'awaited cashier switch stages incoming auth before settlement (same store: %s)',
		async (sameStore) => {
			let ports: {
				fetcher?: (url: string) => Promise<Response>;
				holdAutomaticTicks?: () => boolean;
			} = {};
			const observations: { token: string | null; store: string | null }[] = [];
			let beforeSettlement: (() => Promise<void>) | undefined;
			const first = createEngineDouble(undefined, async (identity) => {
				await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');
				first.activate(identity);
				await beforeSettlement?.();
			});
			const {
				createAppSyncEngine,
				switchAppEngineScope,
				createRxdbSyncEngine,
				createSessionFetcherOptions,
			} = loadCreateAppEngine(() => first);
			const { requestStateManager } = jest.requireActual<
				typeof import('@wcpos/hooks/use-http-client')
			>('@wcpos/hooks/use-http-client');
			const makeCredentials = (id: number) => {
				const doc = {
					id,
					access_token: `cashier-${id}`,
					refresh_token: `refresh-${id}`,
					getLatest: () => doc,
					incrementalPatch: async (patch: { access_token: string }) => {
						Object.assign(doc, patch);
					},
				};
				return doc;
			};
			const a = makeCredentials(1);
			const b = makeCredentials(2);
			const refreshed: string[] = [];
			const refreshHttp = jest.requireActual<
				typeof import('@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client')
			>('@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client');
			const httpClient = jest.spyOn(refreshHttp, 'createRefreshHttpClient').mockReturnValue({
				post: async (_url, data: { refresh_token: string }) => {
					refreshed.push(data.refresh_token);
					if (sameStore && data.refresh_token === 'refresh-1')
						throw new Error('HTTP 401: Unauthorized');
					return {
						data: {
							access_token: data.refresh_token.replace('refresh', 'renewed'),
							expires_at: 9999999999,
						},
						status: 200,
						statusText: 'OK',
					};
				},
			});
			const options = (credentials: typeof a) =>
				createSessionFetcherOptions(
					{ wp_api_url: BASE_OPTIONS.wpApiUrl },
					credentials,
					'Session renewed'
				);

			let demandRefresh = false;
			const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
				const headers = new Headers(init?.headers);
				const token = headers.get('Authorization');
				observations.push({ token, store: headers.get('X-WCPOS-Store') });
				return new Response(null, {
					status: demandRefresh && !token?.includes('renewed') ? 401 : 200,
				});
			});
			const incoming = {
				...BASE_OPTIONS,
				...options(b),
				scope: { ...BASE_OPTIONS.scope, cashierId: 2, storeId: sameStore ? 'store-1' : 'store-2' },
			};
			try {
				createAppSyncEngine({ ...BASE_OPTIONS, ...options(a) });
				ports = createRxdbSyncEngine.mock.calls[0]![0];
				beforeSettlement = async () => {
					demandRefresh = true;
					await ports.fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');
					if (sameStore) {
						// The render that follows commit cannot undo a poisoned refresh latch.
						createAppSyncEngine(incoming);
						expect(requestStateManager.isAuthFailed()).toBe(false);
						expect(ports.holdAutomaticTicks?.()).toBe(false);
					}
					expect(observations[0]).toEqual({ token: 'Bearer cashier-1', store: 'store-1' });
					expect(observations[1]).toEqual({
						token: 'Bearer cashier-2',
						store: incoming.scope.storeId,
					});
					expect(refreshed).toEqual(['refresh-2']);
					expect(observations.at(-1)?.token).toBe('Bearer renewed-2');
				};
				await switchAppEngineScope(
					{
						site: { wp_api_url: incoming.scope.site },
						wpCredentials: b,
						store: { id: incoming.scope.storeId },
					},
					incoming
				);
			} finally {
				fetch.mockRestore();
				httpClient.mockRestore();
			}
		}
	);

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

	it('collection-reset emissions preserve clock-skew evaluation without peer channels', async () => {
		const first = createEngineDouble();
		const { createAppSyncEngine, createRxdbSyncEngine, networkWarn } = loadCreateAppEngine(
			() => first,
			true
		);
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

		it('construction publishes the allocation scope’s header', async () => {
			const first = createEngineDouble();
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(
				() => first,
				true,
				false
			);
			createAppSyncEngine(BASE_OPTIONS);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
			first.activate(BASE_OPTIONS.scope);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
		});

		it('null activation clears a previously published header', async () => {
			const first = createEngineDouble();
			const engines = [first, createEngineDouble()];
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(
				() => engines.shift()!,
				true
			);
			createAppSyncEngine(BASE_OPTIONS);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBe('store-1');
			first.activate(null);
			expect(await sentStoreHeader(createRxdbSyncEngine)).toBeNull();
			createAppSyncEngine(OTHER_SITE_OPTIONS);
			first.activate(BASE_OPTIONS.scope);
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

	it('uses single-instance SQLite on web without elected ownership', () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks: {} },
		});
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(undefined, true);

		createAppSyncEngine(BASE_OPTIONS);

		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		expect(ports.multiInstance).toBe(false);
	});

	it('keeps SQLite single-instance when Web Locks are unavailable', () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: {},
		});
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(undefined, true);

		createAppSyncEngine({ ...BASE_OPTIONS, multiInstance: true });

		const ports = createRxdbSyncEngine.mock.calls[0]![0];
		expect(ports.multiInstance).toBe(false);
	});
});

describe('legacy database purge', () => {
	it('runs once after readiness, never blocks the open or the next engine', async () => {
		let ready!: () => void;
		const engine = createEngineDouble();
		engine.ready = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const { createAppSyncEngine, purgeLegacyDatabases } = loadCreateAppEngine(() => engine);
		purgeLegacyDatabases.mockImplementation(() => new Promise(() => {}));
		expect(createAppSyncEngine(BASE_OPTIONS)).toBe(engine);
		expect(purgeLegacyDatabases).not.toHaveBeenCalled();
		ready();
		await engine.ready;
		await settle();
		expect(purgeLegacyDatabases).toHaveBeenCalledTimes(1);
		createAppSyncEngine(OTHER_SITE_OPTIONS);
		await settle();
		expect(purgeLegacyDatabases).toHaveBeenCalledTimes(1);
	});

	it('logs a rejected purge without failing readiness', async () => {
		const { createAppSyncEngine, purgeLegacyDatabases, networkError } = loadCreateAppEngine();
		purgeLegacyDatabases.mockRejectedValue(new Error('purge failed'));
		const engine = createAppSyncEngine(BASE_OPTIONS);
		await expect(engine.ready).resolves.toBeUndefined();
		await settle();
		expect(networkError).toHaveBeenCalledWith(
			'Failed to purge legacy databases',
			expect.any(Object)
		);
	});

	it('does not purge when engine readiness fails', async () => {
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, purgeLegacyDatabases } =
			loadCreateAppEngine(() => engine);
		engine.ready = Promise.reject(new Error('open failed'));
		createAppSyncEngine(BASE_OPTIONS);
		await expect(engine.ready).rejects.toThrow('open failed');
		await settle();
		expect(drainLegacyScopeDatabase).not.toHaveBeenCalled();
		expect(purgeLegacyDatabases).not.toHaveBeenCalled();
	});
});

describe('previous-generation database drain', () => {
	const LEGACY = scopeDatabaseName(BASE_OPTIONS.scope, { generation: 5 });
	const keptRetryable: LegacyScopeDrainOutcome = {
		status: 'kept',
		databaseName: LEGACY,
		reason: 'write-drain skipped: offline',
		retryable: true,
		pushed: 0,
		carried: 0,
		remaining: { unsent: 4, held: 1 },
		keptOrderUuids: ['order-held', 'order-unsent'],
		reportDue: true,
	};
	const keptUnsendable: LegacyScopeDrainOutcome = {
		status: 'kept',
		databaseName: LEGACY,
		reason: 'unsent work is left in the queue',
		retryable: false,
		pushed: 4,
		carried: 1,
		remaining: { deadLetters: 1, conflicts: 1 },
		keptOrderUuids: ['order-conflicted', 'order-rejected'],
		reportDue: true,
	};
	const writeDrainRan = { type: 'lane-finish', lane: 'write-drain', status: 'ran' };
	/** Discovery completes and names nothing beyond the visited scope (a settled history). */
	const discoveryFindsNothingElse = (loaded: ReturnType<typeof loadCreateAppEngine>) =>
		loaded.inventoryLegacyScopeDatabases({
			registry: [],
			history: { names: [], complete: true, settled: true, markSettled: async () => undefined },
		});

	beforeEach(() => forgetUnsentChanges());
	afterEach(() => {
		forgetUnsentChanges();
		jest.restoreAllMocks();
	});

	it('drains the ready scope before the purge, with a transport pinned to that scope and the live engine to carry carts into', async () => {
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, purgeLegacyDatabases } =
			loadCreateAppEngine(() => engine);
		const order: string[] = [];
		drainLegacyScopeDatabase.mockImplementation(async (_ports, scope) => {
			order.push('drain');
			return { status: 'absent', databaseName: scopeDatabaseName(scope, { generation: 5 }) };
		});
		purgeLegacyDatabases.mockImplementation(async () => {
			order.push('purge');
		});

		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();

		expect(order).toEqual(['drain', 'purge']);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		const [ports, scope] = drainLegacyScopeDatabase.mock.calls[0]!;
		expect(scope).toEqual(BASE_OPTIONS.scope);
		expect(ports).toMatchObject({ storage: { name: 'test-storage' }, databaseFiles: null });
		expect(ports.liveEngine).toBe(engine);
		expect(typeof ports.fetcher).toBe('function');
		expect(typeof ports.diagnostics).toBe('function');
	});

	it('drains each scope once per process, the switched-to one too', async () => {
		const first = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, switchAppEngineScope } =
			loadCreateAppEngine(() => first);
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		const target = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
		const session = (identity: ScopeIdentity) => ({
			site: { wp_api_url: identity.site },
			wpCredentials: { id: identity.cashierId },
			store: { id: identity.storeId },
		});

		await switchAppEngineScope(session(target));
		await settle();
		await switchAppEngineScope(session(BASE_OPTIONS.scope));
		await settle();
		first.emit(writeDrainRan);
		await settle();

		expect(drainLegacyScopeDatabase.mock.calls.map(([, scope]) => scope)).toEqual([
			BASE_OPTIONS.scope,
			target,
		]);
	});

	it('never PUSHES while the session is refused, but still probes and reports; the first tick after pushes', async () => {
		const engine = createEngineDouble();
		const loaded = loadCreateAppEngine(() => engine);
		const { createAppSyncEngine, drainLegacyScopeDatabase, purgeLegacyDatabases } = loaded;
		drainLegacyScopeDatabase.mockResolvedValue(keptRetryable);
		const { requestStateManager } = jest.requireActual<
			typeof import('@wcpos/hooks/use-http-client')
		>('@wcpos/hooks/use-http-client');
		const isAuthFailed = jest.spyOn(requestStateManager, 'isAuthFailed').mockReturnValue(true);
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		expect(drainLegacyScopeDatabase.mock.calls[0]![0].pushBlockedReason).toBe(
			'the store refused the session'
		);
		expect(purgeLegacyDatabases).toHaveBeenCalledTimes(1);
		await discoveryFindsNothingElse(loaded);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'some', count: 5 });

		// Not an attempt: no backoff — the next tick that ran pushes, unblocked.
		isAuthFailed.mockReturnValue(false);
		engine.emit(writeDrainRan);
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(2);
		expect(drainLegacyScopeDatabase.mock.calls[1]![0].pushBlockedReason).toBeNull();
	});

	it('offline at boot with a kept v5 cart: the report carries its uuid before any tick or backoff', async () => {
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, setAppOnlineStatus, networkWarn } =
			loadCreateAppEngine(() => engine);
		drainLegacyScopeDatabase.mockResolvedValue({
			...keptRetryable,
			reason: 'write-drain skipped: offline',
			keptOrderUuids: ['order-held-cart', 'order-unsent'],
		});
		setAppOnlineStatus('offline');
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		expect(drainLegacyScopeDatabase.mock.calls[0]![0].pushBlockedReason).toBe(
			'write-drain skipped: offline'
		);
		await expect(awaitLegacyUnsentReport(LEGACY, 1)).resolves.toBe('reported');
		expect([...legacyUnsentOrderUuids(LEGACY)]).toEqual(['order-held-cart', 'order-unsent']);
		// A blocked drain is not the attempt the warn is for.
		expect(networkWarn).not.toHaveBeenCalled();

		setAppOnlineStatus('online-website-available');
		// A tick that did not run (skipped, error) proves nothing.
		engine.emit({ type: 'lane-finish', lane: 'write-drain', status: 'skipped' });
		engine.emit({ type: 'lane-finish', lane: 'pull', status: 'ran' });
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		engine.emit(writeDrainRan);
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(2);
		expect(drainLegacyScopeDatabase.mock.calls[1]![0].pushBlockedReason).toBeNull();
	});

	it('re-arms a drain that kept sendable work: after the next successful tick, no sooner than a bounded backoff', async () => {
		let now = 1_000_000;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, networkWarn, networkDebug } =
			loadCreateAppEngine(() => engine);
		drainLegacyScopeDatabase.mockResolvedValue(keptRetryable);
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		const tickAt = async (ms: number) => {
			now = ms;
			engine.emit(writeDrainRan);
			await settle();
		};

		await tickAt(1_000_000 + 59_000);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
		await tickAt(1_000_000 + 60_000);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(2);
		// Doubled: two minutes after the second attempt.
		await tickAt(1_060_000 + 119_000);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(2);
		await tickAt(1_060_000 + 120_000);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(3);
		// Capped at fifteen minutes however long it keeps failing.
		let at = 1_180_000;
		for (const backoff of [240_000, 480_000, 900_000, 900_000]) {
			await tickAt(at + backoff - 1);
			const calls = drainLegacyScopeDatabase.mock.calls.length;
			await tickAt(at + backoff);
			expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(calls + 1);
			at += backoff;
		}
		// Warned once; the retries are quiet.
		expect(networkWarn).toHaveBeenCalledTimes(1);
		expect(networkDebug).toHaveBeenCalledWith(
			'Unsent changes from the previous database version are kept until they can be sent',
			expect.anything()
		);

		drainLegacyScopeDatabase.mockResolvedValue({
			status: 'drained',
			databaseName: LEGACY,
			pushed: 4,
			carried: 0,
			fileRemoved: true,
		});
		await tickAt(at + 900_000);
		const total = drainLegacyScopeDatabase.mock.calls.length;
		await tickAt(at + 10 * 900_000);
		expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(total);
	});

	it('a cart transfer cut short by a store switch is retried once the scope is back', async () => {
		let now = 1_000_000;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase, switchAppEngineScope } =
			loadCreateAppEngine(() => engine);
		const target = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
		const session = (identity: ScopeIdentity) => ({
			site: { wp_api_url: identity.site },
			wpCredentials: { id: identity.cashierId },
			store: { id: identity.storeId },
		});
		let finishFirst!: (outcome: LegacyScopeDrainOutcome) => void;
		drainLegacyScopeDatabase.mockImplementation(async (_ports, scope) => {
			if (scope.storeId === target.storeId) {
				return { status: 'absent', databaseName: scopeDatabaseName(scope, { generation: 5 }) };
			}
			if (drainLegacyScopeDatabase.mock.calls.length === 1) {
				return new Promise<LegacyScopeDrainOutcome>((resolve) => {
					finishFirst = resolve;
				});
			}
			return {
				status: 'drained',
				databaseName: LEGACY,
				pushed: 0,
				carried: 1,
				fileRemoved: true,
			};
		});
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		// The cashier switches store while the drain is moving the cart: the live engine left.
		await switchAppEngineScope(session(target));
		await settle();
		finishFirst({
			status: 'kept',
			databaseName: LEGACY,
			reason:
				'unsent work is left in the queue; open carts not carried over: the live engine is on another scope',
			retryable: true,
			pushed: 0,
			carried: 0,
			remaining: { held: 1 },
			keptOrderUuids: ['order-held-cart'],
			reportDue: true,
		});
		await settle();

		// Back on the scope; the next write-drain tick that ran, past the backoff, carries it.
		await switchAppEngineScope(session(BASE_OPTIONS.scope));
		await settle();
		now += 60_000;
		engine.emit(writeDrainRan);
		await settle();
		expect(drainLegacyScopeDatabase.mock.calls.map(([, scope]) => scope.storeId)).toEqual([
			BASE_OPTIONS.scope.storeId,
			target.storeId,
			BASE_OPTIONS.scope.storeId,
		]);
		expect(legacyUnsentOrderUuids(LEGACY).size).toBe(0);
	});

	it('a kept database with nothing sendable, or one that failed to open, is not retried in this process', async () => {
		for (const outcome of [
			keptUnsendable,
			{ status: 'failed', databaseName: LEGACY, error: 'DB6' } as const,
		]) {
			const engine = createEngineDouble();
			const { createAppSyncEngine, drainLegacyScopeDatabase } = loadCreateAppEngine(() => engine);
			drainLegacyScopeDatabase.mockResolvedValue(outcome);
			await createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			jest.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
			engine.emit(writeDrainRan);
			await settle();
			expect(drainLegacyScopeDatabase).toHaveBeenCalledTimes(1);
			jest.restoreAllMocks();
		}
	});

	it('what a kept database holds is counted by the Clear local data warning; a drained one is not', async () => {
		const engine = createEngineDouble();
		const loaded = loadCreateAppEngine(() => engine);
		const { createAppSyncEngine, drainLegacyScopeDatabase } = loaded;
		drainLegacyScopeDatabase.mockResolvedValue(keptRetryable);
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		await discoveryFindsNothingElse(loaded);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'some', count: 5 });
		expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 7 });
		expect([...legacyUnsentOrderUuids(LEGACY)]).toEqual(['order-held', 'order-unsent']);

		jest.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
		drainLegacyScopeDatabase.mockResolvedValue({
			status: 'drained',
			databaseName: LEGACY,
			pushed: 4,
			carried: 1,
			fileRemoved: false,
		});
		engine.emit(writeDrainRan);
		await settle();
		expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
		expect(legacyUnsentOrderUuids(LEGACY).size).toBe(0);
	});

	it('the drain is marked pending at engine construction and its report releases a waiting reader', async () => {
		let report!: (outcome: LegacyScopeDrainOutcome) => void;
		const { createAppSyncEngine, drainLegacyScopeDatabase } = loadCreateAppEngine();
		drainLegacyScopeDatabase.mockImplementation(
			() =>
				new Promise<LegacyScopeDrainOutcome>((resolve) => {
					report = resolve;
				})
		);
		const engine = createAppSyncEngine(BASE_OPTIONS);
		// Before readiness has run anything: a reader that waits is already told to wait.
		let settled: string | null = null;
		void awaitLegacyUnsentReport(LEGACY, 60_000).then((result) => {
			settled = result;
		});
		await engine.ready;
		await settle();
		expect(settled).toBeNull();
		report({ status: 'absent', databaseName: LEGACY });
		await settle();
		expect(settled).toBe('reported');
	});

	describe('the boot inventory: an unvisited previous-generation database keeps the reset count unknown', () => {
		const TARGET = { ...BASE_OPTIONS.scope, storeId: 'store-2' };
		const TARGET_LEGACY = scopeDatabaseName(TARGET, { generation: 5 });
		const session = (identity: ScopeIdentity) => ({
			site: { wp_api_url: identity.site },
			wpCredentials: { id: identity.cashierId },
			store: { id: identity.storeId },
		});
		const drainsAbsent = async (_ports: unknown, scope: ScopeIdentity) =>
			({
				status: 'absent',
				databaseName: scopeDatabaseName(scope, { generation: 5 }),
			}) as LegacyScopeDrainOutcome;

		/** A web/Electron scope history; `markSettled` is what a settled history writes. */
		const history = (names: string[], complete: boolean, settled = false) => ({
			names,
			complete,
			settled,
			markSettled: jest.fn(async () => undefined),
		});

		it('native: two pos_v5 files, one visited → unknown; both visited (one drained, one absent) → exact', async () => {
			const engine = createEngineDouble();
			const list = jest.fn(async () => [
				// `list()` returns database names only (its sidecars never reach the host).
				LEGACY,
				TARGET_LEGACY,
				scopeDatabaseName(BASE_OPTIONS.scope),
			]);
			const loaded = loadCreateAppEngine(() => engine, false, true, { list });
			loaded.drainLegacyScopeDatabase.mockImplementation(async (ports, scope) =>
				scope.storeId === TARGET.storeId
					? drainsAbsent(ports, scope)
					: {
							status: 'drained',
							databaseName: LEGACY,
							pushed: 1,
							carried: 0,
							fileRemoved: true,
						}
			);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			await loaded.inventoryLegacyScopeDatabases({ registry: [] });
			// The visited scope drained; the other store's pos_v5 is still there, unread.
			expect(classifyUnsentChanges(0)).toEqual({ status: 'unknown' });
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });

			await loaded.switchAppEngineScope(session(TARGET));
			await settle();
			expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
			expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
		});

		it('web: a fresh install (complete history) counts exactly once its scopes report, and settles', async () => {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockImplementation(drainsAbsent as never);
			const fresh = history([LEGACY, TARGET_LEGACY], true);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			await loaded.inventoryLegacyScopeDatabases({
				registry: [BASE_OPTIONS.scope, TARGET],
				history: fresh,
			});
			// The second store has not been visited yet.
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			expect(fresh.markSettled).not.toHaveBeenCalled();

			await loaded.switchAppEngineScope(session(TARGET));
			await settle();
			expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
			expect(fresh.markSettled).toHaveBeenCalledTimes(1);
		});

		it('web: a settled history counts exactly at once, marking nothing', async () => {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockImplementation(drainsAbsent as never);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			await loaded.inventoryLegacyScopeDatabases({
				registry: [BASE_OPTIONS.scope, TARGET],
				history: history([LEGACY, TARGET_LEGACY], true, true),
			});
			expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
		});

		it('web: an upgraded install (history began late) stays unknown even when every registry scope reported', async () => {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockImplementation(drainsAbsent as never);
			const late = history([LEGACY, TARGET_LEGACY], false);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			await loaded.inventoryLegacyScopeDatabases({
				registry: [BASE_OPTIONS.scope, TARGET],
				history: late,
			});
			await loaded.switchAppEngineScope(session(TARGET));
			await settle();
			expect(legacyUnsentReportUncountable(LEGACY)).toBe(false);
			expect(legacyUnsentReportUncountable(TARGET_LEGACY)).toBe(false);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			expect(late.markSettled).not.toHaveBeenCalled();
		});

		it('web: a registry reference with no document (a removed store) keeps the count unknown and the history unsettled, warning once', async () => {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockImplementation(drainsAbsent as never);
			const fresh = history([LEGACY], true);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			for (let start = 0; start < 2; start += 1) {
				await loaded.inventoryLegacyScopeDatabases({
					registry: [BASE_OPTIONS.scope],
					unresolvedReferences: ['stores:store-gone'],
					history: fresh,
				});
			}
			// Every named scope reported nothing kept; the unresolved reference still blocks.
			expect(legacyUnsentReportOutstanding(LEGACY)).toBe(false);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			expect(fresh.markSettled).not.toHaveBeenCalled();
			const warned = loaded.networkWarn.mock.calls.filter(([message]) =>
				String(message).startsWith('The store registry names records that are missing')
			);
			expect(warned).toEqual([
				[
					expect.any(String),
					expect.objectContaining({ context: { unresolved: ['stores:store-gone'] } }),
				],
			]);
		});

		it('web: a scope opened and then its site removed stays in the history, and pending', async () => {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockImplementation(drainsAbsent as never);
			const removedSite = scopeDatabaseName(
				{ site: 'https://removed.example.test', storeId: 1, cashierId: 1 },
				{ generation: 5 }
			);
			const opened = history([LEGACY, removedSite], true);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			// The removed site is gone from the registry; the history still names its pos_v5.
			await loaded.inventoryLegacyScopeDatabases({
				registry: [BASE_OPTIONS.scope],
				history: opened,
			});
			expect(legacyUnsentReportOutstanding(removedSite)).toBe(true);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			expect(opened.markSettled).not.toHaveBeenCalled();
		});
	});

	describe('the overall inventory', () => {
		it('a reset opened before discovery resolves reads unknown; discovery that finds nothing kept makes it exact', async () => {
			const loaded = loadCreateAppEngine();
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			// The active scope reported absent; the other scopes are not yet discovered.
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			let resolve!: () => void;
			const discovery = loaded.runLegacyInventory(
				() =>
					new Promise((done) => {
						resolve = () =>
							done({
								registry: [],
								history: {
									names: [],
									complete: true,
									settled: true,
									markSettled: async () => undefined,
								},
							});
					})
			);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			resolve();
			await discovery;
			expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
		});

		it('a discovery that cannot read leaves the count unknown for the process, warning once', async () => {
			const loaded = loadCreateAppEngine();
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			for (let start = 0; start < 2; start += 1) {
				await loaded.runLegacyInventory(async () => {
					throw new Error('user database unavailable');
				});
			}
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
			const warned = loaded.networkWarn.mock.calls.filter(([message]) =>
				String(message).startsWith("Could not list the previous database version's scope databases")
			);
			expect(warned).toHaveLength(1);
			// A later engine construction does not re-mark it as merely pending.
			loaded.createAppSyncEngine(OTHER_SITE_OPTIONS);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'unknown' });
		});

		it('native: a registry read that fails still lists the files', async () => {
			const list = jest.fn(async () => [] as string[]);
			const loaded = loadCreateAppEngine(createEngineDouble, false, true, { list });
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			await loaded.runLegacyInventory(async () => {
				throw new Error('user database unavailable');
			});
			expect(list).toHaveBeenCalledTimes(1);
			expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
		});
	});

	it('a scope whose engine never became ready releases its mark as uncountable instead of leaving waiters hanging', async () => {
		const engine = createEngineDouble();
		const { createAppSyncEngine, drainLegacyScopeDatabase } = loadCreateAppEngine(() => engine);
		engine.ready = Promise.reject(new Error('open failed'));
		createAppSyncEngine(BASE_OPTIONS);
		await expect(engine.ready).rejects.toThrow('open failed');
		await settle();
		expect(drainLegacyScopeDatabase).not.toHaveBeenCalled();
		await expect(awaitLegacyUnsentReport(LEGACY, 1)).resolves.toBe('reported');
		expect(legacyUnsentReportUncountable(LEGACY)).toBe(true);
	});

	it('a drain that failed to open is reported (nothing waits on it) but stays uncountable', async () => {
		const { createAppSyncEngine, drainLegacyScopeDatabase } = loadCreateAppEngine();
		drainLegacyScopeDatabase.mockResolvedValue({
			status: 'failed',
			databaseName: LEGACY,
			error: 'DB6',
		});
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		await expect(awaitLegacyUnsentReport(LEGACY, 1)).resolves.toBe('reported');
		expect(classifyUnsentChanges(0)).toEqual({ status: 'unknown' });
	});

	it('logs one line per outcome: failed is an error with a code, kept warns when due, drained says whether the file went', async () => {
		for (const [outcome, level, message, context] of [
			[
				{ status: 'failed', databaseName: LEGACY, error: 'DB6: schema mismatch' },
				'error',
				'Could not open the previous database version to send its unsent changes',
				{ databaseName: LEGACY, error: 'DB6: schema mismatch' },
			],
			[
				keptRetryable,
				'warn',
				'Unsent changes from the previous database version are kept until they can be sent',
				{ reason: 'write-drain skipped: offline', retryable: true },
			],
			[
				keptUnsendable,
				'warn',
				'Unsent changes from the previous database version are kept until they can be sent',
				{ pushed: 4, carried: 1, remaining: { deadLetters: 1, conflicts: 1 } },
			],
			[
				{ ...keptUnsendable, reportDue: false },
				'debug',
				'Unsent changes from the previous database version are kept until they can be sent',
				{ retryable: false },
			],
			[
				{ status: 'drained', databaseName: LEGACY, pushed: 4, carried: 0, fileRemoved: true },
				'info',
				'Sent 4 unsent changes from the previous database version and removed it',
				{ databaseName: LEGACY, pushed: 4 },
			],
			[
				{ status: 'drained', databaseName: LEGACY, pushed: 2, carried: 1, fileRemoved: false },
				'info',
				'Sent 2 unsent changes and moved 1 open carts from the previous database version and dropped its tables (its file remains)',
				{ fileRemoved: false },
			],
		] as const) {
			const loaded = loadCreateAppEngine();
			loaded.drainLegacyScopeDatabase.mockResolvedValue(outcome as LegacyScopeDrainOutcome);
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			await settle();
			const logged = {
				error: loaded.networkError,
				warn: loaded.networkWarn,
				info: loaded.networkInfo,
				debug: loaded.networkDebug,
			}[level];
			expect(logged).toHaveBeenCalledWith(
				message,
				expect.objectContaining({ context: expect.objectContaining(context) })
			);
			if (level === 'error') {
				expect(logged).toHaveBeenCalledWith(
					message,
					expect.objectContaining({ code: expect.any(String) })
				);
			}
			if (level === 'debug') expect(loaded.networkWarn).not.toHaveBeenCalled();
		}
	});

	it('with the REAL drain: the host ports send a closed v5 sale once through its pinned transport, then remove pos_v5', async () => {
		const { getRxStorageMemory } = jest.requireActual<typeof import('rxdb/plugins/storage-memory')>(
			'rxdb/plugins/storage-memory'
		);
		const { createRxDatabase } = jest.requireActual<typeof import('rxdb')>('rxdb');
		const actual = jest.requireActual<typeof import('@wcpos/sync-engine')>('@wcpos/sync-engine');
		const { engineCollectionCreators } = jest.requireActual<
			typeof import('@wcpos/sync-engine/testing')
		>('@wcpos/sync-engine/testing');
		const { createFakeWriteServer } = jest.requireActual<typeof import('@wcpos/sync-core/testing')>(
			'@wcpos/sync-core/testing'
		);
		// The engine opens more collections than open-core rxdb allows without the premium flag.
		jest
			.requireActual<typeof import('rxdb-premium/plugins/shared')>('rxdb-premium/plugins/shared')
			.setPremiumFlag();
		const storage = getRxStorageMemory();
		const recordId = '17400000-0000-4000-8000-0000000000aa';
		const mutationId = '17400000-0000-4000-8000-0000000000ab';
		const payload = {
			status: 'completed',
			total: '9.00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: recordId }],
		};
		// A till that closed a sale under v5 and upgraded before it was sent.
		const legacy = await createRxDatabase({ name: LEGACY, storage, multiInstance: false });
		const creators = engineCollectionCreators();
		await legacy.addCollections({
			orders: creators.orders as never,
			recordMutations: creators.recordMutations as never,
		});
		await legacy.collections.orders!.insert({
			posUserId: '',
			posStoreId: '',
			uuid: recordId,
			remoteId: null,
			remoteKey: '',
			number: '',
			dateCreatedGmt: '2026-09-30T08:00:00',
			status: 'completed',
			total: '9.00',
			customerId: 0,
			payload,
			sync: { revision: '', partial: false, source: 'skeleton' },
			local: { dirty: true, pendingMutationIds: [mutationId] },
		});
		await legacy.collections.recordMutations!.insert({
			mutationId,
			collectionName: 'orders',
			operation: 'create',
			recordId,
			origin: 'existing',
			payload,
			baseRevision: null,
			queuedAt: '2026-09-30T08:00:00.000Z',
			seq: 1,
			status: 'pending',
		});
		await legacy.close();

		const server = createFakeWriteServer();
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (!url.includes('/push/')) {
					return Response.json({ changes: [], complete: true, documents: [] });
				}
				// The fake answers a bare { status, json }; the host's fetcher reads real headers.
				const answer = await server.fetch(url.split('?')[0]!, {
					...init,
					headers: new Headers(init?.headers),
				} as never);
				return Response.json(await answer.json(), { status: answer.status });
			});
		const loaded = loadCreateAppEngine();
		jest.requireMock<{ defaultConfig: { storage: unknown } }>(
			'@wcpos/database/adapters/default'
		).defaultConfig.storage = storage;
		loaded.drainLegacyScopeDatabase.mockImplementation(actual.drainLegacyScopeDatabase as never);
		try {
			await loaded.createAppSyncEngine(BASE_OPTIONS).ready;
			for (
				let turn = 0;
				turn < 200 &&
				!loaded.networkInfo.mock.calls.some(([message]) => String(message).startsWith('Sent ')) &&
				loaded.networkWarn.mock.calls.length === 0 &&
				loaded.networkError.mock.calls.length === 0;
				turn += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect([loaded.networkWarn.mock.calls, loaded.networkError.mock.calls]).toEqual([[], []]);
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual([mutationId]);
			expect([...server.applied.keys()]).toEqual([recordId]);
			expect(loaded.networkInfo).toHaveBeenCalledWith(
				'Sent 1 unsent changes from the previous database version and dropped its tables (its file remains)',
				expect.anything()
			);
			// Pinned to the drained scope's store: the push carries that store's id on the wire.
			const [pushUrl, pushInit] = fetch.mock.calls.find(([url]) => String(url).includes('/push/'))!;
			const wire = `${String(pushUrl)} ${JSON.stringify(Object.fromEntries(new Headers(pushInit?.headers)))}`;
			expect(wire).toContain('store-1');
			await discoveryFindsNothingElse(loaded);
			expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
		} finally {
			fetch.mockRestore();
		}
	}, 30_000);

	it("logs a push the store refused during the drain with the store's reason and message", async () => {
		const { createAppSyncEngine, drainLegacyScopeDatabase, networkWarn } = loadCreateAppEngine();
		await createAppSyncEngine(BASE_OPTIONS).ready;
		await settle();
		const [ports] = drainLegacyScopeDatabase.mock.calls[0]!;
		ports.onWriteEvent!({
			type: 'write-rejected',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-1',
			status: 400,
			reason: 'rest_invalid_param',
			serverMessage: 'Invalid parameter(s): billing',
		});
		expect(networkWarn).toHaveBeenCalledWith(
			'The store refused a change from the previous database version',
			expect.objectContaining({
				context: expect.objectContaining({
					databaseName: LEGACY,
					recordId: 'order-1',
					status: 400,
					reason: 'rest_invalid_param',
					serverMessage: 'Invalid parameter(s): billing',
				}),
			})
		);
	});
});
