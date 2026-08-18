import { log } from '@wcpos/utils/logger';

import { isAuthenticatedStoreApiResponse } from '../e2e/global-setup';
import {
	blockScriptRequests,
	isRouteTeardownError,
	tryAddProductBySku,
	waitForAuthEntry,
	waitForOAuthCallback,
} from '../e2e/fixtures';

jest.mock('@wcpos/utils/logger', () => ({
	log: { info: jest.fn() },
}));

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

describe('isAuthenticatedStoreApiResponse', () => {
	it('accepts only successful WCPOS API responses from the configured store', () => {
		const storeUrl = 'https://stores.example/current-store';

		expect(
			isAuthenticatedStoreApiResponse(
				'https://stores.example/current-store/wp-json/wcpos/v2/census',
				storeUrl,
				true
			)
		).toBe(true);
		expect(
			isAuthenticatedStoreApiResponse(
				'https://stores.example/current-store/?rest_route=/wcpos/v2/census',
				storeUrl,
				true
			)
		).toBe(true);
		expect(
			isAuthenticatedStoreApiResponse(
				'https://stores.example/old-store/wp-json/wcpos/v2/census',
				storeUrl,
				true
			)
		).toBe(false);
		expect(
			isAuthenticatedStoreApiResponse(
				'https://stores.example/old-store/?rest_route=/wcpos/v2/census',
				storeUrl,
				true
			)
		).toBe(false);
		expect(
			isAuthenticatedStoreApiResponse(
				'https://other.example/current-store/wp-json/wcpos/v2/census',
				storeUrl,
				true
			)
		).toBe(false);
	});
});

describe('isRouteTeardownError', () => {
	it('recognizes Playwright route callbacks that fail because the page closed', () => {
		expect(
			isRouteTeardownError(
				new Error(
					'route.fetch: Target page, context or browser has been closed while running route callback.'
				)
			)
		).toBe(true);
	});

	it('recognizes Playwright responses disposed during route teardown', () => {
		expect(isRouteTeardownError(new Error('apiResponse.json: Response has been disposed'))).toBe(
			true
		);
	});

	it('recognizes Playwright route callbacks that outlive their test', () => {
		expect(isRouteTeardownError(new Error('route.fetch: Test ended.'))).toBe(true);
	});

	it('does not hide unrelated route failures', () => {
		expect(isRouteTeardownError(new Error('route.fetch: connect ECONNREFUSED'))).toBe(false);
	});
});

describe('blockScriptRequests', () => {
	it('ignores route teardown while aborting an in-flight script request', async () => {
		const route = {
			request: jest.fn().mockReturnValue({ resourceType: () => 'script' }),
			abort: jest.fn().mockRejectedValue(new Error('route.abort: Test ended.')),
		};

		await expect(blockScriptRequests(route as never)).resolves.toBeUndefined();
	});

	it('does not hide unrelated failures while blocking scripts', async () => {
		const error = new Error('route.abort: access denied');
		const route = {
			request: jest.fn().mockReturnValue({ resourceType: () => 'script' }),
			abort: jest.fn().mockRejectedValue(error),
		};

		await expect(blockScriptRequests(route as never)).rejects.toBe(error);
	});
});

describe('waitForAuthEntry', () => {
	it('retries when the deployment entry point is not visible', async () => {
		const waitFor = jest
			.fn()
			.mockRejectedValueOnce(new Error('not visible'))
			.mockResolvedValueOnce(undefined);
		const page = {
			goto: jest.fn().mockResolvedValue(undefined),
			getByTestId: jest.fn().mockReturnValue({ waitFor }),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
		};

		await waitForAuthEntry(page as never);

		expect(page.goto).toHaveBeenCalledTimes(2);
		expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
	});
});

describe('waitForOAuthCallback', () => {
	it('reports the WordPress log permission failure instead of a callback timeout', async () => {
		const page = {
			waitForURL: jest.fn().mockReturnValue(new Promise(() => {})),
			waitForFunction: jest.fn().mockResolvedValue(undefined),
		};

		await expect(
			waitForOAuthCallback(page as never, 'https://preview.example.com')
		).rejects.toThrow('WordPress cannot write to wp-content/uploads/wc-logs');
	});
});

describe('tryAddProductBySku', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('waits for the SKU query and stale variable-product tiles before clicking', async () => {
		const search = {
			waitFor: jest.fn().mockResolvedValue(undefined),
			fill: jest.fn().mockResolvedValue(undefined),
			clear: jest.fn().mockResolvedValue(undefined),
		};
		const variableTiles = {
			count: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(0),
		};
		const resultCount = {
			textContent: jest
				.fn()
				.mockResolvedValueOnce('Showing 10 of 10')
				.mockResolvedValueOnce('Showing 10 of 10')
				.mockResolvedValue('Showing 1 of 1'),
		};
		const tiles = {
			count: jest.fn().mockResolvedValue(1),
			first: jest.fn(),
			isVisible: jest.fn().mockResolvedValue(true),
			click: jest.fn().mockImplementation(async () => {
				if (
					resultCount.textContent.mock.calls.length < 3 ||
					variableTiles.count.mock.calls.length < 2
				) {
					throw new Error('clicked while the unfiltered grid was still visible');
				}
			}),
		};
		tiles.first.mockReturnValue(tiles);
		const rowButtons = {
			count: jest.fn().mockResolvedValue(0),
			first: jest.fn(),
		};
		const checkout = { waitFor: jest.fn().mockResolvedValue(undefined) };
		const page = {
			getByTestId: jest.fn((testId: string) => {
				switch (testId) {
					case 'search-products':
						return search;
					case 'data-table-count':
						return resultCount;
					case 'product-tile':
						return tiles;
					case 'variable-product-tile':
						return variableTiles;
					case 'add-to-cart-button':
						return rowButtons;
					case 'checkout-button':
						return checkout;
					default:
						throw new Error(`Unexpected test ID: ${testId}`);
				}
			}),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
		};

		await expect(tryAddProductBySku(page as never, 'woo-belt')).resolves.toBe('added');

		expect(variableTiles.count).toHaveBeenCalledTimes(3);
		expect(tiles.click).toHaveBeenCalledTimes(1);
	});

	it('routes fallback diagnostics through the project logger', async () => {
		const page = {
			getByTestId: jest.fn().mockReturnValue({
				waitFor: jest.fn().mockRejectedValue(new Error('not visible')),
			}),
		};

		await expect(tryAddProductBySku(page as never)).resolves.toBe('unavailable');

		expect(log.info).toHaveBeenCalledWith(
			'[product] search unavailable — falling back to first catalogue product'
		);
	});

	it('treats a variable-only SKU match as unavailable without clicking it', async () => {
		const search = {
			waitFor: jest.fn().mockResolvedValue(undefined),
			fill: jest.fn().mockResolvedValue(undefined),
			clear: jest.fn().mockResolvedValue(undefined),
		};
		const tile = { isVisible: jest.fn().mockResolvedValue(false) };
		const tiles = {
			count: jest.fn().mockResolvedValue(0),
			first: jest.fn().mockReturnValue(tile),
		};
		const variableTiles = { count: jest.fn().mockResolvedValue(1) };
		const rowButton = { click: jest.fn().mockRejectedValue(new Error('missing row button')) };
		const rowButtons = {
			count: jest.fn().mockResolvedValue(0),
			first: jest.fn().mockReturnValue(rowButton),
		};
		const page = {
			getByTestId: jest.fn((testId: string) => {
				switch (testId) {
					case 'search-products':
						return search;
					case 'data-table-count':
						return { textContent: jest.fn().mockResolvedValueOnce('10').mockResolvedValue('1') };
					case 'product-tile':
						return tiles;
					case 'variable-product-tile':
						return variableTiles;
					case 'add-to-cart-button':
						return rowButtons;
					default:
						throw new Error(`Unexpected test ID: ${testId}`);
				}
			}),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
		};

		await expect(tryAddProductBySku(page as never, 'variable-sku')).resolves.toBe('unavailable');

		expect(search.clear).toHaveBeenCalledTimes(1);
		expect(rowButton.click).not.toHaveBeenCalled();
		expect(log.info).toHaveBeenCalledWith(
			'[product] SKU "variable-sku" is variable — falling back to first catalogue product'
		);
	});

	it('distinguishes a matched SKU that never reaches the cart', async () => {
		const search = {
			waitFor: jest.fn().mockResolvedValue(undefined),
			fill: jest.fn().mockResolvedValue(undefined),
			clear: jest.fn().mockResolvedValue(undefined),
		};
		const tile = {
			isVisible: jest.fn().mockResolvedValue(true),
			click: jest.fn().mockResolvedValue(undefined),
		};
		const page = {
			getByTestId: jest.fn((testId: string) => {
				switch (testId) {
					case 'search-products':
						return search;
					case 'data-table-count':
						return { textContent: jest.fn().mockResolvedValueOnce('10').mockResolvedValue('1') };
					case 'product-tile':
						return {
							count: jest.fn().mockResolvedValue(1),
							first: jest.fn().mockReturnValue(tile),
						};
					case 'variable-product-tile':
					case 'add-to-cart-button':
						return { count: jest.fn().mockResolvedValue(0) };
					case 'checkout-button':
						return { waitFor: jest.fn().mockRejectedValue(new Error('not visible')) };
					default:
						throw new Error(`Unexpected test ID: ${testId}`);
				}
			}),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
		};

		await expect(tryAddProductBySku(page as never, 'broken-sku')).resolves.toBe('add_failed');
	});
});
