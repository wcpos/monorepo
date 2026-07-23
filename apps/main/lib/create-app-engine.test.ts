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

function createEngineDouble(dispose: () => Promise<void> = () => Promise.resolve()) {
	return {
		dispose: jest.fn(dispose),
	};
}

function loadCreateAppEngine(
	createEngine: () => ReturnType<typeof createEngineDouble> = createEngineDouble
) {
	jest.resetModules();
	const appMetricsObserver = jest.fn();
	const recordTransport = jest.fn();
	const recordServerLoad = jest.fn();
	const networkInfo = jest.fn();
	const networkWarn = jest.fn();
	const networkError = jest.fn();
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
			},
			_scope: unknown
		) => createEngine()
	);

	jest.doMock('@wcpos/sync-engine', () => ({ createRxdbSyncEngine }));
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

	const { createAppSyncEngine } =
		jest.requireActual<typeof import('./create-app-engine')>('./create-app-engine');
	return {
		createAppSyncEngine,
		createRxdbSyncEngine,
		appMetricsObserver,
		recordTransport,
		recordServerLoad,
		networkInfo,
		networkWarn,
		networkError,
		getDatabaseEpoch,
	};
}

describe('createAppSyncEngine scope cache', () => {
	it.each([
		['orders', 'wc/v3/orders'],
		['products', 'wc/v3/products'],
		['customers', 'wc/v3/customers'],
		['taxRates', 'wcpos/v2/taxes'],
		['categories', 'wc/v3/products/categories'],
		['brands', 'wc/v3/products/brands'],
		['tags', 'wc/v3/products/tags'],
		['coupons', 'wc/v3/coupons'],
	])('fetches the %s census through the instrumented wc/v3 route', async (collection, route) => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: { 'X-WP-Total': '17', 'content-length': '0' },
			})
		);
		const { createAppSyncEngine, createRxdbSyncEngine, recordTransport } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const queryTotal = createRxdbSyncEngine.mock.calls[0]?.[0].queryTotal;

		const total = await queryTotal?.fetchWooQueryTotal({
			request: {
				queryKey: `census:${collection}`,
				endpoint: collection,
				params: { ignored: 'value', page: 9, per_page: 50 },
				totalHeader: 'X-WP-Total',
			},
		});

		expect(total).toBe(17);
		expect(fetch).toHaveBeenCalledWith(
			`https://store.example.test/wp-json/${route}?ignored=value&page=1&per_page=1`,
			expect.objectContaining({ headers: expect.any(Headers) })
		);
		expect(recordTransport).toHaveBeenCalledTimes(1);
		fetch.mockRestore();
	});

	it('reports variations census as unsupported without making a request', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch');
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const queryTotal = createRxdbSyncEngine.mock.calls[0]?.[0].queryTotal;

		const total = await queryTotal?.fetchWooQueryTotal({
			request: {
				queryKey: 'census:variations',
				endpoint: 'variations',
				params: { page: 1, per_page: 1 },
				totalHeader: 'X-WP-Total',
			},
		});

		expect(total).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
		fetch.mockRestore();
	});

	it.each([null, '', '3.5', '-1', 'not-a-number'])(
		'rejects an invalid X-WP-Total value %p',
		async (header) => {
			const headers = new Headers();
			if (header !== null) headers.set('X-WP-Total', header);
			const fetch = jest
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(new Response(null, { status: 200, headers }));
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
			createAppSyncEngine(BASE_OPTIONS);
			const queryTotal = createRxdbSyncEngine.mock.calls[0]?.[0].queryTotal;

			await expect(
				queryTotal?.fetchWooQueryTotal({
					request: {
						queryKey: 'census:orders',
						endpoint: 'orders',
						params: {},
						totalHeader: 'X-WP-Total',
					},
				})
			).rejects.toThrow('Invalid X-WP-Total');
			fetch.mockRestore();
		}
	);

	it('wires diagnostics and records response metrics without reading the body', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_025);
		const response = new Response('do not read', {
			status: 200,
			headers: {
				'content-length': '42',
				'X-Server-Load': '[0.5,0.3,0.2]',
			},
		});
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		const {
			createAppSyncEngine,
			createRxdbSyncEngine,
			appMetricsObserver,
			recordTransport,
			recordServerLoad,
		} = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const ports = createRxdbSyncEngine.mock.calls[0]?.[0];

		const result = await ports?.fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(result).toBe(response);
		expect(ports?.diagnostics).toEqual(expect.any(Function));
		expect(appMetricsObserver).toHaveBeenCalledWith({
			type: 'transport.request',
			level: 'info',
			fields: { durationMs: 25, bytes: 42, status: 200 },
		});
		expect(recordTransport).toHaveBeenCalledWith({
			atMs: 1_025,
			durationMs: 25,
			bytes: 42,
			ok: true,
			epoch: 0,
		});
		expect(recordServerLoad).toHaveBeenCalledWith(0.5, 0);
		expect(response.bodyUsed).toBe(false);
		now.mockRestore();
		fetch.mockRestore();
	});

	it('persists readiness diagnostics to the health log but keeps lane ticks metrics-only', () => {
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
		// Periodic lane summaries emit at error level on every failing poll —
		// they must stay metrics-only or a degraded session floods the log.
		diagnostics?.({
			type: 'engine.lane.tick',
			level: 'error',
			fields: { lane: 'change-signal', status: 'error' },
		});

		expect(appMetricsObserver).toHaveBeenCalledTimes(3);
		expect(networkError).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('open stalled', {
			saveToDb: true,
			context: expect.objectContaining({
				type: 'engine.ready-stalled',
				phase: 'create-database',
				elapsedMs: 15_000,
			}),
		});
		expect(networkWarn).toHaveBeenCalledTimes(1);
		expect(networkWarn).toHaveBeenCalledWith('seed failed', {
			saveToDb: true,
			context: expect.objectContaining({ type: 'engine.pos-bootstrap-error', scopeId: 'scope-1' }),
		});
	});

	it('drops a superseded engine’s late diagnostics from the health log', () => {
		const { createAppSyncEngine, createRxdbSyncEngine, appMetricsObserver, networkError } =
			loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const outgoingDiagnostics = createRxdbSyncEngine.mock.calls[0]?.[0].diagnostics;
		// A scope change disposes the first engine and caches the second.
		createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
		const incomingDiagnostics = createRxdbSyncEngine.mock.calls[1]?.[0].diagnostics;

		// The outgoing engine's initial-open chain settles late: metrics still
		// tally it, but nothing lands in the incoming store's health log.
		outgoingDiagnostics?.({ type: 'engine.ready-failed', level: 'error', message: 'late failure' });
		expect(appMetricsObserver).toHaveBeenCalledTimes(1);
		expect(networkError).not.toHaveBeenCalled();

		incomingDiagnostics?.({ type: 'engine.ready-failed', level: 'error', message: 'live failure' });
		expect(networkError).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('live failure', {
			saveToDb: true,
			context: expect.objectContaining({ type: 'engine.ready-failed' }),
		});
	});

	it('records a network error and rethrows it', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValueOnce(2_000).mockReturnValueOnce(2_040);
		const networkError = new Error(
			'network down for https://store.example.test/wp-json/wcpos/v2/products?authorization=secret'
		);
		const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(networkError);
		const {
			createAppSyncEngine,
			createRxdbSyncEngine,
			appMetricsObserver,
			recordTransport,
			networkError: logNetworkError,
		} = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await expect(fetcher?.('https://store.example.test/wp-json/wcpos/v2/products')).rejects.toBe(
			networkError
		);

		expect(appMetricsObserver).toHaveBeenCalledWith({
			type: 'transport.request',
			level: 'warn',
			fields: { durationMs: 40, bytes: 0, status: 0 },
		});
		expect(recordTransport).toHaveBeenCalledWith({
			atMs: 2_040,
			durationMs: 40,
			bytes: 0,
			ok: false,
			epoch: 0,
		});
		expect(logNetworkError).toHaveBeenCalledWith('Sync request failed', {
			saveToDb: true,
			context: expect.objectContaining({
				method: 'GET',
				endpoint: '/wp-json/wcpos/v2/products',
				status: 0,
			}),
		});
		now.mockRestore();
		fetch.mockRestore();
	});

	it('does not persist expected sync aborts as errors', async () => {
		const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
		const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(abort);
		const { createAppSyncEngine, createRxdbSyncEngine, networkError } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);

		await expect(
			createRxdbSyncEngine.mock.calls[0]?.[0].fetcher?.(
				'https://store.example.test/wp-json/wcpos/v2/products'
			)
		).rejects.toBe(abort);
		expect(networkError).not.toHaveBeenCalled();
		fetch.mockRestore();
	});

	it('persists successful sync mutations without query credentials', async () => {
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 200 }));
		const { createAppSyncEngine, createRxdbSyncEngine, networkInfo } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, useJwtAsParam: true });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=secret', {
			method: 'POST',
		});

		expect(networkInfo).toHaveBeenCalledWith('Sync request result', {
			saveToDb: true,
			context: expect.objectContaining({
				method: 'POST',
				endpoint: '/wp-json/wcpos/v2/push/orders',
				status: 200,
			}),
		});
		fetch.mockRestore();
	});

	it.each(['not-json', '{"load":0.5}', '["0.5"]'])(
		'ignores malformed server load %s',
		async (load) => {
			const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response(null, {
					status: 200,
					headers: { 'X-Server-Load': load },
				})
			);
			const { createAppSyncEngine, createRxdbSyncEngine, recordServerLoad } = loadCreateAppEngine();
			createAppSyncEngine(BASE_OPTIONS);
			const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

			await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

			expect(recordServerLoad).not.toHaveBeenCalled();
			fetch.mockRestore();
		}
	);

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

	it.each([
		['storeId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } }],
		['cashierId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-2' } }],
		[
			'site',
			{
				...BASE_OPTIONS,
				wpApiUrl: 'https://other.example.test/wp-json/',
				scope: { ...BASE_OPTIONS.scope, site: 'https://other.example.test' },
			},
		],
	] satisfies readonly (readonly [string, CreateAppSyncEngineOptions])[])(
		'treats %s as part of the scope key',
		(_field, changedOptions) => {
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
			const first = createAppSyncEngine(BASE_OPTIONS);

			const second = createAppSyncEngine(changedOptions);

			expect(second).not.toBe(first);
			expect(createRxdbSyncEngine).toHaveBeenCalledTimes(2);
			expect(first.dispose).toHaveBeenCalledTimes(1);
		}
	);

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

	it('refreshes after a 401 and retries once with the latest access token', async () => {
		let accessToken = 'expired-token';
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: accessToken })),
		};
		const refreshAuth = jest.fn(async () => {
			accessToken = 'refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { createAppSyncEngine, createRxdbSyncEngine, appMetricsObserver, networkError } =
			loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, credentials, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(200);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(networkError).not.toHaveBeenCalled();
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				type: 'transport.request',
				level: 'warn',
				fields: expect.objectContaining({ status: 401 }),
			})
		);
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				type: 'transport.request',
				level: 'info',
				fields: expect.objectContaining({ status: 200 }),
			})
		);
		const firstHeaders = fetch.mock.calls[0]?.[1]?.headers as Headers;
		const retryHeaders = fetch.mock.calls[1]?.[1]?.headers as Headers;
		expect(firstHeaders.get('Authorization')).toBe('Bearer expired-token');
		expect(retryHeaders.get('Authorization')).toBe('Bearer refreshed-token');
		fetch.mockRestore();
	});

	it('retries with a peer-refreshed token instead of refreshing again on staggered 401s', async () => {
		let accessToken = 'stale-token';
		const credentials = { getLatest: jest.fn(() => ({ access_token: accessToken })) };
		const refreshAuth = jest.fn(async () => {
			accessToken = 'self-refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementationOnce(async () => {
				// A concurrent request refreshes the JWT while this one is in flight.
				accessToken = 'peer-refreshed-token';
				return new Response(null, { status: 401 });
			})
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, credentials, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(200);
		expect(refreshAuth).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(2);
		const retryHeaders = fetch.mock.calls[1]?.[1]?.headers as Headers;
		expect(retryHeaders.get('Authorization')).toBe('Bearer peer-refreshed-token');
		fetch.mockRestore();
	});

	it('returns the original 401 when refresh fails without retrying', async () => {
		const originalUnauthorized = new Response(null, { status: 401 });
		const refreshAuth = jest.fn().mockResolvedValue(null);
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(originalUnauthorized);
		const { createAppSyncEngine, createRxdbSyncEngine, networkError } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(originalUnauthorized.status);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(networkError).toHaveBeenCalledWith('Sync request result', {
			saveToDb: true,
			context: expect.objectContaining({ status: 401 }),
		});
		fetch.mockRestore();
	});

	it('does not refresh or loop when the retried request is still unauthorized', async () => {
		const refreshAuth = jest.fn().mockResolvedValue('refreshed-token');
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(401);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		fetch.mockRestore();
	});

	it('never refreshes a request to the refresh endpoint', async () => {
		const refreshAuth = jest.fn().mockResolvedValue('refreshed-token');
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 401 }));
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine({ ...BASE_OPTIONS, refreshAuth });
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/auth/refresh');

		expect(refreshAuth).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(1);
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

		createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
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
});
