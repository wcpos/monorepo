/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useBarcode } from './use-barcode';

const mockAddProduct = jest.fn();
const mockAddVariation = jest.fn();
const mockEngineRequire = jest.fn();
const mockEngineActive = jest.fn();
const mockFetcher = jest.fn();
const mockFindEngineProducts = jest.fn(async () => engineProducts);
const mockFindEngineVariations = jest.fn(async () => engineVariations);
const mockFindEngineProductById = jest.fn(
	async (productId: number) =>
		engineProducts.find((document) => document.wooProductId === productId) ?? null
);
const mockOnKeyPress = jest.fn();
const engineProducts: EngineDocument[] = [];
const engineVariations: EngineDocument[] = [];
let mockSubscriptionCallback: ((barcode: unknown) => Promise<void> | void) | undefined;
let mockShowOutOfStock = true;

interface EngineDocument {
	id: string;
	payload: Record<string, unknown>;
	collection: { name: 'products' | 'variations' };
	getLatest: () => EngineDocument;
	toJSON: () => Record<string, unknown>;
	toMutableJSON: () => Record<string, unknown>;
	[key: string]: unknown;
}

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
	useObservableEagerState: () => mockShowOutOfStock,
	useSubscription: (_observable: unknown, callback: (barcode: unknown) => Promise<void> | void) => {
		mockSubscriptionCallback = callback;
	},
}));

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			active: mockEngineActive,
			hostTransport: () => ({
				syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
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

const mockSetSearch = jest.fn();
const mockClearSearch = jest.fn();

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

function productDocument(id = 41, barcode = 'ABC'): EngineDocument {
	const payload = {
		id,
		name: 'Keyboard',
		stock_status: 'instock',
		barcode,
	};
	const document = {
		id: `product-${id}`,
		wooProductId: id,
		stockStatus: 'instock',
		payload,
		collection: { name: 'products' as const },
		getLatest: () => document,
		toJSON: () => ({ ...document, payload: { ...payload } }),
		toMutableJSON: () => ({ ...document, payload: { ...payload } }),
	};
	return document;
}

function variationDocument(id = 51, parentId = 41, barcode = 'ABC'): EngineDocument {
	const payload = {
		id,
		parent_id: parentId,
		name: 'Keyboard / Black',
		stock_status: 'instock',
		barcode,
		attributes: [{ id: 7, name: 'Colour', option: 'Black' }],
	};
	const document = {
		id: `variation-${id}`,
		wooId: id,
		parentId,
		stockStatus: 'instock',
		payload,
		collection: { name: 'variations' as const },
		getLatest: () => document,
		toJSON: () => ({ ...document, payload: { ...payload } }),
		toMutableJSON: () => ({ ...document, payload: { ...payload } }),
	};
	return document;
}

async function scan(barcode = 'ABC'): Promise<void> {
	if (!mockSubscriptionCallback) throw new Error('barcode subscription was not registered');
	await mockSubscriptionCallback(barcode);
}

function renderBarcodeHook() {
	const useStoreBarcode = useBarcode as unknown as (
		setSearch: (search: string) => void,
		clearSearch: () => void
	) => {
		onKeyPress: (...args: unknown[]) => unknown;
	};
	return renderHook(() => useStoreBarcode(mockSetSearch, mockClearSearch));
}

describe('useBarcode online escalation', () => {
	beforeEach(() => {
		mockShowOutOfStock = true;
		for (const mock of [
			mockAddProduct,
			mockAddVariation,
			mockEngineRequire,
			mockEngineActive,
			mockFetcher,
			mockFindEngineProducts,
			mockFindEngineVariations,
			mockFindEngineProductById,
			mockOnKeyPress,
			mockSetSearch,
			mockClearSearch,
			mockBarcodeLogger.info,
			mockBarcodeLogger.debug,
			mockBarcodeLogger.error,
			mockBarcodeLogger.warn,
			mockBarcodeLogger.success,
		]) {
			mock.mockReset();
		}
		mockAddProduct.mockResolvedValue(true);
		mockAddVariation.mockResolvedValue(true);
		engineProducts.length = 0;
		engineVariations.length = 0;
		mockFindEngineProducts.mockImplementation(async () => engineProducts);
		mockFindEngineVariations.mockImplementation(async () => engineVariations);
		mockFindEngineProductById.mockImplementation(
			async (productId: number) =>
				engineProducts.find((document) => document.wooProductId === productId) ?? null
		);
		mockEngineActive.mockImplementation(() => ({
			database: {
				collections: {
					products: {
						find: () => ({ exec: mockFindEngineProducts }),
						findOne: ({ selector }: { selector: { wooProductId: number } }) => ({
							exec: () => mockFindEngineProductById(selector.wooProductId),
						}),
					},
					variations: {
						find: () => ({ exec: mockFindEngineVariations }),
					},
				},
			},
		}));
		mockSubscriptionCallback = undefined;
		mockEngineRequire.mockImplementation(() => ({
			ready: Promise.resolve({ action: 'fetched', missingRecordIds: [], reason: 'test' }),
			release: jest.fn(),
		}));
	});

	it.each(['sku', 'barcode', 'global_unique_id'] as const)(
		'adds a local product resident only in the engine database via payload.%s',
		async (field) => {
			const resident = productDocument();
			delete resident.payload.barcode;
			resident.payload[field] = '  ABC  ';
			engineProducts.push(resident);
			renderBarcodeHook();

			await act(async () => scan(' ABC '));

			expect(mockFetcher).not.toHaveBeenCalled();
			expect(mockAddProduct).toHaveBeenCalledTimes(1);
			const [product] = mockAddProduct.mock.calls[0] ?? [];
			expect(product.id).toBe(41);
			expect(product.name).toBe('Keyboard');
			expect(product.stock_status).toBe('instock');
			expect(product.collection.name).toBe('products');
			expect(product.isInstanceOfRxDocument).toBe(true);
			expect(product.getLatest().toMutableJSON()).toMatchObject({ id: 41, name: 'Keyboard' });
			expect(mockClearSearch).toHaveBeenCalledTimes(1);
			expect(mockSetSearch).not.toHaveBeenCalled();
		}
	);

	it('degrades an absent active engine scope to an online lookup', async () => {
		mockEngineActive.mockReturnValue(null);
		mockFetcher.mockResolvedValue(onlineResponse());
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockFetcher).toHaveBeenCalledTimes(1);
		expect(mockAddProduct).not.toHaveBeenCalled();
		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: 'common.product_not_found_online' } })
		);
	});

	it('resolves a local variation parent from the engine database', async () => {
		engineProducts.push(productDocument(41, 'PARENT'));
		engineVariations.push(variationDocument());
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockFetcher).not.toHaveBeenCalled();
		expect(mockEngineRequire).not.toHaveBeenCalled();
		expect(mockAddVariation).toHaveBeenCalledTimes(1);
		const [variation, parent, metaData] = mockAddVariation.mock.calls[0] ?? [];
		expect(variation.id).toBe(51);
		expect(variation.isInstanceOfRxDocument).toBe(true);
		expect(parent.id).toBe(41);
		expect(parent.isInstanceOfRxDocument).toBe(true);
		expect(metaData).toEqual([{ attr_id: 7, display_key: 'Colour', display_value: 'Black' }]);
	});

	it('does not add an unsellable managed variation when out-of-stock items are hidden', async () => {
		mockShowOutOfStock = false;
		engineProducts.push(productDocument(41, 'PARENT'));
		const variation = variationDocument();
		variation.payload.manage_stock = true;
		(variation as { stockQuantity?: number }).stockQuantity = 0;
		variation.stockStatus = 'instock';
		variation.payload.backorders = 'no';
		engineVariations.push(variation);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockAddVariation).not.toHaveBeenCalled();
		expect(mockBarcodeLogger.warn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				toast: { text2: 'pos_products.out_of_stock:{"name":"Keyboard / Black"}' },
			})
		);
	});

	it('adds an on-backorder variation when out-of-stock items are hidden', async () => {
		mockShowOutOfStock = false;
		engineProducts.push(productDocument(41, 'PARENT'));
		const variation = variationDocument();
		variation.stockStatus = 'onbackorder';
		engineVariations.push(variation);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockAddVariation).toHaveBeenCalledTimes(1);
		expect(mockBarcodeLogger.warn).not.toHaveBeenCalled();
	});

	it('does not report success when a product add is blocked', async () => {
		engineProducts.push(productDocument());
		mockAddProduct.mockResolvedValueOnce(false);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockAddProduct).toHaveBeenCalledTimes(1);
		expect(mockBarcodeLogger.success).not.toHaveBeenCalled();
		expect(mockClearSearch).not.toHaveBeenCalled();
	});

	it('does not report success when a variation add is blocked', async () => {
		engineProducts.push(productDocument(41, 'PARENT'));
		engineVariations.push(variationDocument());
		mockAddVariation.mockResolvedValueOnce(false);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockAddVariation).toHaveBeenCalledTimes(1);
		expect(mockBarcodeLogger.success).not.toHaveBeenCalled();
		expect(mockClearSearch).not.toHaveBeenCalled();
	});

	it('target-requires a missing parent for a local variation before adding it', async () => {
		const parent = productDocument(41, 'PARENT');
		engineVariations.push(variationDocument());
		mockEngineRequire.mockImplementation(() => {
			engineProducts.push(parent);
			return {
				ready: Promise.resolve({ action: 'fetched', missingRecordIds: [], reason: 'test' }),
				release: jest.fn(),
			};
		});
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockEngineRequire).toHaveBeenCalledWith({
			id: 'barcode:ABC:product:41',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [41],
			forceRefresh: true,
		});
		expect(mockAddVariation).toHaveBeenCalledTimes(1);
		const [variation, addedParent] = mockAddVariation.mock.calls[0] ?? [];
		expect(variation.id).toBe(51);
		expect(addedParent.id).toBe(41);
		expect(mockEngineRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
	});

	it('shows searching-online feedback before the fetch promise resolves', async () => {
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
		product.payload.barcode = 'STALE';
		mockFetcher.mockResolvedValue(
			onlineResponse({ match: { id: 41, type: 'product', parent_id: 0 } })
		);
		engineProducts.push(product);
		mockEngineRequire.mockImplementation(() => {
			product.payload.barcode = 'ABC';
			return {
				ready: Promise.resolve({ action: 'fetched', missingRecordIds: [], reason: 'test' }),
				release: jest.fn(),
			};
		});
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockEngineRequire).toHaveBeenCalledWith({
			id: 'barcode:ABC:product:41',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [41],
			forceRefresh: true,
		});
		expect(mockFindEngineProducts).toHaveBeenCalledTimes(2);
		expect(mockAddProduct).toHaveBeenCalledTimes(1);
		const [addedProduct] = mockAddProduct.mock.calls[0] ?? [];
		expect(addedProduct.id).toBe(41);
		expect(addedProduct.name).toBe('Keyboard');
		expect(addedProduct.isInstanceOfRxDocument).toBe(true);
		expect(mockEngineRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
	});

	it('requires a variation and its parent product before adding the hydrated variation', async () => {
		const parent = productDocument(41, 'PARENT');
		const variation = variationDocument();
		mockFetcher.mockResolvedValue(
			onlineResponse({
				match: { id: 51, type: 'variation', parent_id: 41 },
			})
		);
		mockEngineRequire.mockImplementation(
			(requirement: { collection: 'products' | 'variations' }) => {
				if (requirement.collection === 'products') engineProducts.push(parent);
				if (requirement.collection === 'variations') engineVariations.push(variation);
				return {
					ready: Promise.resolve({ action: 'fetched', missingRecordIds: [], reason: 'test' }),
					release: jest.fn(),
				};
			}
		);
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
		expect(mockAddVariation).toHaveBeenCalledTimes(1);
		const [addedVariation, addedParent, metaData] = mockAddVariation.mock.calls[0] ?? [];
		expect(addedVariation.id).toBe(51);
		expect(addedVariation.isInstanceOfRxDocument).toBe(true);
		expect(addedParent.id).toBe(41);
		expect(addedParent.isInstanceOfRxDocument).toBe(true);
		expect(metaData).toEqual([{ attr_id: 7, display_key: 'Colour', display_value: 'Black' }]);
		for (const result of mockEngineRequire.mock.results) {
			expect(result.value.release).toHaveBeenCalledTimes(1);
		}
	});

	it('falls through to not-found when the targeted records are still absent without escalating again', async () => {
		mockFetcher.mockResolvedValue(
			onlineResponse({ match: { id: 41, type: 'product', parent_id: 0 } })
		);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockFindEngineProducts).toHaveBeenCalledTimes(2);
		expect(mockFetcher).toHaveBeenCalledTimes(1);
		expect(mockEngineRequire).toHaveBeenCalledTimes(1);
		expect(mockAddProduct).not.toHaveBeenCalled();
		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: 'common.product_not_found_online' } })
		);
	});

	it('hydrates non-resident ambiguous products and variations before opening search', async () => {
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
		expect(mockSetSearch).not.toHaveBeenCalled();
		for (const resolve of hydrationResolvers) resolve();
		await act(async () => scanPromise);

		expect(mockSetSearch).toHaveBeenCalledWith('ABC');
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

		expect(mockSetSearch).toHaveBeenCalledWith('ABC');
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
			expect(mockSetSearch).toHaveBeenCalledWith('ABC');
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
		mockFetcher.mockImplementation(fetch);
		renderBarcodeHook();

		await act(async () => scan());

		expect(mockBarcodeLogger.error).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ toast: { text2: message } })
		);
		expect(mockSetSearch).toHaveBeenCalledWith('ABC');
	});
});
