/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useBarcode } from './use-barcode';

const mockBarcodeSearch = jest.fn();
const mockAddProduct = jest.fn();
const mockAddVariation = jest.fn();
const mockEngineRequire = jest.fn();
const mockFetcher = jest.fn();
const mockFindParent = jest.fn();
const mockOnKeyPress = jest.fn();
let mockSubscriptionCallback: ((barcode: unknown) => Promise<void> | void) | undefined;

jest.mock('@wcpos/utils/logger', () => {
	const barcodeLogger = {
		debug: jest.fn(),
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		success: jest.fn(),
	};
	return { getLogger: () => barcodeLogger, __barcodeLogger: barcodeLogger };
});

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => true,
	useSubscription: (_observable: unknown, callback: (barcode: unknown) => Promise<void> | void) => {
		mockSubscriptionCallback = callback;
	},
}));

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			hostTransport: () => ({
				syncBaseUrl: 'https://example.test/wp-json/wcpos/v1/sync',
				fetcher: mockFetcher,
			}),
			require: mockEngineRequire,
		},
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { showOutOfStock$: {} } }),
}));

jest.mock('../../hooks/barcodes', () => ({
	useBarcodeDetection: () => ({ barcode$: {}, onKeyPress: mockOnKeyPress }),
	useBarcodeSearch: () => ({ barcodeSearch: mockBarcodeSearch }),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: {
			findOne: () => ({ exec: mockFindParent }),
		},
	}),
}));

jest.mock('../hooks/use-add-product', () => ({
	useAddProduct: () => ({ addProduct: mockAddProduct }),
}));

jest.mock('../hooks/use-add-variation', () => ({
	useAddVariation: () => ({ addVariation: mockAddVariation }),
}));

const mockBarcodeLogger = jest.requireMock('@wcpos/utils/logger').__barcodeLogger as {
	debug: jest.Mock;
	info: jest.Mock;
	error: jest.Mock;
	warn: jest.Mock;
	success: jest.Mock;
};

const productQuery = { search: jest.fn() };
const searchInput = { setSearch: jest.fn(), onSearch: jest.fn() };

function response(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		text: async () => JSON.stringify(body),
	} as Response;
}

function onlineResponse(input?: {
	match?: { id: number; type: 'product' | 'variation'; parent_id?: number } | null;
	ambiguous?: { id: number; type: 'product' | 'variation' }[];
}): Response {
	const match = input?.match ?? null;
	return response({
		code: 'ABC',
		found: match !== null,
		match: match === null ? null : { ...match, payload: {} },
		ambiguous: input?.ambiguous ?? [],
	});
}

function productDocument(id = 41) {
	return {
		id,
		name: 'Keyboard',
		stock_status: 'instock',
		collection: { name: 'products' },
	};
}

function variationDocument(id = 51, parentId = 41) {
	return {
		id,
		parent_id: parentId,
		name: 'Keyboard / Black',
		stock_status: 'instock',
		attributes: [{ id: 7, name: 'Colour', option: 'Black' }],
		collection: { name: 'variations' },
	};
}

async function scan(barcode = 'ABC'): Promise<void> {
	if (!mockSubscriptionCallback) throw new Error('barcode subscription was not registered');
	await mockSubscriptionCallback(barcode);
}

function renderBarcodeHook() {
	return renderHook(() =>
		useBarcode(
			productQuery as never,
			{ current: searchInput } as React.RefObject<typeof searchInput | null>
		)
	);
}

describe('useBarcode online escalation', () => {
	beforeEach(() => {
		for (const mock of [
			mockBarcodeSearch,
			mockAddProduct,
			mockAddVariation,
			mockEngineRequire,
			mockFetcher,
			mockFindParent,
			mockOnKeyPress,
			productQuery.search,
			searchInput.setSearch,
			searchInput.onSearch,
			mockBarcodeLogger.info,
			mockBarcodeLogger.debug,
			mockBarcodeLogger.error,
			mockBarcodeLogger.warn,
			mockBarcodeLogger.success,
		]) {
			mock.mockReset();
		}
		mockSubscriptionCallback = undefined;
		mockEngineRequire.mockImplementation(() => ({
			ready: Promise.resolve({ action: 'fetched', missingRecordIds: [], reason: 'test' }),
			release: jest.fn(),
		}));
		mockFindParent.mockResolvedValue(productDocument());
	});

	it('shows searching-online feedback before the fetch promise resolves', async () => {
		mockBarcodeSearch.mockResolvedValue([]);
		let resolveFetch: ((value: Response) => void) | undefined;
		const order: string[] = [];
		mockBarcodeLogger.info.mockImplementation(() => order.push('toast'));
		mockFetcher.mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					order.push('fetch');
					resolveFetch = resolve;
				})
		);
		renderBarcodeHook();

		let scanPromise: Promise<void> | undefined;
		await act(async () => {
			scanPromise = scan();
			await Promise.resolve();
		});

		expect(order).toEqual(['toast', 'fetch']);
		resolveFetch?.(onlineResponse());
		await act(async () => scanPromise);
	});

	it('force-refreshes a resident product with a stale barcode before re-querying locally', async () => {
		const product = productDocument();
		mockBarcodeSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([product]);
		mockFetcher.mockResolvedValue(
			onlineResponse({ match: { id: product.id, type: 'product', parent_id: 0 } })
		);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockEngineRequire).toHaveBeenCalledWith({
			id: 'barcode:ABC:product:41',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [41],
			forceRefresh: true,
		});
		expect(mockBarcodeSearch).toHaveBeenCalledTimes(2);
		expect(mockAddProduct).toHaveBeenCalledWith(product);
		expect(mockEngineRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
	});

	it('requires a variation and its parent product before adding the hydrated variation', async () => {
		const parent = productDocument();
		const variation = variationDocument();
		mockBarcodeSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([variation]);
		mockFetcher.mockResolvedValue(
			onlineResponse({
				match: { id: variation.id, type: 'variation', parent_id: parent.id },
			})
		);
		mockFindParent.mockResolvedValue(parent);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockEngineRequire).toHaveBeenNthCalledWith(1, {
			id: 'barcode:ABC:variation:51',
			collection: 'variations',
			kind: 'targeted-records',
			wooIds: [51],
			forceRefresh: true,
		});
		expect(mockEngineRequire).toHaveBeenNthCalledWith(2, {
			id: 'barcode:ABC:product:41',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [41],
			forceRefresh: true,
		});
		expect(mockAddVariation).toHaveBeenCalledWith(variation, parent, [
			{ attr_id: 7, display_key: 'Colour', display_value: 'Black' },
		]);
		for (const result of mockEngineRequire.mock.results) {
			expect(result.value.release).toHaveBeenCalledTimes(1);
		}
	});

	it('falls through to not-found when the targeted records are still absent without escalating again', async () => {
		mockBarcodeSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		mockFetcher.mockResolvedValue(
			onlineResponse({ match: { id: 41, type: 'product', parent_id: 0 } })
		);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockBarcodeSearch).toHaveBeenCalledTimes(2);
		expect(mockFetcher).toHaveBeenCalledTimes(1);
		expect(mockEngineRequire).toHaveBeenCalledTimes(1);
		expect(mockAddProduct).not.toHaveBeenCalled();
		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: 'common.product_not_found_online' } })
		);
	});

	it('hydrates non-resident ambiguous products and variations before opening search', async () => {
		mockBarcodeSearch.mockResolvedValue([]);
		const hydrationResolvers: (() => void)[] = [];
		mockEngineRequire.mockImplementation(() => ({
			ready: new Promise<void>((resolve) => hydrationResolvers.push(resolve)),
			release: jest.fn(),
		}));
		mockFetcher.mockResolvedValue(
			onlineResponse({
				match: { id: 1, type: 'product' },
				ambiguous: [
					{ id: 2, type: 'product' },
					{ id: 3, type: 'variation' },
				],
			})
		);
		renderBarcodeHook();

		let scanPromise: Promise<void> | undefined;
		await act(async () => {
			scanPromise = scan();
			await Promise.resolve();
		});

		expect(mockEngineRequire).toHaveBeenNthCalledWith(1, {
			id: 'barcode:ABC:ambiguous:products',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [1, 2],
			forceRefresh: true,
		});
		expect(mockEngineRequire).toHaveBeenNthCalledWith(2, {
			id: 'barcode:ABC:ambiguous:variations',
			collection: 'variations',
			kind: 'targeted-records',
			wooIds: [3],
			forceRefresh: true,
		});
		expect(productQuery.search).not.toHaveBeenCalled();
		for (const resolve of hydrationResolvers) resolve();
		await act(async () => scanPromise);

		expect(productQuery.search).toHaveBeenCalledWith('ABC');
		expect(searchInput.setSearch).toHaveBeenCalledWith('ABC');
		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				toast: { text2: 'common.product_found_locally:{"count":3}' },
			})
		);
		for (const result of mockEngineRequire.mock.results) {
			expect(result.value.release).toHaveBeenCalledTimes(1);
		}
	});

	it('caps ambiguous hydration at ten candidates and logs the truncation', async () => {
		mockBarcodeSearch.mockResolvedValue([]);
		mockFetcher.mockResolvedValue(
			onlineResponse({
				match: { id: 1, type: 'product' },
				ambiguous: Array.from({ length: 11 }, (_, index) => ({
					id: index + 2,
					type: index % 2 === 0 ? ('variation' as const) : ('product' as const),
				})),
			})
		);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockEngineRequire).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ collection: 'products', wooIds: [1, 3, 5, 7, 9] })
		);
		expect(mockEngineRequire).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ collection: 'variations', wooIds: [2, 4, 6, 8, 10] })
		);
		expect(mockBarcodeLogger.debug).toHaveBeenCalledWith(
			expect.stringContaining('capped'),
			expect.objectContaining({
				context: expect.objectContaining({ candidatesCount: 12, hydratedCandidatesCount: 10 }),
			})
		);
	});

	it('opens search when best-effort ambiguous hydration fails', async () => {
		mockBarcodeSearch.mockResolvedValue([]);
		mockFetcher.mockResolvedValue(
			onlineResponse({
				match: { id: 1, type: 'product' },
				ambiguous: [{ id: 2, type: 'variation' }],
			})
		);
		mockEngineRequire
			.mockImplementationOnce(() => ({
				ready: Promise.reject(new Error('offline')),
				release: jest.fn(),
			}))
			.mockImplementationOnce(() => ({ ready: Promise.resolve(), release: jest.fn() }));
		renderBarcodeHook();

		await act(async () => scan());

		expect(productQuery.search).toHaveBeenCalledWith('ABC');
		expect(searchInput.setSearch).toHaveBeenCalledWith('ABC');
		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: 'common.barcode_online_lookup_failed' } })
		);
		for (const result of mockEngineRequire.mock.results) {
			expect(result.value.release).toHaveBeenCalledTimes(1);
		}
	});

	it('aborts a stalled online lookup at the ten-second deadline and shows failure', async () => {
		jest.useFakeTimers();
		try {
			mockBarcodeSearch.mockResolvedValue([]);
			let fetchSignal: AbortSignal | null | undefined;
			mockFetcher.mockImplementation((_url: string, init?: RequestInit) => {
				fetchSignal = init?.signal;
				return new Promise<Response>(() => undefined);
			});
			renderBarcodeHook();

			let scanPromise: Promise<void> | undefined;
			await act(async () => {
				scanPromise = scan();
				await Promise.resolve();
			});

			await act(async () => {
				jest.advanceTimersByTime(9_999);
				await Promise.resolve();
			});
			expect(mockBarcodeLogger.error).not.toHaveBeenCalled();

			await act(async () => {
				jest.advanceTimersByTime(1);
				await scanPromise;
			});

			expect(fetchSignal?.aborted).toBe(true);
			expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ toast: { text2: 'common.barcode_online_lookup_failed' } })
			);
			expect(productQuery.search).toHaveBeenCalledWith('ABC');
			expect(searchInput.setSearch).toHaveBeenCalledWith('ABC');
		} finally {
			jest.useRealTimers();
		}
	});

	it.each([
		{
			name: 'not found online',
			fetch: () => Promise.resolve(onlineResponse()),
			message: 'common.product_not_found_online',
		},
		{
			name: 'online lookup failure',
			fetch: () => Promise.reject(new Error('offline')),
			message: 'common.barcode_online_lookup_failed',
		},
	])('uses the distinct $name toast', async ({ fetch, message }) => {
		mockBarcodeSearch.mockResolvedValue([]);
		mockFetcher.mockImplementation(fetch);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: message } })
		);
		expect(productQuery.search).toHaveBeenCalledWith('ABC');
		expect(searchInput.setSearch).toHaveBeenCalledWith('ABC');
	});
});
