import { expect, test } from './test';
import {
	findVariableProduct,
	isolatedProductTest,
	isolatedVariableProductTest,
	tryAddRunPrivateSimpleProduct,
} from './checkout-probe';
import { probeVariationSearch } from './cold-start';
import {
	authorizationCandidates,
	resolveProbeAuthorization,
	resolveProbeOptions,
} from './probe-credential';
import {
	createRunPrivateProduct,
	createSearchProbe,
	deleteSearchProbe,
	findCreatedProductRecord,
	plainPermalinkUrl,
	productProbeFailureAction,
	productWriterAuthorization,
	productWriterCredentialsDecision,
	searchAndWaitForServer,
	sweepOrphanedProductProbes,
} from './search-probe';

import type { APIRequestContext } from '@playwright/test';
import type { StoreAuthorization } from './probe-credential';

function response(status: number, body: unknown) {
	return {
		ok: () => status >= 200 && status < 300,
		status: () => status,
		json: async () => body,
	};
}

test('builds canonical rest_route URLs for plain WordPress permalinks', () => {
	expect(plainPermalinkUrl('https://example.test/shop/', 'products')).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/products'
	);
	expect(plainPermalinkUrl('https://example.test/shop/', 'customers', 42)).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/customers/42'
	);
});

test('tries the captured authorization transport first, then the alternates', () => {
	expect(authorizationCandidates({ transport: 'header', value: 'Bearer jwt.token' })).toEqual([
		{ transport: 'header', value: 'Bearer jwt.token' },
		{ transport: 'query', value: 'Bearer jwt.token' },
		{ transport: 'query', value: 'jwt.token' },
	]);
});

test('starts from a captured QUERY credential and still offers the header form', () => {
	// The captured form leads even though it is not the ladder's usual first rung —
	// it is the one transport already demonstrated to reach this store.
	expect(authorizationCandidates({ transport: 'query', value: 'jwt.token' })).toEqual([
		{ transport: 'query', value: 'jwt.token' },
		{ transport: 'header', value: 'Bearer jwt.token' },
		{ transport: 'query', value: 'Bearer jwt.token' },
	]);
});

test('offers no candidate when the app was never seen authenticating', () => {
	// An empty ladder makes the caller throw rather than probe anonymously, which
	// would report every store as broken.
	expect(authorizationCandidates(null)).toEqual([]);
});

/**
 * A store that only honours one credential, and records what it was asked with — which
 * URL, which credential, which params. The resolver must find the good one by evidence
 * alone: it never inspects a token, because credentials here are opaque.
 *
 * A live re-run cannot verify any of this. `globalSetup` re-authenticates before the
 * suite, so the captured credential is fresh and the spec goes green whether or not the
 * ladder is wired in at all. A fake store honouring exactly ONE credential is the only
 * harness that can show the dead one was tried and the live one won.
 */
function fakeStore(accepts: string) {
	const asked: string[] = [];
	const urls: string[] = [];
	const params: Record<string, string>[] = [];
	const timeouts: (number | undefined)[] = [];
	type SentOptions = {
		headers?: Record<string, string>;
		params?: Record<string, string>;
		timeout?: number;
	};
	const record = (url: string, options: SentOptions) => {
		const offered = options.params?.authorization ?? options.headers?.Authorization ?? '';
		asked.push(offered);
		urls.push(url);
		params.push(options.params ?? {});
		timeouts.push(options.timeout);
		return offered === accepts;
	};
	const context = {
		get: async (url: string, options: SentOptions) =>
			response(record(url, options) ? 200 : 401, []),
		post: async (url: string, options: SentOptions) =>
			response(record(url, options) ? 201 : 401, { id: 7, slug: 'e2e-probe' }),
	} as unknown as APIRequestContext;
	return { context, asked, urls, params, timeouts };
}

test('re-reads the app credential until one actually authenticates', async () => {
	// The captured credential starts STALE — the shape a restored, day-old auth state
	// produces, where the app replays an expired token before refreshing on the 401.
	let captured: StoreAuthorization = { transport: 'query', value: 'expired-jwt' };
	const store = fakeStore('refreshed-jwt');
	setTimeout(() => {
		captured = { transport: 'query', value: 'refreshed-jwt' };
	}, 50);

	const options = await resolveProbeOptions(store.context, 'https://example.test', () => captured, {
		timeoutMs: 8_000,
	});

	expect(options.params.authorization).toBe('refreshed-jwt');
	// It really did try the dead one first — otherwise this test would pass on a
	// resolver that ignored the getter entirely.
	expect(store.asked).toContain('expired-jwt');
});

test('gives up with the statuses it saw when no credential ever authenticates', async () => {
	const captured: StoreAuthorization = { transport: 'header', value: 'Bearer never-valid' };
	const store = fakeStore('something-else');

	await expect(
		resolveProbeOptions(store.context, 'https://example.test', () => captured, { timeoutMs: 1 })
	).rejects.toThrow(/authenticated against no \/wc\/v3\/products transport/);
	// The whole ladder was walked, not just the captured form.
	expect(store.asked.length).toBeGreaterThan(1);
});

test('bounds every verification request by what is left of the budget', async () => {
	// `APIRequestContext.get` waits 30 s by default and the resolver can only consult its
	// deadline BETWEEN candidates, so an unanswering store would stretch a 10 s budget to
	// two minutes. Each request must therefore carry the remaining budget itself.
	const store = fakeStore('nothing-works');

	await expect(
		resolveProbeAuthorization(
			store.context,
			'https://example.test',
			() => ({ transport: 'header', value: 'Bearer dead' }),
			{ timeoutMs: 10_000 }
		)
	).rejects.toThrow(/authenticated against no/);

	expect(store.timeouts.length).toBeGreaterThan(1);
	for (const timeout of store.timeouts) {
		expect(timeout).toBeGreaterThan(0);
		expect(timeout).toBeLessThanOrEqual(10_000);
	}
});

test('proves the credential against the namespace the caller named', async () => {
	// The ladder is only evidence about the route it actually read. A JWT that reaches
	// `wcpos/v2` can be stripped before `wc/v3` sees it, so a caller that will read
	// `wcpos/v1` must be verified there — and `wcpos/v1` is marker-gated: an unmarked
	// request is answered as if the route did not exist.
	const store = fakeStore('live-jwt');

	await resolveProbeAuthorization(
		store.context,
		'https://example.test/shop/',
		() => ({ transport: 'query', value: 'live-jwt' }),
		{ route: '/wcpos/v1/orders' }
	);

	expect(store.urls[0]).toBe('https://example.test/shop/wp-json/wcpos/v1/orders');
	expect(store.params[0].wcpos).toBe('1');
});

test('a swept probe helper writes with the resolved credential, not the captured one', async () => {
	// The shape every swept call site now has: resolve first, then hand the PROVEN
	// credential to the helper. Without the sweep the helper is handed `expired-jwt`
	// and its write 401s — which the caller reports as the store refusing to be
	// written to, i.e. as a broken environment rather than a stale token.
	let captured: StoreAuthorization = { transport: 'query', value: 'expired-jwt' };
	const store = fakeStore('refreshed-jwt');
	setTimeout(() => {
		captured = { transport: 'query', value: 'refreshed-jwt' };
	}, 50);

	const authorization = await resolveProbeAuthorization(
		store.context,
		'https://example.test',
		() => captured,
		{ timeoutMs: 8_000 }
	);
	const created = await createSearchProbe({
		request: store.context,
		storeUrl: 'https://example.test',
		authorization,
		collection: 'customers',
		workerIndex: 0,
	});

	expect(created.ok).toBe(true);
	// The dead credential really was tried first — otherwise this passes on a resolver
	// that ignored the getter — and the WRITE went out with the live one.
	expect(store.asked[0]).toBe('expired-jwt');
	expect(store.asked.at(-1)).toBe('refreshed-jwt');
});

let simpleProductWriterStarted = false;
const automaticSimpleProductTest = isolatedProductTest.extend({
	productWriter: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use) => {
			simpleProductWriterStarted = true;
			await use(null);
		},
		{ scope: 'worker' },
	],
});

automaticSimpleProductTest('provisions simple products before a test requests posPage', () => {
	expect(simpleProductWriterStarted).toBe(true);
});

let variableProductWriterStarted = false;
const automaticVariableProductTest = isolatedVariableProductTest.extend({
	productWriter: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use) => {
			variableProductWriterStarted = true;
			await use(null);
		},
		{ scope: 'worker' },
	],
});

automaticVariableProductTest('provisions a variable product before a test requests posPage', () => {
	expect(variableProductWriterStarted).toBe(true);
});

test.describe('search-probe pure logic', () => {
	test('accepts matching variations demand while searching products', async () => {
		const matchingResponse = {
			request: () => ({ method: () => 'GET' }),
			url: () => 'https://example.test/wp-json/wcpos/v2/variations?search=zxtrace',
			ok: () => true,
			status: () => 200,
		};
		const page = {
			waitForResponse: async (predicate: (response: typeof matchingResponse) => boolean) => {
				if (!predicate(matchingResponse)) {
					throw new Error('matching variations demand was ignored');
				}
				return matchingResponse;
			},
		};
		let searchValue = '';
		const searchInput = {
			fill: async (value: string) => {
				searchValue = value;
			},
		};

		await searchAndWaitForServer(page as never, searchInput as never, 'products', 'zxtrace');
		expect(searchValue).toBe('zxtrace');
	});

	test('accepts an exact result that renders locally without server demand', async () => {
		const page = {
			waitForResponse: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('server demand was not emitted');
			},
		};
		const searchInput = { fill: async () => {} };
		const localResult = { waitFor: async () => {} };

		await searchAndWaitForServer(
			page as never,
			searchInput as never,
			'products',
			'zxlocal',
			localResult as never
		);
	});

	/** One `wcpos/v2` search demand for `term`, as `searchAndWaitForServer` sees it. */
	function searchDemand(status: number, term: string) {
		return {
			request: () => ({ method: () => 'GET' }),
			url: () => `https://example.test/wp-json/wcpos/v2/products?search=${term}`,
			ok: () => status >= 200 && status < 300,
			status: () => status,
		};
	}

	/** A page that offers each scripted response to the predicate, in order. */
	function scriptedPage(responses: ReturnType<typeof searchDemand>[]) {
		return {
			waitForResponse: async (predicate: (r: ReturnType<typeof searchDemand>) => boolean) => {
				for (const candidate of responses) {
					if (predicate(candidate)) return candidate;
				}
				throw new Error('Timeout 120000ms exceeded while waiting for response');
			},
		};
	}

	test('waits through a 401 the app recovers from', async () => {
		// The access token lives 30 minutes, so a session evicted mid-run makes the app
		// take one 401, refresh, and retry. Asserting on the FIRST matching response
		// turned that recovery into a red test on every PR (2026-08-30).
		const page = scriptedPage([searchDemand(401, 'zxstale'), searchDemand(200, 'zxstale')]);

		await searchAndWaitForServer(
			page as never,
			{ fill: async () => {} } as never,
			'products',
			'zxstale'
		);
	});

	test('still fails, naming the status, when no search demand ever succeeds', async () => {
		// Tolerating recovery must not tolerate a demand that never lands: a real 401
		// regression still fails, and the message names what the store actually said
		// rather than a bare Playwright timeout.
		const page = scriptedPage([searchDemand(401, 'zxdead')]);

		await expect(
			searchAndWaitForServer(page as never, { fill: async () => {} } as never, 'products', 'zxdead')
		).rejects.toThrow('products search demand failed: HTTP 401');
	});

	test('an exact local row does not excuse a search demand that 401d', async () => {
		// `localResult` stands in for the server demand only while the wire stayed QUIET —
		// an already-covered search fires no request at all, which is what the parameter
		// exists for. A demand that DID go out and failed is not excused by a row that
		// happened to render, or a cached row would mask an auth regression outright.
		const failed = searchDemand(401, 'zxcached');
		const page = {
			waitForResponse: (predicate: (r: ReturnType<typeof searchDemand>) => boolean) => {
				predicate(failed);
				// Never settles: after the 401 the store answers nothing more.
				return new Promise(() => {});
			},
		};
		const localResult = { waitFor: async () => {} };

		await expect(
			searchAndWaitForServer(
				page as never,
				{ fill: async () => {} } as never,
				'products',
				'zxcached',
				localResult as never
			)
		).rejects.toThrow('products search demand failed: HTTP 401');
	});

	/** The store's `wcpos/v2` namespace index, as `variationsRouteAdvertisesSearch` reads it. */
	function variationsIndex(args: Record<string, unknown>) {
		return response(200, {
			routes: { '/wcpos/v2/variations': { endpoints: [{ args }] } },
		});
	}

	test('an include-only variations route is unsupported without asking for a credential', async () => {
		// The capability answer must be reachable on a store that can never produce one:
		// resolving first would spend the ladder's budget and then THROW on exactly the
		// stores this probe exists to report as unsupported.
		const urls: string[] = [];
		const request = {
			get: async (url: string) => {
				urls.push(url);
				return variationsIndex({ include: {} });
			},
		} as unknown as APIRequestContext;

		const probe = await probeVariationSearch(request, 'https://example.test', () => null, 'zx1');

		expect(probe).toEqual({
			supported: false,
			reason: 'variations route registers no `search` arg',
		});
		expect(urls).toEqual(['https://example.test/wp-json/wcpos/v2']);
	});

	test('a store the app never authenticated against is unsupported, not a failure', async () => {
		const urls: string[] = [];
		const request = {
			get: async (url: string) => {
				urls.push(url);
				return variationsIndex({ search: {} });
			},
		} as unknown as APIRequestContext;

		const probe = await probeVariationSearch(request, 'https://example.test', () => null, 'zx2');

		expect(probe).toEqual({ supported: false, reason: 'no store authorization was observed' });
		// No verification read was attempted — the index is the only request.
		expect(urls).toEqual(['https://example.test/wp-json/wcpos/v2']);
	});

	test('writer credentials must be either fully configured or fully absent', () => {
		expect(productWriterCredentialsDecision(undefined, undefined)).toBe(false);
		expect(productWriterCredentialsDecision('writer', 'secret')).toBe(true);
		expect(() => productWriterCredentialsDecision('writer', undefined)).toThrow(
			'E2E_PRODUCT_WRITER_PASS'
		);
		expect(() => productWriterCredentialsDecision(undefined, 'secret')).toThrow(
			'E2E_PRODUCT_WRITER_USER'
		);
	});

	test('isolates concurrent writer login sessions with unique states', async () => {
		const previousUser = process.env.E2E_PRODUCT_WRITER_USER;
		const previousPass = process.env.E2E_PRODUCT_WRITER_PASS;
		process.env.E2E_PRODUCT_WRITER_USER = 'writer';
		process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
		const states: string[] = [];
		const request = {
			// The helper also issues wc/v3 transport-verification reads; only the
			// wcpos-auth login pages carry the session state this test counts.
			get: async (url: string) => {
				if (url.includes('/wcpos-auth/')) {
					states.push(new URL(url).searchParams.get('state') ?? '');
				}
				return {
					ok: () => true,
					status: () => 200,
					text: async () =>
						'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">',
				};
			},
			post: async () => ({
				status: () => 302,
				headers: () => ({ location: 'https://localhost/cb?access_token=token' }),
			}),
		};

		try {
			await Promise.all([
				productWriterAuthorization(request as never, 'https://example.test'),
				productWriterAuthorization(request as never, 'https://example.test'),
			]);
			expect(states).toHaveLength(2);
			expect(new Set(states).size).toBe(2);
		} finally {
			if (previousUser === undefined) delete process.env.E2E_PRODUCT_WRITER_USER;
			else process.env.E2E_PRODUCT_WRITER_USER = previousUser;
			if (previousPass === undefined) delete process.env.E2E_PRODUCT_WRITER_PASS;
			else process.env.E2E_PRODUCT_WRITER_PASS = previousPass;
		}
	});

	test('writer authorization falls back to the query param when the header is stripped', async () => {
		const previousUser = process.env.E2E_PRODUCT_WRITER_USER;
		const previousPass = process.env.E2E_PRODUCT_WRITER_PASS;
		process.env.E2E_PRODUCT_WRITER_USER = 'writer';
		process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
		// Simulates a hostile proxy (wcpos-infra#72 Tier 3) that strips the
		// Authorization header: only the ?authorization= param authenticates.
		const productReads: { header: string | null; param: string | null }[] = [];
		const request = {
			get: async (
				url: string,
				options?: { headers?: Record<string, string>; params?: Record<string, string> }
			) => {
				if (new URL(url).pathname.includes('wcpos-auth')) {
					return {
						ok: () => true,
						status: () => 200,
						text: async () =>
							'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">',
					};
				}
				const authorized = options?.params?.authorization === 'token';
				productReads.push({
					header: options?.headers?.Authorization ?? null,
					param: options?.params?.authorization ?? null,
				});
				return {
					ok: () => authorized,
					status: () => (authorized ? 200 : 401),
					json: async () => [],
				};
			},
			post: async () => ({
				status: () => 302,
				headers: () => ({ location: 'https://localhost/cb?access_token=token' }),
			}),
		};

		try {
			const authorization = await productWriterAuthorization(
				request as never,
				'https://example.test'
			);
			expect(authorization).toEqual({ transport: 'query', value: 'token' });
			expect(productReads).toEqual([
				{ header: 'Bearer token', param: null },
				{ header: null, param: 'Bearer token' },
				{ header: null, param: 'token' },
			]);
		} finally {
			if (previousUser === undefined) delete process.env.E2E_PRODUCT_WRITER_USER;
			else process.env.E2E_PRODUCT_WRITER_USER = previousUser;
			if (previousPass === undefined) delete process.env.E2E_PRODUCT_WRITER_PASS;
			else process.env.E2E_PRODUCT_WRITER_PASS = previousPass;
		}
	});

	test('uses prefixed query transport when an older server accepts it', async () => {
		const previousUser = process.env.E2E_PRODUCT_WRITER_USER;
		const previousPass = process.env.E2E_PRODUCT_WRITER_PASS;
		process.env.E2E_PRODUCT_WRITER_USER = 'writer';
		process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
		const request = {
			get: async (
				url: string,
				options?: { headers?: Record<string, string>; params?: Record<string, string> }
			) => {
				if (url.includes('/wcpos-auth/')) {
					return {
						ok: () => true,
						status: () => 200,
						text: async () =>
							'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">',
					};
				}
				const authorized = options?.params?.authorization === 'Bearer token';
				return response(authorized ? 200 : 401, {});
			},
			post: async () => ({
				status: () => 302,
				headers: () => ({ location: 'https://localhost/cb?access_token=token' }),
			}),
		};

		try {
			await expect(
				productWriterAuthorization(request as never, 'https://example.test')
			).resolves.toEqual({ transport: 'query', value: 'Bearer token' });
		} finally {
			if (previousUser === undefined) delete process.env.E2E_PRODUCT_WRITER_USER;
			else process.env.E2E_PRODUCT_WRITER_USER = previousUser;
			if (previousPass === undefined) delete process.env.E2E_PRODUCT_WRITER_PASS;
			else process.env.E2E_PRODUCT_WRITER_PASS = previousPass;
		}
	});

	test('probe deletes travel as POST with a _method=DELETE override', async () => {
		// A WAF method policy (wcpos-infra#72 Tier 4) 403s DELETE before
		// WordPress sees it; the POST + ?_method=DELETE escape must be the only
		// wire shape the helper emits.
		const calls: { method: string; url: string; params?: Record<string, string> }[] = [];
		const stub = async (
			method: string,
			url: string,
			options?: { params?: Record<string, string> }
		) => {
			calls.push({ method, url, ...(options?.params ? { params: options.params } : {}) });
			return { ok: () => true, status: () => 200, json: async () => ({}) };
		};
		const request = {
			post: (url: string, options?: { params?: Record<string, string> }) =>
				stub('post', url, options),
			delete: (url: string, options?: { params?: Record<string, string> }) =>
				stub('delete', url, options),
		};

		await deleteSearchProbe({
			request: request as never,
			storeUrl: 'https://example.test',
			authorization: { transport: 'query', value: 'token' },
			collection: 'products',
			id: 7,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('post');
		expect(calls[0].url).toBe('https://example.test/wp-json/wc/v3/products/7');
		expect(calls[0].params).toMatchObject({
			_method: 'DELETE',
			force: 'true',
			authorization: 'token',
		});
	});

	test('continues to query writer auth when the header probe throws', async () => {
		const previousUser = process.env.E2E_PRODUCT_WRITER_USER;
		const previousPass = process.env.E2E_PRODUCT_WRITER_PASS;
		process.env.E2E_PRODUCT_WRITER_USER = 'writer';
		process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
		const attempts: string[] = [];
		const request = {
			get: async (
				url: string,
				options?: { headers?: Record<string, string>; params?: Record<string, string> }
			) => {
				if (url.includes('/wcpos-auth/')) {
					return {
						ok: () => true,
						status: () => 200,
						text: async () =>
							'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">',
					};
				}
				const header = options?.headers?.Authorization;
				const query = options?.params?.authorization;
				attempts.push(header ? `header:${header}` : `query:${query}`);
				if (header) throw new Error('connection reset');
				return response(200, {});
			},
			post: async () => ({
				status: () => 302,
				headers: () => ({ location: 'https://localhost/cb?access_token=token' }),
			}),
		};

		try {
			await expect(
				productWriterAuthorization(request as never, 'https://example.test')
			).resolves.toEqual({ transport: 'query', value: 'Bearer token' });
			expect(attempts).toEqual(['header:Bearer token', 'query:Bearer token']);
		} finally {
			if (previousUser === undefined) delete process.env.E2E_PRODUCT_WRITER_USER;
			else process.env.E2E_PRODUCT_WRITER_USER = previousUser;
			if (previousPass === undefined) delete process.env.E2E_PRODUCT_WRITER_PASS;
			else process.env.E2E_PRODUCT_WRITER_PASS = previousPass;
		}
	});

	test('adopts only the exact product identified by the create token', () => {
		const exact = { id: 42, name: 'E2E Probe zxexact', slug: 'e2e-probe-zxexact' };
		const custom = {
			id: 44,
			name: 'E2E Probe zxexact alpha',
			slug: 'e2e-probe-zxexact-alpha',
		};
		expect(
			findCreatedProductRecord(
				[
					{ id: 41, name: 'Catalog zxexact lookalike' },
					exact,
					{ id: 43, name: 'E2E Probe zxexact-extra' },
				],
				'zxexact'
			)
		).toEqual(exact);
		expect(findCreatedProductRecord([custom], 'zxexact', [custom.name])).toEqual(custom);
		expect(findCreatedProductRecord([], 'zxexact')).toBeNull();
	});

	test('rejects malformed product adoption lists', () => {
		expect(() => findCreatedProductRecord({ id: 42 }, 'zxexact')).toThrow(
			'Product create adoption lookup returned a malformed product list'
		);
	});

	test('sweeps orphaned directional arrival probes', async () => {
		const deleted: string[] = [];
		const request = {
			get: async () =>
				response(200, [
					{
						id: 41,
						name: 'aaaa E2E Arrival zxalpha',
						date_created_gmt: '2020-01-01T00:00:00',
					},
					{
						id: 42,
						name: 'zzzz E2E Arrival zxzulu',
						date_created_gmt: '2020-01-01T00:00:00',
					},
					{
						id: 43,
						name: 'Catalog E2E Arrival',
						date_created_gmt: '2020-01-01T00:00:00',
					},
					// The current ascending lead token; `aaaa` above is the retired one,
					// still swept so older orphans are not stranded.
					{
						id: 44,
						name: '0000 E2E Arrival zxzero',
						date_created_gmt: '2020-01-01T00:00:00',
					},
				]),
			post: async (url: string, options?: { params?: Record<string, string> }) => {
				if (options?.params?._method === 'DELETE') deleted.push(url);
				return response(200, {});
			},
		};

		await sweepOrphanedProductProbes({
			request: request as never,
			storeUrl: 'https://example.test',
			authorization: null,
		});

		expect(deleted).toEqual([
			'https://example.test/wp-json/wc/v3/products/41',
			'https://example.test/wp-json/wc/v3/products/42',
			'https://example.test/wp-json/wc/v3/products/44',
		]);
	});

	test('product helpers name the fixture required for their page registration', async () => {
		const unregisteredPage = {} as never;

		await expect(tryAddRunPrivateSimpleProduct(unregisteredPage)).rejects.toThrow(
			'tryAddRunPrivateSimpleProduct requires isolatedProductTest fixture registration'
		);
		await expect(findVariableProduct(unregisteredPage, {} as never)).rejects.toThrow(
			'findVariableProduct requires isolatedVariableProductTest fixture registration'
		);
	});

	test('deletes a created variable parent whose response omits its slug', async () => {
		let deletedUrl = '';
		const request = {
			post: async (url: string, options?: { params?: Record<string, string> }) => {
				if (options?.params?._method === 'DELETE') {
					deletedUrl = url;
					return response(200, {});
				}
				return response(201, { id: 42 });
			},
		};

		await expect(
			createRunPrivateProduct({
				request: request as never,
				storeUrl: 'https://example.test',
				authorization: { transport: 'header', value: 'secret' },
				kind: 'variable',
				workerIndex: 0,
			})
		).rejects.toThrow('without its id and slug');
		expect(deletedUrl).toBe('https://example.test/wp-json/wc/v3/products/42');
	});

	test('adopts a variation created before an ambiguous transport failure', async () => {
		let redAttempts = 0;
		let lookupCount = 0;
		const request = {
			post: async (url: string, options: { data: { sku?: string } }) => {
				if (!url.includes('/variations')) {
					return response(201, { id: 42, slug: 'e2e-variable-probe' });
				}
				if (options.data.sku?.endsWith('red')) {
					redAttempts += 1;
					if (redAttempts === 1) throw new Error('connection reset after write');
					return response(400, { code: 'product_invalid_sku' });
				}
				return response(201, { id: 44 });
			},
			get: async (url: string, options: { params: { sku: string } }) => {
				if (!url.includes('/variations')) return response(200, []);
				lookupCount += 1;
				return response(200, [{ id: 43, sku: options.params.sku }]);
			},
			delete: async () => response(200, {}),
		};

		await expect(
			createRunPrivateProduct({
				request: request as never,
				storeUrl: 'https://example.test',
				authorization: { transport: 'header', value: 'secret' },
				kind: 'variable',
				workerIndex: 0,
			})
		).resolves.toEqual(expect.objectContaining({ id: 42 }));
		expect(lookupCount).toBe(1);
		expect(redAttempts).toBe(1);
	});

	test('missing writer credentials keep product probes skippable', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: false,
				failure: 'http',
				retryAvailable: false,
			})
		).toBe('skip');
	});

	test('configured HTTP failures fail immediately, including variable-product creation', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'http',
				retryAvailable: true,
			})
		).toBe('fail');
	});

	test('transport failures retry once, then retain configured-writer failure policy', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'transport',
				retryAvailable: true,
			})
		).toBe('retry');
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'transport',
				retryAvailable: false,
			})
		).toBe('fail');
	});
});
