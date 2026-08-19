import { expect, test } from '@playwright/test';

import {
	findVariableProduct,
	isolatedProductTest,
	isolatedVariableProductTest,
	tryAddRunPrivateSimpleProduct,
} from './checkout-probe';
import {
	createRunPrivateProduct,
	findCreatedProductRecord,
	plainPermalinkUrl,
	productProbeFailureAction,
	productWriterAuthorization,
	productWriterCredentialsDecision,
	searchAndWaitForServer,
} from './search-probe';

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
			get: async (url: string) => {
				states.push(new URL(url).searchParams.get('state') ?? '');
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
			post: async () => response(201, { id: 42 }),
			delete: async (url: string) => {
				deletedUrl = url;
				return response(200, {});
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
