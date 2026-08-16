/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useUpdateLineItem } from './use-update-line-item';

// Mock uuid ESM module
jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid-v4'),
}));

// Logger mocks are provided by moduleNameMapper in jest.config.js

// Mock the localPatch function
const mockLocalPatch = jest.fn();
const mockCheckCartStock = jest.fn();
const mockShowBackorderWarning = jest.fn();
let mockLineItemQuantity = 1;

jest.mock('./use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({
		stockGuardEnabled: true,
		checkCartStock: mockCheckCartStock,
		showBackorderWarning: mockShowBackorderWarning,
	}),
}));

// Lets a test simulate the cashier switching order tabs between calls to getCurrentOrder().
// Named `mock*` so jest allows the factory below to close over it.
let mockSwitchedOrder: { uuid: string; getLatest: () => unknown } | null = null;
let mockGetCurrentOrderCalls = 0;

// Mock useCurrentOrder / useCurrentOrderActions.
// The hook now resolves the order at event time via `getCurrentOrder()` rather than
// subscribing during render, so the mock exposes both against the same fixture.
jest.mock('../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({
		getCurrentOrder: () => {
			// The FIRST read is the capture at press time and must see the real order. Any
			// later read models the cashier having switched tabs in the meantime — which the
			// hook must not consume.
			mockGetCurrentOrderCalls += 1;
			if (mockSwitchedOrder && mockGetCurrentOrderCalls > 1) {
				return mockSwitchedOrder;
			}
			return jest.requireMock('../contexts/current-order').useCurrentOrder().currentOrder;
		},
		setCurrentOrderID: jest.fn(),
	}),
	useCurrentOrder: () => ({
		currentOrder: {
			getLatest: () => ({
				toMutableJSON: () => ({
					line_items: [
						{
							meta_data: [
								{
									key: '_woocommerce_pos_uuid',
									value: '5aa605ce-325e-47c8-96a9-fef1c55ea5b7',
								},
							],
						},
						{
							name: 'Item 1',
							product_id: 1,
							variation_id: 0,
							quantity: mockLineItemQuantity,
							price: 10,
							subtotal: '10',
							total: '10',
							meta_data: [
								{
									key: '_woocommerce_pos_uuid',
									value: '23e108ca-63a7-469a-ad12-ed72e0d04be3',
								},
								{
									key: '_woocommerce_pos_data',
									value: JSON.stringify({
										price: 10,
										regular_price: 10,
										tax_status: 'taxable',
									}),
								},
							],
						},
						{
							meta_data: [
								{
									key: '_woocommerce_pos_uuid',
									value: 'f5e3c8d3-7d6d-4a3b-8c1d-0c2a0d1b3c8d',
								},
							],
						},
					],
				}),
			}),
		},
	}),
}));

// Mock useLocalMutation
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	documentRecordId: () => 'order-uuid',
	useLocalMutation: () => ({
		localPatch: mockLocalPatch,
	}),
}));

// Mock useCalculateLineItemTaxAndTotals
jest.mock('./use-calculate-line-item-tax-and-totals', () => ({
	useCalculateLineItemTaxAndTotals: () => ({
		calculateLineItemTaxesAndTotals: jest.fn().mockImplementation((lineItem) => {
			const quantity = lineItem.quantity ?? 1;
			const price = lineItem.price ?? 10;
			const total = price * quantity;
			const tax = total * 0.1;
			return {
				...lineItem,
				price,
				subtotal: String(total),
				total: String(total),
				subtotal_tax: String(tax),
				total_tax: String(tax),
				taxes: [{ id: '1', subtotal: String(tax), total: String(tax) }],
			};
		}),
	}),
}));

// Mock useLineItemData
jest.mock('./use-line-item-data', () => ({
	useLineItemData: () => ({
		getLineItemData: jest.fn().mockImplementation((lineItem) => {
			const posDataMeta = lineItem.meta_data?.find((m: any) => m.key === '_woocommerce_pos_data');
			if (posDataMeta) {
				return JSON.parse(posDataMeta.value);
			}
			return { price: 10, regular_price: 10, tax_status: 'taxable' };
		}),
	}),
}));

describe('useUpdateLineItem', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSwitchedOrder = null;
		mockGetCurrentOrderCalls = 0;
		mockLocalPatch.mockResolvedValue({ changes: {} });
		mockLineItemQuantity = 1;
		mockCheckCartStock.mockResolvedValue({
			allowed: true,
			warning: null,
			available: 10,
			name: 'Item 1',
		});
	});

	it('allows a quantity decrease without evaluating stock', async () => {
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: 0.5 });
		});

		expect(mockCheckCartStock).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalled();
	});

	it('does not mutate a blocked quantity increase', async () => {
		mockCheckCartStock.mockResolvedValue({
			allowed: false,
			warning: null,
			available: 1,
			name: 'Item 1',
		});
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: 2 });
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
	});

	it('warns about a backorder after mutating an allowed increase', async () => {
		mockCheckCartStock.mockResolvedValue({
			allowed: true,
			warning: 'backorder',
			available: 1,
			name: 'Item 1',
		});
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: 2 });
		});

		expect(mockLocalPatch).toHaveBeenCalled();
		expect(mockShowBackorderWarning).toHaveBeenCalledWith('Item 1');
		expect(mockShowBackorderWarning.mock.invocationCallOrder[0]).toBeGreaterThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
	});

	it('atomically increments overlapping additions against the latest quantity', async () => {
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: { quantity?: number }[] } }) => {
				mockLineItemQuantity = data.line_items[1]?.quantity ?? mockLineItemQuantity;
				return { changes: data };
			}
		);
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		await act(async () => {
			await Promise.all([
				result.current.incrementLineItem(uuid, 1),
				result.current.incrementLineItem(uuid, 1),
			]);
		});

		expect(mockLocalPatch.mock.calls.map(([args]) => args.data.line_items[1].quantity)).toEqual([
			2, 3,
		]);
	});

	it('updates line item name correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newName = 'New Item Name';

		await act(async () => {
			await result.current.updateLineItem(uuid, { name: newName });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							name: newName,
						}),
					]),
				}),
			})
		);
	});

	it('updates line item quantity correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 3;

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							quantity: newQuantity,
						}),
					]),
				}),
			})
		);
	});

	it('updates line item price correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newPrice = 20;

		await act(async () => {
			await result.current.updateLineItem(uuid, { price: newPrice });
		});

		// Verify localPatch was called with the correct line item
		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([
								expect.objectContaining({ value: uuid }),
								// Verify price was updated in pos_data metadata (typed object, not JSON string)
								expect.objectContaining({
									key: '_woocommerce_pos_data',
									value: expect.objectContaining({ price: newPrice }),
								}),
							]),
						}),
					]),
				}),
			})
		);
	});

	it('persists searchable before-and-after values for quantity changes', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		await act(async () => {
			await result.current.updateLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3', {
				quantity: 3,
			});
		});

		expect(getLogger([]).info).toHaveBeenCalledWith(
			'Cart line item updated',
			expect.objectContaining({
				context: expect.objectContaining({
					event: 'cart.line-item.updated',
					productName: 'Item 1',
					previousQuantity: 1,
					quantity: 3,
				}),
			})
		);
	});

	it('persists searchable before-and-after values for price changes', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		await act(async () => {
			await result.current.updateLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3', {
				price: 20,
			});
		});

		expect(getLogger([]).info).toHaveBeenCalledWith(
			'Cart line item updated',
			expect.objectContaining({
				context: expect.objectContaining({ previousPrice: 10, price: 20 }),
			})
		);
	});

	it('updates subtotal and total when quantity is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 7;

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							quantity: 7,
							price: 10,
							subtotal: '70',
							total: '70',
						}),
					]),
				}),
			})
		);
	});

	it('updates taxes when quantity is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 7;

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							quantity: 7,
							price: 10,
							subtotal_tax: '7',
							total_tax: '7',
							taxes: [
								{
									id: '1',
									subtotal: '7',
									total: '7',
								},
							],
						}),
					]),
				}),
			})
		);
	});

	it('updates taxes when price is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newPrice = 20;

		await act(async () => {
			await result.current.updateLineItem(uuid, { price: newPrice });
		});

		// Verify localPatch was called and the line item has tax calculations
		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							quantity: 1,
							// Taxes should be calculated (values depend on mock implementation)
							subtotal_tax: expect.any(String),
							total_tax: expect.any(String),
							taxes: expect.arrayContaining([
								expect.objectContaining({
									id: '1',
								}),
							]),
						}),
					]),
				}),
			})
		);
	});

	/**
	 * Regression for a P1 found in review of the event-time refactor.
	 *
	 * These mutations are queued, so execution can land long after the press. If the callback
	 * resolved `getCurrentOrder()` at EXECUTION time, a cashier switching order tabs while a
	 * mutation was still queued would have the edit applied against the wrong order — the
	 * queue is keyed by the order captured at enqueue time, so the edit lands in the new order
	 * or is silently dropped when its line is not found there.
	 *
	 * The order must be captured at press time and threaded through.
	 */
	it('applies the edit to the order captured at press time, not the one selected later', async () => {
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		// The cashier switches tabs: the NEXT getCurrentOrder() would hand back a different
		// order, one that does not contain this line at all.
		mockSwitchedOrder = {
			uuid: 'a-different-order',
			getLatest: () => ({ toMutableJSON: () => ({ line_items: [] }) }),
		};

		await act(async () => {
			await result.current.updateLineItem(uuid, { quantity: 5 });
		});

		// The patch still went to the original order and still found the line.
		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					line_items: expect.arrayContaining([
						expect.objectContaining({
							meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
							quantity: 5,
						}),
					]),
				}),
			})
		);
	});
});
