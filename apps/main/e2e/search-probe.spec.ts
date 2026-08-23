import { expect, test } from '@playwright/test';

import {
	findVariableProduct,
	isolatedProductTest,
	isolatedVariableProductTest,
	tryAddRunPrivateSimpleProduct,
} from './checkout-probe';
import {
	authorizationCandidates,
	createRunPrivateProduct,
	deleteSearchProbe,
	findCreatedProductRecord,
	plainPermalinkUrl,
	productProbeFailureAction,
	productWriterAuthorization,
	productWriterCredentialsDecision,
	resolveProbeOptions,
	searchAndWaitForServer,
	sweepOrphanedProductProbes,
} from './search-probe';

import type { APIRequestContext } from '@playwright/test';
import type { StoreAuthorization } from './fixtures';

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
 * A store that only honours one credential, and records what it was asked with.
 * `resolveProbeOptions` must find the good one by evidence alone — it never inspects
 * a token, because credentials here are opaque.
 */
function fakeStore(accepts: string) {
	const asked: string[] = [];
	const context = {
		get: async (
			_url: string,
			options: { headers?: Record<string, string>; params?: Record<string, string> }
		) => {
			const offered = options.params?.authorization ?? options.headers?.Authorization ?? '';
			asked.push(offered);
			return response(offered === accepts ? 200 : 401, []);
		},
	} as unknown as APIRequestContext;
	return { context, asked };
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
	).rejects.toThrow(/authenticated against no wc\/v3 transport/);
	// The whole ladder was walked, not just the captured form.
	expect(store.asked.length).toBeGreaterThan(1);
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
			get: async (_url: string, options: { params: { sku: string } }) => {
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
