/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { aggregateExistingCartQuantity, evaluateStockForCartChange } from './stock-guard';
import { useCartStockGuard } from './use-cart-stock-guard';

const mockFindOneExec = jest.fn();

jest.mock('observable-hooks', () => ({ useObservableEagerState: () => true }));
jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			active: () => ({
				database: {
					collections: {
						products: { findOne: () => ({ exec: mockFindOneExec }) },
						variations: { findOne: () => ({ exec: mockFindOneExec }) },
					},
				},
			}),
		},
	}),
}));
jest.mock('@wcpos/query/engine-compat', () => ({
	resolveLegacyField: () => ({ enginePath: 'wooProductId' }),
	wrapEngineDocument: (_collection: string, document: unknown) => document,
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { prevent_overselling$: {} } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('evaluateStockForCartChange', () => {
	const managedProduct = {
		manage_stock: true,
		stock_quantity: 2,
		stock_status: 'instock',
		backorders: 'no',
	};

	it('allows the managed quantity boundary', () => {
		expect(
			evaluateStockForCartChange({
				product: managedProduct,
				existingCartQuantity: 1,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: true, warning: null, available: 2 });
	});

	it('blocks one unit beyond managed stock', () => {
		expect(
			evaluateStockForCartChange({
				product: managedProduct,
				existingCartQuantity: 2,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: false, warning: null, available: 2 });
	});

	it('blocks a managed product with zero stock', () => {
		expect(
			evaluateStockForCartChange({
				product: { ...managedProduct, stock_quantity: 0 },
				existingCartQuantity: 0,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: false, warning: null, available: 0 });
	});

	it('allows backorders silently', () => {
		expect(
			evaluateStockForCartChange({
				product: { ...managedProduct, backorders: 'yes' },
				existingCartQuantity: 2,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: true, warning: null, available: 2 });
	});

	it('warns for notify backorders', () => {
		expect(
			evaluateStockForCartChange({
				product: { ...managedProduct, backorders: 'notify' },
				existingCartQuantity: 2,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: true, warning: 'backorder', available: 2 });
	});

	it('blocks an unmanaged out-of-stock product without an available quantity', () => {
		expect(
			evaluateStockForCartChange({
				product: { manage_stock: false, stock_status: 'outofstock' },
				existingCartQuantity: 0,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: false, warning: null, available: null });
	});

	it('compares decimal quantities without floating-point boundary errors', () => {
		expect(
			evaluateStockForCartChange({
				product: { ...managedProduct, stock_quantity: 0.3 },
				existingCartQuantity: 0.1,
				requestedQuantity: 0.2,
			})
		).toEqual({ allowed: true, warning: null, available: 0.3 });
	});

	it('uses variation-managed stock instead of parent stock', () => {
		expect(
			evaluateStockForCartChange({
				product: { ...managedProduct, stock_quantity: 100 },
				variation: { ...managedProduct, stock_quantity: 1 },
				existingCartQuantity: 1,
				requestedQuantity: 1,
			})
		).toEqual({ allowed: false, warning: null, available: 1 });
	});
});

describe('aggregateExistingCartQuantity', () => {
	const lineItems = [
		{ product_id: 10, variation_id: 101, quantity: 1.25 },
		{ product_id: 10, variation_id: 101, quantity: 0.75 },
		{ product_id: 10, variation_id: 102, quantity: 3 },
		{ product_id: 10, variation_id: 0, quantity: 1 },
		{ product_id: 11, variation_id: 101, quantity: 20 },
	];

	it('aggregates existing lines for a variation-managed owner', () => {
		expect(
			aggregateExistingCartQuantity({
				lineItems,
				productId: 10,
				variationId: 101,
				product: { manage_stock: true },
				variation: { manage_stock: true },
			})
		).toBe(2);
	});

	it('aggregates two variations when the parent manages stock', () => {
		expect(
			aggregateExistingCartQuantity({
				lineItems,
				productId: 10,
				variationId: 101,
				product: { manage_stock: true },
				variation: { manage_stock: 'parent' },
			})
		).toBe(6);
	});

	it('excludes the edited line from aggregation', () => {
		const items = [
			{
				product_id: 10,
				quantity: 2,
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'edited' }],
			},
			{ product_id: 10, quantity: 1 },
		];

		expect(
			aggregateExistingCartQuantity({
				lineItems: items,
				productId: 10,
				product: { manage_stock: true },
				excludedLineItemUuid: 'edited',
			})
		).toBe(1);
	});
});

describe('useCartStockGuard', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFindOneExec.mockResolvedValue(null);
	});

	it('fails closed when the enabled guard cannot load the product record', async () => {
		const { result } = renderHook(() => useCartStockGuard());
		const stockLogger = getLogger(['wcpos', 'pos', 'cart', 'stock']);
		let stockResult;

		await act(async () => {
			stockResult = await result.current.checkCartStock({
				lineItems: [],
				productId: 10,
				requestedQuantity: 1,
				name: 'Deleted product',
			});
		});

		expect(stockResult).toEqual({
			allowed: false,
			warning: null,
			available: null,
			name: 'Deleted product',
		});
		expect(stockLogger.warn).toHaveBeenCalled();
	});
});
