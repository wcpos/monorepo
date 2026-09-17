import {
	buildClientHeaders,
	buildRequestPreamble,
	type RequestPreambleContext,
} from './request-preamble';

const url = 'https://shop.test/blog/wp-json/wcpos/v2/orders/42';
const context: RequestPreambleContext = {
	purpose: 'sync',
	client: { platform: 'web', version: 'test', userAgentHeader: {} },
	accessToken: 'token',
};
const prepare = (overrides: Partial<RequestPreambleContext> = {}, request = { url }) =>
	buildRequestPreamble({ ...context, ...overrides }, request);

it.each([
	['web without capability sends protocol twins only', 'web', undefined, false, true],
	['capable web sends protocol headers only', 'web', true, true, false],
	['native retains both protocol channels', 'ios', false, true, true],
	['electron retains both protocol channels', 'electron', true, true, true],
] as const)('%s', (_name, platform, capability, headers, params) => {
	const result = prepare({
		client: { ...context.client, platform },
		site: { use_protocol_headers: capability },
	});
	expect(result.headers.get('X-WCPOS-Protocol')).toBe(headers ? '2' : null);
	expect(result.headers.get('X-WCPOS-Client')).toBe(headers ? `${platform}/test` : null);
	expect(new URL(result.url).searchParams.get('wcpos_protocol')).toBe(params ? '2' : null);
	expect(new URL(result.url).searchParams.get('wcpos_client')).toBe(
		params ? `${platform}/test` : null
	);
});

it.each(['sync', 'rest', 'cashier'] as const)(
	'purpose %s preserves each marker-channel contract',
	(purpose) => {
		const result = prepare({ purpose });
		expect(result.headers.get('X-WCPOS')).toBe('1');
		expect(new URL(result.url).searchParams.get('wcpos')).toBe(
			purpose === 'sync' || purpose === 'cashier' ? '1' : null
		);
	}
);

it('web does not author a product User-Agent', () => {
	expect(prepare().headers.has('User-Agent')).toBe(false);
});
it('normal native requests use the supplied product User-Agent', () => {
	const result = prepare({
		client: { ...context.client, platform: 'ios', userAgentHeader: { 'User-Agent': 'WCPOS/test' } },
	});
	expect(result.headers.get('User-Agent')).toBe('WCPOS/test');
});

it.each([{ method: 'HEAD' }, { wcposHeaders: false }])(
	'HEAD and header opt-out preserve existing suppression: %p',
	(flags) => {
		const result = buildRequestPreamble({ ...context, purpose: 'rest' }, { url, ...flags });
		expect(result.headers.has('X-WCPOS')).toBe(false);
		expect(result.headers.get('Authorization')).toBe('Bearer token');
		expect(new URL(result.url).searchParams.get('wcpos_protocol')).toBe('2');
	}
);

it('header authentication uses the supplied token', () => {
	expect(prepare().headers.get('Authorization')).toBe('Bearer token');
});
it.each([
	{ purpose: 'sync', accessToken: undefined },
	{ purpose: 'rest', accessToken: undefined },
	{ purpose: 'cashier', accessToken: undefined },
] as const)('authors no credential without a token for $purpose', (overrides) => {
	const header = prepare(overrides);
	expect(header.headers.get('Authorization')).toBeNull();
	const query = prepare({ ...overrides, site: { use_jwt_as_param: true }, bareAuthParam: true });
	expect(new URL(query.url).searchParams.get('authorization')).toBeNull();
});
it.each([
	[undefined, undefined, 'Bearer token'],
	[false, '1.10.0', 'Bearer token'],
	[true, undefined, 'token'],
	[undefined, '1.9.17', 'Bearer token'],
	[undefined, '1.10.0', 'token'],
])(
	'query authentication preserves legacy and bare formats (%s, %s)',
	(bareAuthParam, version, expected) => {
		const result = prepare({
			bareAuthParam,
			site: { use_jwt_as_param: true, wcpos_version: version },
		});
		expect(new URL(result.url).searchParams.get('authorization')).toBe(expected);
		expect(result.headers.has('Authorization')).toBe(false);
	}
);

it.each([
	[7, '7'],
	[' 7 ', '7'],
	['-3', '-3'],
	[0, null],
	['0', null],
	[undefined, null],
	[null, null],
	['   ', null],
	[NaN, null],
	[Infinity, null],
	[-3, null],
])('engine scope preserves numeric and string normalization: %p', (storeId, expected) => {
	const result = prepare({ storeId });
	expect(result.headers.get('X-WCPOS-Store')).toBe(expected);
	expect(new URL(result.url).searchParams.get('store_id')).toBe(expected);
});
it('unscoped engine removes stale header and parameter scope', () => {
	const result = buildRequestPreamble(context, {
		url: `${url}?store_id=9`,
		headers: { 'X-WCPOS-Store': '9' },
	});
	expect(result.headers.has('X-WCPOS-Store')).toBe(false);
	expect(new URL(result.url).searchParams.has('store_id')).toBe(false);
});
it.each([
	[0, null],
	['0', '0'],
	[-3, '-3'],
	[7, '7'],
] as const)('REST scope preserves numeric-zero exclusion: %p', (storeId, expected) => {
	const result = prepare({ purpose: 'rest', storeId });
	expect(new URL(result.url).searchParams.get('store_id')).toBe(expected);
	expect(result.headers.has('X-WCPOS-Store')).toBe(false);
});
it.each(['rest', 'cashier'] as const)(
	'%s preserves caller and existing retry credentials',
	(purpose) => {
		const result = buildRequestPreamble(
			{ ...context, purpose, storeId: 7, site: { use_jwt_as_param: true } },
			{
				url: `${url}?authorization=fresh&store_id=8&wcpos_protocol=9`,
				headers: { Authorization: 'Bearer opposite' },
			}
		);
		expect(new URL(result.url).searchParams.get('authorization')).toBe('fresh');
		expect(new URL(result.url).searchParams.get('store_id')).toBe('8');
		expect(result.headers.get('Authorization')).toBe('Bearer opposite');
		const header = buildRequestPreamble(
			{ ...context, purpose },
			{ url, headers: { Authorization: 'Bearer fresh' } }
		);
		expect(header.headers.get('Authorization')).toBe('Bearer fresh');
	}
);
it('query transport preserves subdirectory root and caller parameters', () => {
	const result = prepare(
		{ site: { wp_api_url: 'https://shop.test/blog/?rest_route=/' } },
		{ url: `${url}?page=2&_method=PUT` }
	);
	expect(new URL(result.url).pathname).toBe('/blog/');
	expect(new URL(result.url).searchParams.get('rest_route')).toBe('/wcpos/v2/orders/42');
	expect(new URL(result.url).searchParams.get('page')).toBe('2');
	expect(new URL(result.url).searchParams.get('_method')).toBe('PUT');
});
it('already-query transport is not rewritten twice', () => {
	const result = prepare(
		{ site: { wp_api_url: 'https://shop.test/blog/?rest_route=/' } },
		{ url: 'https://shop.test/blog/?rest_route=/wcpos/v2/orders/42' }
	);
	expect(new URL(result.url).searchParams.getAll('rest_route')).toEqual(['/wcpos/v2/orders/42']);
});
it('unrelated headers and parameters survive and input objects are unchanged', () => {
	const request = {
		url: `${url}?tag=a&tag=b`,
		headers: { 'Idempotency-Key': 'key', 'If-Match': 'etag' },
	};
	const before = JSON.stringify({ context, request });
	const result = buildRequestPreamble(context, request);
	expect(result.headers.get('Idempotency-Key')).toBe('key');
	expect(result.headers.get('If-Match')).toBe('etag');
	expect(new URL(result.url).searchParams.getAll('tag')).toEqual(['a', 'b']);
	expect(JSON.stringify({ context, request })).toBe(before);
});
it('header-only requests do not author authentication', () => {
	const headers = buildClientHeaders(context.client, {}, { url: '/image?raw=%20' });
	expect(headers.has('Authorization')).toBe(false);
});

it('REST preserves a caller credential without a context token', () => {
	const result = buildRequestPreamble(
		{ ...context, purpose: 'rest', accessToken: undefined },
		{ url, headers: { Authorization: 'Bearer fresh' } }
	);
	expect(result.headers.get('Authorization')).toBe('Bearer fresh');
});

it('refresh authors no access-token authentication or scope even with context credentials', () => {
	const result = prepare({ purpose: 'refresh', storeId: 9 });
	expect(result.headers.has('Authorization')).toBe(false);
	expect(result.headers.has('X-WCPOS-Store')).toBe(false);
	for (const param of ['authorization', 'store_id', 'wcpos']) {
		expect(new URL(result.url).searchParams.has(param)).toBe(false);
	}
});
it.each(['probe-header', 'probe-param', 'probe-echo', 'probe-cache', 'probe-bare'] as const)(
	'%s ignores site transport and protocol capability and never authors a product UA',
	(purpose) => {
		const result = prepare({
			purpose,
			client: {
				...context.client,
				platform: 'android',
				userAgentHeader: { 'User-Agent': 'WCPOS/test' },
			},
			site: {
				use_rest_route_param: true,
				use_protocol_headers: true,
				wp_api_url: 'https://shop.test/blog/wp-json/',
			},
		});
		expect(new URL(result.url).pathname).toBe(new URL(url).pathname);
		for (const header of ['X-WCPOS-Protocol', 'X-WCPOS-Client', 'User-Agent']) {
			expect(result.headers.has(header)).toBe(false);
		}
		for (const param of ['wcpos_protocol', 'wcpos_client', 'rest_route']) {
			expect(new URL(result.url).searchParams.has(param)).toBe(false);
		}
	}
);

it.each([
	[
		'query auth drops the stale header',
		{ use_jwt_as_param: true, wcpos_version: '1.10.0' },
		'new',
		null,
	],
	['header auth drops the stale query token', { use_jwt_as_param: false }, null, 'Bearer new'],
])('a refreshed retry replaces the other channel too (%s)', (_name, site, param, header) => {
	// The server reads the header first: a stale header beside a fresh query token 401s the
	// retry; the reverse leaves a stale token in URL logs (CodeRabbit on #2132).
	const result = buildRequestPreamble(
		{ ...context, purpose: 'rest', site, accessToken: 'old', refreshedAccessToken: 'new' },
		{ url: `${url}?authorization=old`, headers: { Authorization: 'Bearer old' } }
	);
	expect(new URL(result.url).searchParams.get('authorization')).toBe(param);
	expect(result.headers.get('Authorization')).toBe(header);
});

it('the echo probe keeps both channels on a refreshed token', () => {
	const result = prepare(
		{ purpose: 'probe-echo', accessToken: 'old', refreshedAccessToken: 'abc.def' },
		{ url }
	);
	expect(new URL(result.url).searchParams.get('authorization')).toBe('Bearer xxx.xxx');
	expect(result.headers.get('Authorization')).toBe('Bearer abc.def');
});
