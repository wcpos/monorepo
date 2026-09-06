import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockNetworkInfo = jest.fn();
const mockNetworkWarn = jest.fn();
const mockNetworkError = jest.fn();
const mockRecordTransport = jest.fn();
const mockRecordServerLoad = jest.fn();

jest.mock('@wcpos/query', () =>
	jest.requireActual('../../../packages/query/src/engine-adapter/collection-map')
);

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: mockNetworkInfo,
		warn: mockNetworkWarn,
		error: mockNetworkError,
	})),
}));

jest.mock('./metrics', () => ({
	collectionFromSyncUrl: jest.fn(() => undefined),
	getMetricsEpoch: jest.fn(() => 0),
	recordServerLoad: mockRecordServerLoad,
	recordTransport: mockRecordTransport,
}));

const BASE_AUTH = {
	credentials: { getLatest: () => ({ access_token: 'test-token' }) },
};

function loadEngineFetcher() {
	return jest.requireActual<typeof import('./engine-fetcher')>('./engine-fetcher');
}

function createFetcherHarness(
	input: {
		auth?: typeof BASE_AUTH & {
			refreshAuth?: (context?: { operationId?: string }) => Promise<string | null>;
			useJwtAsParam?: boolean;
			bareAuthParam?: boolean;
			useProtocolHeaders?: boolean;
		};
		clockSkew?: { generation: number; evaluated: boolean };
		scope?: { storeId?: number | string | null };
		fetch?: typeof globalThis.fetch;
		useRestRouteParam?: boolean;
		wpJsonRoot?: string;
	} = {}
) {
	const { createEngineFetcher, fetchWooQueryTotal } = loadEngineFetcher();
	const { createSyncLogObserver } =
		jest.requireActual<typeof import('./sync-log-observer')>('./sync-log-observer');
	const appMetricsObserver = jest.fn();
	const networkLogger: Record<string, jest.Mock> = {
		info: mockNetworkInfo,
		warn: mockNetworkWarn,
		error: mockNetworkError,
	};
	const syncLogObserver = createSyncLogObserver({
		persist: (level, message, context, terminal) => {
			networkLogger[level]?.(message, { context, terminal });
		},
	});
	const emitTransport = (event: Parameters<typeof appMetricsObserver>[0], durable = true): void => {
		try {
			appMetricsObserver(event);
		} catch (error) {
			console.error('Metrics observer threw on a transport event', error);
		}
		if (!durable) return;
		try {
			syncLogObserver.observe(event);
		} catch (error) {
			console.error('Log observer threw on a transport event', error);
		}
	};
	const scope = input.scope ?? {};
	const fetcher = createEngineFetcher({
		auth: input.auth ?? { ...BASE_AUTH, useRestRouteParam: input.useRestRouteParam ?? false },
		clockSkew: input.clockSkew ?? { generation: 0, evaluated: false },
		scope,
		emitTransport,
		fetch: input.fetch,
		wpJsonRoot: input.wpJsonRoot ?? 'https://store.example.test/wp-json/',
	});
	return {
		fetcher,
		scope,
		fetchWooQueryTotal: (queryInput: Parameters<typeof fetchWooQueryTotal>[0]) =>
			fetchWooQueryTotal(queryInput, fetcher, 'https://store.example.test/wp-json/'),
		emitTransport,
		appMetricsObserver,
		recordTransport: mockRecordTransport,
		recordServerLoad: mockRecordServerLoad,
		networkInfo: mockNetworkInfo,
		networkWarn: mockNetworkWarn,
		networkError: mockNetworkError,
	};
}

beforeEach(() => {
	void (globalThis as typeof globalThis & { __ExpoImportMetaRegistry: unknown })
		.__ExpoImportMetaRegistry;
	void globalThis.structuredClone;
	void globalThis.fetch;
	jest.clearAllMocks();
});

describe('createEngineFetcher', () => {
	it('logs one coded warning when six consecutive responses are rate-limited', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher, networkWarn } = createFetcherHarness({ fetch });
		await fetcher('https://store.example.test/wp-json/wcpos/v2/products');
		networkWarn.mockClear();
		fetch.mockResolvedValue(new Response(null, { status: 429 }));

		const responses = [];
		for (let count = 0; count < 6; count++) {
			responses.push(await fetcher('https://store.example.test/wp-json/wcpos/v2/products'));
		}

		expect(responses.map(({ status }) => status)).toEqual([429, 429, 429, 429, 429, 429]);
		expect(
			networkWarn.mock.calls.filter(
				([, options]) => options?.code === ERROR_CODES.HOST_RATE_LIMITED
			)
		).toEqual([
			[
				'Host persistently rate-limited sync requests',
				{
					code: ERROR_CODES.HOST_RATE_LIMITED,
					showToast: true,
					context: { consecutive429s: 6 },
				},
			],
		]);
	});

	it('resets the consecutive rate-limit count on any non-429 response', async () => {
		const statuses = [200, ...Array(5).fill(429), 200, ...Array(5).fill(429)];
		const fetch = jest.fn(async () => new Response(null, { status: statuses.shift() ?? 500 }));
		const { fetcher, networkWarn } = createFetcherHarness({ fetch });

		while (statuses.length > 0) {
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products');
		}

		expect(
			networkWarn.mock.calls.filter(
				([, options]) => options?.code === ERROR_CODES.HOST_RATE_LIMITED
			)
		).toHaveLength(0);
	});

	it('latches the rate-limit warning for the remainder of one streak', async () => {
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValue(new Response(null, { status: 429 }));
		const { fetcher, networkWarn } = createFetcherHarness({ fetch });

		for (let count = 0; count < 11; count++) {
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products');
		}

		expect(
			networkWarn.mock.calls.filter(
				([, options]) => options?.code === ERROR_CODES.HOST_RATE_LIMITED
			)
		).toHaveLength(1);
	});

	it('starts a fresh streak for each fetcher so a store switch cannot inherit one', async () => {
		// The outgoing site's streak must not fire (or suppress) the warning on
		// the incoming site: a fetcher is built per engine, so the count and the
		// latch belong to the fetcher, never to the module.
		const outgoingFetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValue(new Response(null, { status: 429 }));
		const outgoing = createFetcherHarness({ fetch: outgoingFetch });
		// A clean 200 first: this test must measure THIS fetcher's streak, not a
		// latch left behind by an earlier case in the file.
		await outgoing.fetcher('https://store.example.test/wp-json/wcpos/v2/products');
		for (let count = 0; count < 5; count++) {
			await outgoing.fetcher('https://store.example.test/wp-json/wcpos/v2/products');
		}
		expect(
			outgoing.networkWarn.mock.calls.filter(
				([, options]) => options?.code === ERROR_CODES.HOST_RATE_LIMITED
			)
		).toHaveLength(0);

		const incomingFetch = jest.fn().mockResolvedValue(new Response(null, { status: 429 }));
		const incoming = createFetcherHarness({ fetch: incomingFetch });
		await incoming.fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		// One 429 on the new fetcher: nowhere near the threshold on its own.
		expect(
			incoming.networkWarn.mock.calls.filter(
				([, options]) => options?.code === ERROR_CODES.HOST_RATE_LIMITED
			)
		).toHaveLength(0);
	});

	it('emits an exact query-form GET URL with caller params', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			useRestRouteParam: true,
			wpJsonRoot: 'https://store.example.test/wp-json/',
		});

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products?page=2&per_page=50');

		expect(fetch).toHaveBeenCalledWith(
			'https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fproducts&page=2&per_page=50&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&_wcpos_envelope=1',
			expect.any(Object)
		);
	});

	it('emits an exact query-form push POST URL', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			useRestRouteParam: true,
			wpJsonRoot: 'https://store.example.test/wp-json/',
		});

		await fetcher('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=7', {
			method: 'POST',
		});

		expect(fetch).toHaveBeenCalledWith(
			'https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fpush%2Forders&cursor=7&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it.each([
		[true, 'test-token'],
		[false, 'Bearer test-token'],
		[undefined, 'Bearer test-token'],
	])('formats parameter auth when bareAuthParam is %s', async (bareAuthParam, authorization) => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			auth: { ...BASE_AUTH, useJwtAsParam: true, bareAuthParam },
		});

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		const requestedUrl = new URL(fetch.mock.calls[0][0]);
		expect(requestedUrl.searchParams.get('authorization')).toBe(authorization);
	});

	it.each([
		['orders', 'wcpos/v2/orders'],
		['products', 'wcpos/v2/products'],
		['variations', 'wcpos/v1/products/variations'],
		['customers', 'wcpos/v2/customers'],
		['taxRates', 'wcpos/v2/taxes'],
		['categories', 'wcpos/v2/products/categories'],
		['brands', 'wcpos/v2/products/brands'],
		['tags', 'wcpos/v2/products/tags'],
		['coupons', 'wcpos/v2/coupons'],
	])('fetches the %s census through its configured route', async (collection, route) => {
		const fetch = jest.fn().mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: { 'X-WP-Total': '17', 'content-length': '0' },
			})
		);
		const { fetchWooQueryTotal, recordTransport } = createFetcherHarness({
			fetch,
		});

		const total = await fetchWooQueryTotal({
			request: {
				queryKey: `census:${collection}`,
				method: 'GET',
				endpoint: collection,
				params: { ignored: 'value', page: 9, per_page: 50 },
				totalHeader: 'X-WP-Total',
			},
		});

		expect(total).toBe(17);
		expect(fetch).toHaveBeenCalledWith(
			`https://store.example.test/wp-json/${route}?ignored=value&page=1&per_page=1&wcpos=1&wcpos_protocol=2&wcpos_client=ios%2F0.0.0&_wcpos_envelope=1`,
			expect.objectContaining({ headers: expect.any(Headers) })
		);
		expect(recordTransport).toHaveBeenCalledTimes(1);
		fetch.mockReset();
	});

	it('never requests a response envelope for push routes', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=7', {
			method: 'POST',
		});

		expect(
			new URL(fetch.mock.calls[0]![0] as string).searchParams.get('_wcpos_envelope')
		).toBeNull();
	});

	it('stamps the native-variant product User-Agent on engine requests (B10)', async () => {
		// A blank or library UA on a POST earns a permanent AIOS IP ban; browsers
		// drop the forbidden header and keep their own, which is fine on web.
		const { AppInfo } =
			jest.requireActual<typeof import('@wcpos/utils/app-info')>('@wcpos/utils/app-info');
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products?page=1');

		const headers = new Headers(
			(fetch.mock.calls[0] as [string, RequestInit])[1].headers as HeadersInit
		);
		const expectedUserAgent = AppInfo.userAgentHeader['User-Agent'];
		expect(expectedUserAgent).toBeDefined();
		expect(headers.get('User-Agent')).toBe(expectedUserAgent);
		expect(expectedUserAgent).toMatch(/^WCPOS\//);
	});

	it('marks every request with the wcpos query var, pushes included', async () => {
		// The header marker dies on header-stripping proxies; the query-var twin
		// must ride pulls AND pushes or the marked surface answers rest_no_route.
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products?page=1');
		await fetcher('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=7', {
			method: 'POST',
		});

		expect(new URL(fetch.mock.calls[0]![0] as string).searchParams.get('wcpos')).toBe('1');
		expect(new URL(fetch.mock.calls[1]![0] as string).searchParams.get('wcpos')).toBe('1');
		expect(
			new URL(fetch.mock.calls[1]![0] as string).searchParams.get('_wcpos_envelope')
		).toBeNull();
	});

	it('sends protocol and client query signals on web without capability evidence', async () => {
		const { AppInfo } =
			jest.requireActual<typeof import('@wcpos/utils/app-info')>('@wcpos/utils/app-info');
		const originalPlatform = AppInfo.platform;
		AppInfo.platform = 'web';
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

		try {
			const path = createFetcherHarness({ fetch });
			const query = createFetcherHarness({ fetch, useRestRouteParam: true });

			await path.fetcher('https://store.example.test/wp-json/wcpos/v2/products');
			await query.fetcher('https://store.example.test/wp-json/wcpos/v2/products');

			for (const call of fetch.mock.calls) {
				const requestedUrl = new URL(call[0] as string);
				expect(requestedUrl.searchParams.get('wcpos_protocol')).toBe('2');
				expect(requestedUrl.searchParams.get('wcpos_client')).toBe(`web/${AppInfo.version}`);
			}
		} finally {
			AppInfo.platform = originalPlatform;
		}
	});

	it('sends protocol and client headers outside web', async () => {
		const { AppInfo } =
			jest.requireActual<typeof import('@wcpos/utils/app-info')>('@wcpos/utils/app-info');
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		const headers = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
		expect(headers.get('X-WCPOS-Protocol')).toBe('2');
		expect(headers.get('X-WCPOS-Client')).toBe(`${AppInfo.platform}/${AppInfo.version}`);
	});

	it('sends params and no headers on web without capability evidence', async () => {
		const { AppInfo } =
			jest.requireActual<typeof import('@wcpos/utils/app-info')>('@wcpos/utils/app-info');
		const originalPlatform = AppInfo.platform;
		AppInfo.platform = 'web';
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

		try {
			const { fetcher } = createFetcherHarness({ fetch });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

			const headers = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
			expect(headers.has('X-WCPOS-Protocol')).toBe(false);
			expect(headers.has('X-WCPOS-Client')).toBe(false);
			const url = new URL(fetch.mock.calls[0]?.[0] as string);
			expect(url.searchParams.get('wcpos_protocol')).toBe('2');
			expect(url.searchParams.get('wcpos_client')).toBe(`web/${AppInfo.version}`);
		} finally {
			AppInfo.platform = originalPlatform;
		}
	});

	it('sends headers and no params on web with capability evidence', async () => {
		const { AppInfo } =
			jest.requireActual<typeof import('@wcpos/utils/app-info')>('@wcpos/utils/app-info');
		const originalPlatform = AppInfo.platform;
		AppInfo.platform = 'web';
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

		try {
			const { fetcher } = createFetcherHarness({
				fetch,
				auth: { ...BASE_AUTH, useProtocolHeaders: true },
			});
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

			const headers = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
			expect(headers.get('X-WCPOS-Protocol')).toBe('2');
			expect(headers.get('X-WCPOS-Client')).toBe(`web/${AppInfo.version}`);
			const url = new URL(fetch.mock.calls[0]?.[0] as string);
			expect(url.searchParams.has('wcpos_protocol')).toBe(false);
			expect(url.searchParams.has('wcpos_client')).toBe(false);
		} finally {
			AppInfo.platform = originalPlatform;
		}
	});

	it('reports an unknown census collection as unsupported without making a request', async () => {
		const fetch = jest.fn().mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: { 'X-WP-Total': '17', 'content-length': '0' },
			})
		);
		const { fetchWooQueryTotal } = createFetcherHarness({ fetch });

		const total = await fetchWooQueryTotal({
			request: {
				queryKey: 'census:unknown',
				method: 'GET',
				endpoint: 'unknown',
				params: { page: 1, per_page: 1 },
				totalHeader: 'X-WP-Total',
			},
		});

		expect(total).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
		fetch.mockReset();
	});

	it('never requests a response envelope for plain-permalink push routes', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/?rest_route=%2Fwcpos%2Fv2%2Fpush%2Forders&cursor=7', {
			method: 'POST',
		});

		expect(
			new URL(fetch.mock.calls[0]![0] as string).searchParams.get('_wcpos_envelope')
		).toBeNull();
	});

	it('records server load from the body envelope when the header is stripped', async () => {
		const fetch = jest
			.fn()
			.mockResolvedValue(
				Response.json({ data: [], _wcpos: { v: 1, server_load: [0.7, 0.4, 0.2] } })
			);
		const { fetcher, recordServerLoad } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		expect(recordServerLoad).toHaveBeenCalledWith(0.7, 0);
	});

	it('reads a census total from the response body envelope when headers are stripped', async () => {
		const fetch = jest
			.fn()
			.mockResolvedValue(Response.json({ data: [], _wcpos: { v: 1, total: 17 } }));
		const { fetchWooQueryTotal } = createFetcherHarness({ fetch });

		await expect(
			fetchWooQueryTotal({
				request: {
					queryKey: 'census:orders',
					method: 'GET',
					endpoint: 'orders',
					params: {},
					totalHeader: 'X-WP-Total',
				},
			})
		).resolves.toBe(17);
	});

	it.each([null, '', '3.5', '-1', 'not-a-number'])(
		'rejects an invalid X-WP-Total value %p',
		async (header) => {
			const headers = new Headers();
			if (header !== null) headers.set('X-WP-Total', header);
			const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200, headers }));
			const { fetchWooQueryTotal } = createFetcherHarness({ fetch });

			await expect(
				fetchWooQueryTotal({
					request: {
						queryKey: 'census:orders',
						method: 'GET',
						endpoint: 'orders',
						params: {},
						totalHeader: 'X-WP-Total',
					},
				})
			).rejects.toThrow('Invalid X-WP-Total');
			fetch.mockReset();
		}
	);

	// pro#425: the sync lanes never used the legacy REST http client, so `store_id`
	// — the only store context the server ever received — was absent from every v2
	// request. Without it Pro cannot tell a store-scoped price edit from a global
	// one, and a till price edit silently rewrites the web-store price.
	describe('store scope header', () => {
		const okResponse = () =>
			new Response(null, { status: 200, headers: { 'content-length': '0' } });

		async function requestHeaders(scope: { storeId?: number | string | null }) {
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher } = createFetcherHarness({ fetch, scope });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/push/products', {
				method: 'POST',
			});
			return new Headers((fetch.mock.calls[0] as [string, RequestInit])[1].headers as HeadersInit);
		}

		it('sends the scoped store on every sync request', async () => {
			expect((await requestHeaders({ storeId: 7 })).get('X-WCPOS-Store')).toBe('7');
		});

		it('accepts a string store id without reformatting it', async () => {
			expect((await requestHeaders({ storeId: '7' })).get('X-WCPOS-Store')).toBe('7');
		});

		// Store 0 is the free plugin's "no store" sentinel — the SAME one
		// `use-new-order`/`utils.ts` test before stamping `_pos_store`. Sending it
		// would read server-side as a real scope; omitting it makes the server
		// treat the scope as unknown and refuse to overwrite a store-scoped price.
		it.each([
			['the single-store sentinel', 0],
			['the single-store sentinel as a string', '0'],
			['an absent store', undefined],
			['a null store', null],
			['a blank store', '   '],
			['a non-finite store', Number.NaN],
			['a negative store', -3],
		])('omits the header for %s', async (_label, storeId) => {
			expect((await requestHeaders({ storeId })).has('X-WCPOS-Store')).toBe(false);
		});

		// B6 (wcpos-infra#72): the scope also rides the URL as store_id, which a
		// header-stripping proxy cannot touch. The server honours the param only
		// when NO header arrived (free#1646), so header-wins is preserved.
		it('republishes the scope as a store_id query param beside the header', async () => {
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher } = createFetcherHarness({ fetch, scope: { storeId: 7 } });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products?page=1');
			expect(new URL(fetch.mock.calls[0]![0] as string).searchParams.get('store_id')).toBe('7');
		});

		it('sends no store_id param when the engine is unscoped', async () => {
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher } = createFetcherHarness({ fetch, scope: { storeId: 0 } });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products?page=1');
			expect(new URL(fetch.mock.calls[0]![0] as string).searchParams.has('store_id')).toBe(false);
		});

		it('strips a stale store_id from the caller URL when the engine is unscoped', async () => {
			// Mirror of the header delete: a store switch to unscoped must not let
			// a scope baked into a caller URL keep naming the outgoing store.
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher } = createFetcherHarness({ fetch, scope: { storeId: null } });
			await fetcher('https://store.example.test/wp-json/wcpos/v2/products?store_id=9&page=1');
			expect(new URL(fetch.mock.calls[0]![0] as string).searchParams.has('store_id')).toBe(false);
		});

		it('re-reads the scope per attempt so a store switch retargets in-flight lanes', async () => {
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher, scope } = createFetcherHarness({
				fetch,
				scope: { storeId: 7 },
			});

			await fetcher('https://store.example.test/wp-json/wcpos/v2/changes');
			scope.storeId = 11;
			await fetcher('https://store.example.test/wp-json/wcpos/v2/changes');

			const sent = fetch.mock.calls.map((call) =>
				new Headers((call as [string, RequestInit])[1].headers as HeadersInit).get('X-WCPOS-Store')
			);
			expect(sent).toEqual(['7', '11']);
		});

		it('sends the refreshed scope on a 401 retry, never the scope the 401 was issued under', async () => {
			const fetch = jest
				.fn()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: { 'content-length': '0' },
					})
				)
				.mockResolvedValueOnce(okResponse());
			const scope = { storeId: 7 as number | string | null };
			const { fetcher } = createFetcherHarness({
				fetch,
				scope,
				auth: {
					...BASE_AUTH,
					refreshAuth: async () => {
						// A store switch that lands mid-arc must own the retry.
						scope.storeId = 11;
						return 'fresh-token';
					},
				},
			});

			await fetcher('https://store.example.test/wp-json/wcpos/v2/push/products', {
				method: 'POST',
			});

			const sent = fetch.mock.calls.map((call) =>
				new Headers((call as [string, RequestInit])[1].headers as HeadersInit).get('X-WCPOS-Store')
			);
			expect(sent).toEqual(['7', '11']);
		});

		it('does not leak a store header from a caller-supplied init', async () => {
			const fetch = jest.fn().mockResolvedValue(okResponse());
			const { fetcher } = createFetcherHarness({
				fetch,
				scope: { storeId: 0 },
			});

			await fetcher('https://store.example.test/wp-json/wcpos/v2/changes', {
				headers: { 'X-WCPOS-Store': '99' },
			});

			expect(
				new Headers((fetch.mock.calls[0] as [string, RequestInit])[1].headers as HeadersInit).has(
					'X-WCPOS-Store'
				)
			).toBe(false);
		});
	});

	it('wires diagnostics, records response metrics, and keeps the body readable through hydration', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_025);
		const response = new Response('do not read', {
			status: 200,
			headers: {
				'content-length': '42',
				'X-Server-Load': '[0.5,0.3,0.2]',
			},
		});
		const fetch = jest.fn().mockResolvedValue(response);
		const { fetcher, emitTransport, appMetricsObserver, recordTransport, recordServerLoad } =
			createFetcherHarness({ fetch });

		const result = await fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		// Envelope hydration shape-detects the body, so the returned response is
		// a hydrated view of the original; the contract that matters is that the
		// body stays fully readable and metrics come from content-length alone.
		expect(await result.text()).toBe('do not read');
		expect(result.status).toBe(200);
		expect(emitTransport).toEqual(expect.any(Function));
		expect(appMetricsObserver).toHaveBeenCalledWith({
			type: 'transport.request',
			level: 'info',
			at: 1_025,
			fields: {
				durationMs: 25,
				bytes: 42,
				status: 200,
				method: 'GET',
				path: '/wp-json/wcpos/v2/products',
			},
		});
		expect(recordTransport).toHaveBeenCalledWith({
			atMs: 1_025,
			durationMs: 25,
			bytes: 42,
			failed: false,
			epoch: 0,
		});
		expect(recordServerLoad).toHaveBeenCalledWith(0.5, 0);
		now.mockRestore();
		fetch.mockReset();
	});

	it('logs server clock skew at most once per scope', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
		const fetch = jest.fn().mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: { Date: 'Thu, 01 Jan 1970 00:02:00 GMT' },
			})
		);
		const { fetcher, networkWarn } = createFetcherHarness({ fetch });

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');

		expect(networkWarn).toHaveBeenCalledTimes(1);
		expect(networkWarn).toHaveBeenCalledWith('Server clock is 120s ahead of the device clock', {
			context: {
				skewSeconds: 120,
				serverDate: '1970-01-01T00:02:00.000Z',
				deviceDate: '1970-01-01T00:00:00.000Z',
			},
		});
		now.mockRestore();
		fetch.mockReset();
	});

	it('does not let a late prior-site response suppress the new site warning', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
		let resolvePriorFetch!: (response: Response) => void;
		const priorFetch = new Promise<Response>((resolve) => {
			resolvePriorFetch = resolve;
		});
		const fetch = jest
			.fn()
			.mockReturnValueOnce(priorFetch)
			.mockResolvedValueOnce(
				new Response(null, {
					status: 200,
					headers: { Date: 'Thu, 01 Jan 1970 00:03:00 GMT' },
				})
			);
		const { fetcher: priorFetcher, networkWarn } = createFetcherHarness({
			fetch,
		});
		const priorRequest = priorFetcher('https://store.example.test/wp-json/wcpos/v2/products');

		const { fetcher: currentFetcher } = createFetcherHarness({ fetch });
		resolvePriorFetch(
			new Response(null, {
				status: 200,
				headers: { Date: 'Thu, 01 Jan 1970 00:02:00 GMT' },
			})
		);
		await priorRequest;
		await currentFetcher?.('https://other.example.test/wp-json/wcpos/v2/products');

		expect(networkWarn).toHaveBeenCalledWith(
			'Server clock is 180s ahead of the device clock',
			expect.any(Object)
		);
		now.mockRestore();
		fetch.mockReset();
	});

	it('does not let a late response from an earlier activation of the same scope suppress it', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(0);
		let resolvePriorFetch!: (response: Response) => void;
		const priorFetch = new Promise<Response>((resolve) => {
			resolvePriorFetch = resolve;
		});
		const fetch = jest
			.fn()
			.mockReturnValueOnce(priorFetch)
			.mockResolvedValueOnce(
				new Response(null, {
					status: 200,
					headers: { Date: 'Thu, 01 Jan 1970 00:03:00 GMT' },
				})
			);
		const clockSkew = { generation: 0, evaluated: false };
		const { fetcher, networkWarn } = createFetcherHarness({ fetch, clockSkew });
		const priorRequest = fetcher('https://store.example.test/wp-json/wcpos/v2/products');

		clockSkew.generation += 2;
		clockSkew.evaluated = false;
		resolvePriorFetch(
			new Response(null, {
				status: 200,
				headers: { Date: 'Thu, 01 Jan 1970 00:02:00 GMT' },
			})
		);
		await priorRequest;
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/orders');

		expect(networkWarn).toHaveBeenCalledWith(
			'Server clock is 180s ahead of the device clock',
			expect.any(Object)
		);
		now.mockRestore();
		fetch.mockReset();
	});

	it('classifies a conditional-GET 304 as a successful transport outcome', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValueOnce(2_000).mockReturnValueOnce(2_010);
		const response = new Response(null, {
			status: 304,
			headers: { etag: '"20:aa"' },
		});
		const fetch = jest.fn().mockResolvedValue(response);
		const { fetcher, appMetricsObserver, recordTransport } = createFetcherHarness({ fetch });

		await fetcher('https://store.example.test/wp-json/wcpos/v2/changes/sequence-log');

		// Response.ok is false for 304, but an idle conditional poll answering
		// Not Modified every tick must not be counted or logged as a failure.
		expect(appMetricsObserver).toHaveBeenCalledWith({
			type: 'transport.request',
			level: 'info',
			at: 2_010,
			fields: {
				durationMs: 10,
				bytes: 0,
				status: 304,
				method: 'GET',
				path: '/wp-json/wcpos/v2/changes/sequence-log',
			},
		});
		expect(recordTransport).toHaveBeenCalledWith({
			atMs: 2_010,
			durationMs: 10,
			bytes: 0,
			failed: false,
			epoch: 0,
		});
		now.mockRestore();
		fetch.mockReset();
	});

	it('returns the response even when a telemetry sink throws', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({ fetch });
		appMetricsObserver.mockImplementation(() => {
			throw new TypeError('observer exploded');
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(200);
		expect(appMetricsObserver).toHaveBeenCalled();
		fetch.mockReset();
	});

	it('records a network error and rethrows it', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValueOnce(2_000).mockReturnValueOnce(2_040);
		const networkError = new Error(
			'network down for https://store.example.test/wp-json/wcpos/v2/products?authorization=secret'
		);
		const fetch = jest.fn().mockRejectedValue(networkError);
		const { fetcher, appMetricsObserver, recordTransport, networkWarn } = createFetcherHarness({
			fetch,
		});

		await expect(fetcher?.('https://store.example.test/wp-json/wcpos/v2/products')).rejects.toBe(
			networkError
		);

		expect(appMetricsObserver).toHaveBeenCalledWith({
			type: 'transport.request',
			level: 'warn',
			fields: {
				durationMs: 40,
				bytes: 0,
				status: 0,
				method: 'GET',
				path: '/wp-json/wcpos/v2/products',
			},
		});
		expect(recordTransport).toHaveBeenCalledWith({
			atMs: 2_040,
			durationMs: 40,
			bytes: 0,
			failed: true,
			epoch: 0,
		});
		// The legacy networkLogger row is gone: the transport event now flows through
		// the guarded log observer, so the failure lands as a wide terminal row with
		// an outcome instead of a bare context blob (one writer per semantic event).
		expect(networkWarn).toHaveBeenCalledWith('transport.request', {
			context: expect.objectContaining({
				type: 'transport.request',
				method: 'GET',
				path: '/wp-json/wcpos/v2/products',
				status: 0,
			}),
			terminal: expect.objectContaining({
				operationType: 'sync.http',
				outcome: 'failed',
			}),
		});
		now.mockRestore();
		fetch.mockReset();
	});

	it('does not persist expected sync aborts as errors', async () => {
		const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
		const fetch = jest.fn().mockRejectedValue(abort);
		const { fetcher, appMetricsObserver, recordTransport, networkWarn } = createFetcherHarness({
			fetch,
		});

		await expect(fetcher('https://store.example.test/wp-json/wcpos/v2/products')).rejects.toBe(
			abort
		);
		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'transport.request',
				level: 'warn',
				fields: expect.objectContaining({ status: 0 }),
			})
		);
		// The hour's failure count follows the log's verdict: this row is not
		// persisted BECAUSE an abort is our own cancellation, so counting it as a
		// transport failure would turn the uptime strip amber for an hour whose
		// log holds nothing to explain it.
		expect(recordTransport).toHaveBeenCalledWith(expect.objectContaining({ failed: false }));
		expect(networkWarn).not.toHaveBeenCalled();
		fetch.mockReset();
	});

	it('normalizes an iOS native cancellation for an aborted request', async () => {
		const controller = new AbortController();
		const cancellation = new Error(
			'fetch failed: UnexpectedException: cancelled (at ExpoModulesCore/Promise.swift:56)'
		);
		const fetch = jest.fn().mockRejectedValue(cancellation);
		const { fetcher, recordTransport, networkWarn } = createFetcherHarness({ fetch });
		controller.abort();

		await expect(
			fetcher('https://store.example.test/wp-json/wcpos/v2/products', {
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(recordTransport).toHaveBeenCalledWith(expect.objectContaining({ failed: false }));
		expect(networkWarn).not.toHaveBeenCalled();
	});

	it('does not persist a row for a successful request, and never logs query credentials', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { fetcher, networkInfo, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { ...BASE_AUTH, useJwtAsParam: true },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/push/orders?cursor=secret', {
			method: 'POST',
		});

		// A succeeded HTTP attempt is deliberately NOT a durable row: the engine
		// issues them continuously and they would evict the rest of the log inside
		// the retention cap. Successful record pushes are covered by push.outcome.
		expect(networkInfo).not.toHaveBeenCalled();
		// It still reaches the metrics path, and only ever as a bare pathname —
		// the query string carries the credential.
		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'transport.request',
				fields: expect.objectContaining({
					method: 'POST',
					path: '/wp-json/wcpos/v2/push/orders',
					status: 200,
				}),
			})
		);
		expect(JSON.stringify(appMetricsObserver.mock.calls)).not.toContain('secret');
		fetch.mockReset();
	});

	it.each(['not-json', '{"load":0.5}', '["0.5"]'])(
		'ignores malformed server load %s',
		async (load) => {
			const fetch = jest.fn().mockResolvedValue(
				new Response(null, {
					status: 200,
					headers: { 'X-Server-Load': load },
				})
			);
			const { fetcher, recordServerLoad } = createFetcherHarness({ fetch });

			await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

			expect(recordServerLoad).not.toHaveBeenCalled();
			fetch.mockReset();
		}
	);

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
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { fetcher, appMetricsObserver, networkError } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(200);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		// The arc id minted for the absorbed 401 is handed to the refresh layer so
		// its "Session renewed" breadcrumb chains to these rows (#899).
		expect(refreshAuth).toHaveBeenCalledWith({
			operationId: expect.any(String),
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(networkError).not.toHaveBeenCalled();
		// #899: the level reflects the SETTLED outcome. A 401 the refresh absorbed
		// is forensic (debug + outcome 'recovered'), not a warn — and both attempts
		// share the arc's operationId.
		const arcCalls = refreshAuth.mock.calls as unknown as {
			operationId?: string;
		}[][];
		const arcId = arcCalls[0]?.[0]?.operationId;
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				type: 'transport.request',
				level: 'debug',
				fields: expect.objectContaining({
					status: 401,
					outcome: 'recovered',
					operationId: arcId,
				}),
			})
		);
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				type: 'transport.request',
				level: 'debug',
				fields: expect.objectContaining({ status: 200, operationId: arcId }),
			})
		);
		const firstHeaders = fetch.mock.calls[0]?.[1]?.headers as Headers;
		const retryHeaders = fetch.mock.calls[1]?.[1]?.headers as Headers;
		expect(firstHeaders.get('Authorization')).toBe('Bearer expired-token');
		expect(retryHeaders.get('Authorization')).toBe('Bearer refreshed-token');
		fetch.mockReset();
	});

	// THE INVARIANT BEHIND THE METRIC (#1547). `settle` writes the transport row
	// and stamps the hourly bucket in one call, so the bucket is only right if
	// every attempt settles EXACTLY once: a second call double-counts the
	// request, a missing one loses it. That used to be asserted by a comment
	// saying "called exactly once on every path below" — which is a promise, not
	// a check, and the arc has seven endings. One request per fetch, on each of
	// them, is the check.
	describe('every arc ending settles each attempt exactly once', () => {
		const arcs: {
			name: string;
			fetches: (Response | Error)[];
			refresh?: () => Promise<string | null>;
			throws?: boolean;
		}[] = [
			{ name: 'a 2xx that never enters the arc', fetches: [new Response(null, { status: 200 })] },
			{ name: 'a 500 that never enters the arc', fetches: [new Response(null, { status: 500 })] },
			{
				name: 'a refresh that fails hard',
				fetches: [new Response(null, { status: 401 })],
				refresh: () => Promise.reject(new Error('refresh exploded')),
				throws: true,
			},
			{
				name: 'a refresh that yields no token',
				fetches: [new Response(null, { status: 401 })],
				refresh: () => Promise.resolve(null),
			},
			{
				name: 'a retry that never settles',
				fetches: [new Response(null, { status: 401 }), new Error('network down')],
				throws: true,
			},
			{
				name: 'a retry that succeeds',
				fetches: [new Response(null, { status: 401 }), new Response(null, { status: 200 })],
			},
			{
				name: 'a retry still unauthorized',
				fetches: [new Response(null, { status: 401 }), new Response(null, { status: 401 })],
			},
			{
				name: 'a retry that hits a different failure',
				fetches: [new Response(null, { status: 401 }), new Response(null, { status: 503 })],
			},
		];

		for (const arc of arcs) {
			it(`settles once per attempt for ${arc.name}`, async () => {
				const fetch = jest.fn();
				for (const outcome of arc.fetches) {
					if (outcome instanceof Error) fetch.mockRejectedValueOnce(outcome);
					else fetch.mockResolvedValueOnce(outcome);
				}
				const { fetcher, recordTransport } = createFetcherHarness({
					fetch,
					auth: {
						credentials: { getLatest: jest.fn(() => ({ access_token: 'token' })) },
						refreshAuth: arc.refresh ?? (() => Promise.resolve('refreshed-token')),
					},
				});

				const call = fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
				if (arc.throws) await expect(call).rejects.toThrow();
				else await call;

				expect(fetch).toHaveBeenCalledTimes(arc.fetches.length);
				expect(recordTransport).toHaveBeenCalledTimes(arc.fetches.length);
				fetch.mockReset();
			});
		}
	});

	it('counts no hourly failure for a 401 the refresh arc absorbed', async () => {
		// THE PHANTOM (#1547): the log row for an absorbed 401 is debug/'recovered'
		// and is not even persisted unless verbose diagnostics is on, but the hourly
		// bucket used to count that same attempt as a failure the moment it landed —
		// so a healthy token-renewal cycle painted the uptime strip amber for an hour
		// whose log showed zero errors and zero warns.
		let accessToken = 'expired-token';
		const credentials = { getLatest: jest.fn(() => ({ access_token: accessToken })) };
		const refreshAuth = jest.fn(async () => {
			accessToken = 'refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { fetcher, recordTransport } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		// Both attempts still count as requests the till made — only the failure
		// tally follows the settled verdict.
		expect(recordTransport).toHaveBeenCalledTimes(2);
		expect(recordTransport).not.toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
		fetch.mockReset();
	});

	it('counts exactly one hourly failure when the retry is still unauthorized', async () => {
		let accessToken = 'expired-token';
		const credentials = { getLatest: jest.fn(() => ({ access_token: accessToken })) };
		const refreshAuth = jest.fn(async () => {
			accessToken = 'refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 401 }));
		const { fetcher, recordTransport } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		// One arc, one fault: the absorbed 401 stays forensic (debug) and the
		// error row the merchant reads is the retry's.
		const failures = recordTransport.mock.calls.filter(
			(call: unknown[]) => (call[0] as { failed: boolean }).failed
		);
		expect(recordTransport).toHaveBeenCalledTimes(2);
		expect(failures).toHaveLength(1);
		fetch.mockReset();
	});

	it('counts no hourly failure for a tick-probe 404 the change signal falls back from', async () => {
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 404 }));
		const { fetcher, recordTransport } = createFetcherHarness({ fetch });

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');

		// A designed self-healing downgrade settles as debug/'recovered'; an hour
		// of them must not read as an hour of faults.
		expect(recordTransport).toHaveBeenCalledWith(expect.objectContaining({ failed: false }));
		fetch.mockReset();
	});

	it('settles a 401 that persists after refresh as an error row (#899 exhaustion)', async () => {
		let accessToken = 'expired-token';
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: accessToken })),
		};
		const refreshAuth = jest.fn(async () => {
			accessToken = 'refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 401 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(401);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				type: 'transport.request',
				level: 'debug',
				fields: expect.objectContaining({ status: 401, outcome: 'failed' }),
			})
		);
		expect(appMetricsObserver).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				type: 'transport.request',
				level: 'error',
				fields: expect.objectContaining({ status: 401 }),
			})
		);
		fetch.mockReset();
	});

	it('settles a 401 whose refresh yields no token as a warn row, not an error', async () => {
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: 'expired-token' })),
		};
		const refreshAuth = jest.fn().mockResolvedValue(null);
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		// The refresh layer logs its own verdict (error when terminal); the request
		// row records the failure without double-escalating.
		expect(response?.status).toBe(401);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(appMetricsObserver).toHaveBeenCalledTimes(2);
		for (const [event] of appMetricsObserver.mock.calls) {
			expect(event).toEqual(
				expect.objectContaining({
					type: 'transport.request',
					level: 'warn',
					fields: expect.objectContaining({ status: 401, outcome: 'failed' }),
				})
			);
			expect(event.fields).not.toHaveProperty('operationId');
		}
		fetch.mockReset();
	});

	it('keeps the completion timestamp on a 401 attempt whose event is deferred', async () => {
		jest.useFakeTimers().setSystemTime(1_000);
		let accessToken = 'expired-token';
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: accessToken })),
		};
		const refreshAuth = jest.fn(async () => {
			jest.setSystemTime(5_000);
			accessToken = 'refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));

		try {
			const { fetcher, appMetricsObserver } = createFetcherHarness({
				fetch,
				auth: { credentials, refreshAuth },
			});

			await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

			expect(appMetricsObserver).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					type: 'transport.request',
					at: 1_000,
					fields: expect.objectContaining({ status: 401 }),
				})
			);
		} finally {
			fetch.mockReset();
			jest.useRealTimers();
		}
	});

	it('classifies a 403 as error without ever refreshing (row-14 rule + #899 rubric)', async () => {
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: 'token' })),
		};
		const refreshAuth = jest.fn();
		const fetch = jest.fn().mockResolvedValueOnce(new Response(null, { status: 403 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(403);
		expect(refreshAuth).not.toHaveBeenCalled();
		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'transport.request',
				level: 'error',
				fields: expect.objectContaining({ status: 403 }),
			})
		);
		fetch.mockReset();
	});

	it('reports a 403 at error once per path and at info after that (#1876)', async () => {
		// Sentry AUTH201: a cashier without customer read permission produced one
		// error row per 10 s tick, 242 events on 11 installs. The permission is a
		// property of the session, so the second 403 on the same path is info.
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: 'token' })),
		};
		const fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(new Response(null, { status: 403 }));
		// The auth object is shared by reference and a same-site cashier swap
		// replaces `credentials` on it in place (create-app-engine).
		const auth = { credentials, refreshAuth: jest.fn() };
		const { fetcher, appMetricsObserver } = createFetcherHarness({ fetch, auth });

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/customers?page=1');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/customers?page=2');
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');
		auth.credentials = { getLatest: jest.fn(() => ({ access_token: 'other-cashier' })) };
		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/customers?page=3');

		const rows = appMetricsObserver.mock.calls
			.map(([event]) => event)
			.filter((event) => event.type === 'transport.request' && event.fields?.status === 403);
		expect(rows.map((event) => event.level)).toEqual(['error', 'info', 'error', 'error']);
		expect(rows[1].fields).toEqual(expect.objectContaining({ outcome: 'forbidden-repeat' }));
		expect(rows[0].fields).not.toEqual(expect.objectContaining({ outcome: 'forbidden-repeat' }));
		expect(rows[3].fields).not.toEqual(expect.objectContaining({ outcome: 'forbidden-repeat' }));
		fetch.mockReset();
	});

	it('classifies the tick-probe 404 as a recovered debug row (designed fallback)', async () => {
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: 'token' })),
		};
		const fetch = jest.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { credentials },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/changes/tick');

		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'transport.request',
				level: 'debug',
				fields: expect.objectContaining({ status: 404, outcome: 'recovered' }),
			})
		);
		fetch.mockReset();
	});

	it('keeps a non-tick 404 at warn', async () => {
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: 'token' })),
		};
		const fetch = jest.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));
		const { fetcher, appMetricsObserver } = createFetcherHarness({
			fetch,
			auth: { credentials },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(appMetricsObserver).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'transport.request',
				level: 'warn',
				fields: expect.objectContaining({ status: 404 }),
			})
		);
		fetch.mockReset();
	});

	it('retries with a peer-refreshed token instead of refreshing again on staggered 401s', async () => {
		let accessToken = 'stale-token';
		const credentials = {
			getLatest: jest.fn(() => ({ access_token: accessToken })),
		};
		const refreshAuth = jest.fn(async () => {
			accessToken = 'self-refreshed-token';
			return accessToken;
		});
		const fetch = jest
			.fn()
			.mockImplementationOnce(async () => {
				// A concurrent request refreshes the JWT while this one is in flight.
				accessToken = 'peer-refreshed-token';
				return new Response(null, { status: 401 });
			})
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			auth: { credentials, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(200);
		expect(refreshAuth).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(2);
		const retryHeaders = fetch.mock.calls[1]?.[1]?.headers as Headers;
		expect(retryHeaders.get('Authorization')).toBe('Bearer peer-refreshed-token');
		fetch.mockReset();
	});

	it('returns the original 401 when refresh fails without retrying', async () => {
		const originalUnauthorized = new Response(null, { status: 401 });
		const refreshAuth = jest.fn().mockResolvedValue(null);
		const fetch = jest.fn().mockResolvedValue(originalUnauthorized);
		const { fetcher, networkWarn } = createFetcherHarness({
			fetch,
			auth: { ...BASE_AUTH, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(originalUnauthorized.status);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(1);
		// The unauthorized attempt is a failed unit of work and gets a terminal row.
		expect(networkWarn).toHaveBeenCalledWith('transport.request', {
			context: expect.objectContaining({
				type: 'transport.request',
				status: 401,
			}),
			terminal: expect.objectContaining({
				operationType: 'sync.http',
				outcome: 'failed',
			}),
		});
		fetch.mockReset();
	});

	it('does not refresh or loop when the retried request is still unauthorized', async () => {
		const refreshAuth = jest.fn().mockResolvedValue('refreshed-token');
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			auth: { ...BASE_AUTH, refreshAuth },
		});

		const response = await fetcher?.('https://store.example.test/wp-json/wcpos/v2/products');

		expect(response?.status).toBe(401);
		expect(refreshAuth).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		fetch.mockReset();
	});

	it('never refreshes a request to the refresh endpoint', async () => {
		const refreshAuth = jest.fn().mockResolvedValue('refreshed-token');
		const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));
		const { fetcher } = createFetcherHarness({
			fetch,
			auth: { ...BASE_AUTH, refreshAuth },
		});

		await fetcher?.('https://store.example.test/wp-json/wcpos/v2/auth/refresh');

		expect(refreshAuth).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(1);
		fetch.mockReset();
	});
});
