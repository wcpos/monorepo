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
} satisfies CreateAppSyncEngineOptions;

const OTHER_SITE_OPTIONS = {
	...BASE_OPTIONS,
	wpApiUrl: 'https://other.example.test/wp-json/',
	scope: {
		...BASE_OPTIONS.scope,
		site: 'https://other.example.test',
	},
} satisfies CreateAppSyncEngineOptions;

function createEngineDouble(
	dispose: () => Promise<void> = () => Promise.resolve(),
	switchScope: () => Promise<void> = () => Promise.resolve()
) {
	return {
		dispose: jest.fn(dispose),
		scope: {
			switch: jest.fn(switchScope),
		},
	};
}

function loadCreateAppEngine(
	createEngine: () => ReturnType<typeof createEngineDouble> = createEngineDouble,
	platformIsWeb = false
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
	const writeLeaders: { isLeader: jest.Mock<boolean>; dispose: jest.Mock<void> }[] = [];
	const electWriteLeader = jest.fn(() => {
		const leader = { isLeader: jest.fn(() => true), dispose: jest.fn() };
		writeLeaders.push(leader);
		return leader;
	});
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
			},
			_scope: unknown
		) => createEngine()
	);

	jest.doMock('@wcpos/sync-engine', () => ({ createRxdbSyncEngine }));
	jest.doMock('@wcpos/hooks', () => ({ reportNetworkResponse }), { virtual: true });
	jest.doMock('@wcpos/utils/platform', () => ({ Platform: { isWeb: platformIsWeb } }));
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
		getLogger: jest.fn(() => ({ info: networkInfo, warn: networkWarn, error: networkError })),
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
	};
}

describe('createAppSyncEngine scope cache', () => {
	it('reports settled non-server-error transport responses as network pulses', async () => {
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
		fetch.mockRestore();
	});

	it('does not let an auth retry adopt a later scope activation', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
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
		expect(refreshAuth).toHaveBeenCalledTimes(1);

		createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
		resolveRefresh('refreshed-token');
		await priorRequest;
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
		expect(networkError).toHaveBeenCalledTimes(2);
		expect(networkError).toHaveBeenCalledWith('open stalled', {
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
		expect(networkError).toHaveBeenCalledWith('engine.lane.tick', {
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
		expect(networkWarn).toHaveBeenCalledTimes(1);
		expect(networkWarn).toHaveBeenCalledWith('seed failed', {
			context: expect.objectContaining({ type: 'engine.pos-bootstrap-error', scopeId: 'scope-1' }),
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
			context: expect.objectContaining({ type: 'push.error', direction: 'push' }),
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
		outgoingDiagnostics?.({ type: 'engine.ready-failed', level: 'error', message: 'late failure' });
		expect(appMetricsObserver).toHaveBeenCalledTimes(1);
		expect(networkError).not.toHaveBeenCalled();

		incomingDiagnostics?.({ type: 'engine.ready-failed', level: 'error', message: 'live failure' });
		expect(networkError).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('live failure', {
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

		const second = createAppSyncEngine({ ...BASE_OPTIONS, scope: changedScope });
		const cached = createAppSyncEngine({ ...BASE_OPTIONS, scope: changedScope });

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

	it('awaited scope switch is a no-op for cross-site or incomplete sessions', async () => {
		const { createAppSyncEngine, switchAppEngineScope } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		await switchAppEngineScope({
			site: { wp_api_url: OTHER_SITE_OPTIONS.scope.site },
			wpCredentials: { id: 'cashier-1' },
			store: { id: 'store-2' },
		});
		await switchAppEngineScope({ site: { wp_api_url: BASE_OPTIONS.scope.site } });

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

	it('restores the fetcher auth options when a render-path switch rejects', async () => {
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
		createAppSyncEngine({ ...BASE_OPTIONS, scope: target });

		expect(first.scope.switch).toHaveBeenCalledTimes(2);
		expect(networkError).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({
					errorCode: 'DB01007',
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

			const switched = createAppSyncEngine({ ...OTHER_SITE_OPTIONS, scope: targetScope });
			await second.scope.switch.mock.results[0]?.value;
			const cached = createAppSyncEngine({ ...OTHER_SITE_OPTIONS, scope: targetScope });

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
			'https://store.example.test/wp-json/wcpos/v2/products?authorization=Bearer+latest-token',
			expect.objectContaining({ headers: expect.objectContaining({}) })
		);
		const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		const headers = init.headers as Headers;
		expect(headers.get('Authorization')).toBeNull();
		expect(headers.get('X-WCPOS')).toBe('1');
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
			expect.objectContaining({ type: 'engine.write-leader.degraded', level: 'warn' })
		);
	});
});
