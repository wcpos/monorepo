/**
 * @jest-environment jsdom
 */
import { useQueryRuntime } from '@wcpos/query';
import { catalogDocumentId, remoteIdOrNull } from '@wcpos/sync-core';

import { readStockDocument, resolveStockOwnerId } from './read-stock-document';
import { aggregateExistingCartQuantity, evaluateStockForCartChange } from './stock-guard';

const mockFindOneExec = jest.fn();
const mockFindDocumentsById = jest.fn();

jest.mock('observable-hooks', () => ({ useObservableEagerState: () => true }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useQueryRuntime: () => ({
		engine: {
			active: () => ({
				database: {
					collections: {
						products: {
							findOne: () => ({ exec: mockFindOneExec }),
							storageInstance: { findDocumentsById: mockFindDocumentsById },
						},
						variations: {
							findOne: () => ({ exec: mockFindOneExec }),
							storageInstance: { findDocumentsById: mockFindDocumentsById },
						},
					},
				},
			}),
		},
	}),
	engineCollection: (database: { collections?: Record<string, unknown> } | null, name: string) =>
		database?.collections?.[name] ?? null,
	resolveLegacyField: () => ({ enginePath: 'remoteId' }),
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

	it('blocks a managed product at zero when the backorders field is missing', () => {
		// WooCommerce defaults backorders to 'no' and allows only 'yes'/'notify'
		// — the cart guard must agree with the badge and scan gate, never
		// fail-open on a partial payload (owner ruling 2026-08-20, #1403).
		const { backorders: _omitted, ...withoutBackorders } = managedProduct;
		expect(
			evaluateStockForCartChange({
				product: { ...withoutBackorders, stock_quantity: 0 },
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

	it.each([
		['3', 0],
		['1', 2],
		[1, 2],
		['abc', 3],
		[null, 3],
	])(
		'counts a sibling of 3 net of its _reduced_stock %p as %p',
		(reduced: unknown, expected: number) => {
			expect(
				aggregateExistingCartQuantity({
					lineItems: [
						{ product_id: 10, quantity: 3, meta_data: [{ key: '_reduced_stock', value: reduced }] },
					],
					productId: 10,
					product: { manage_stock: true },
				})
			).toBe(expected);
		}
	);
});

describe('readStockDocument and resolveStockOwnerId', () => {
	const runtime = useQueryRuntime();
	beforeEach(() => {
		jest.clearAllMocks();
		mockFindOneExec.mockResolvedValue(null);
		mockFindDocumentsById.mockResolvedValue([]);
	});

	it.each([
		[true, 11],
		['parent', 10],
		[null, 11],
	] as const)(
		'resolves variation stock ownership for manage_stock=%s',
		async (manageStock, ownerId) => {
			mockFindDocumentsById.mockResolvedValue(
				manageStock === null ? [] : [{ payload: { manage_stock: manageStock } }]
			);
			await expect(resolveStockOwnerId(runtime, 10, 11)).resolves.toBe(ownerId);
		}
	);
	it('a simple product owns its own stock without a read', async () => {
		await expect(resolveStockOwnerId(runtime, 10)).resolves.toBe(10);
		expect(mockFindDocumentsById).not.toHaveBeenCalled();
	});
	it('reads a soft-deleted product tombstone by its catalog id', async () => {
		mockFindDocumentsById.mockResolvedValue([
			{ payload: { id: 1, name: 'Deleted', manage_stock: true, stock_quantity: 0 } },
		]);
		await expect(readStockDocument(runtime, 'products', 1)).resolves.toMatchObject({
			name: 'Deleted',
			stock_quantity: 0,
		});
		expect(mockFindDocumentsById).toHaveBeenCalledWith(
			[catalogDocumentId('product', remoteIdOrNull(1)!)],
			true
		);
	});
	it('returns null when neither a live record nor a tombstone exists', async () => {
		await expect(readStockDocument(runtime, 'variations', 11)).resolves.toBeNull();
	});
});
