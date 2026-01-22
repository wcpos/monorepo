/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useUpdateLineItem } from './use-update-line-item';

// Mock uuid ESM module
jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid-v4'),
}));

// Mock @wcpos/utils/logger
jest.mock('@wcpos/utils/logger', () => ({
	__esModule: true,
	default: {
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	},
}));

// Mock @wcpos/utils/logger/error-codes
jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		INVALID_DATA_TYPE: 'INVALID_DATA_TYPE',
	},
}));

// Mock the localPatch function
const mockLocalPatch = jest.fn();

// Mock useCurrentOrder
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			getLatest: () => ({
				toMutableJSON: () => ({
					line_items: [
						{
							meta_data: [
								{ key: '_woocommerce_pos_uuid', value: '5aa605ce-325e-47c8-96a9-fef1c55ea5b7' },
							],
						},
						{
							name: 'Item 1',
							quantity: 1,
							price: 10,
							subtotal: '10',
							total: '10',
							meta_data: [
								{ key: '_woocommerce_pos_uuid', value: '23e108ca-63a7-469a-ad12-ed72e0d04be3' },
								{
									key: '_woocommerce_pos_data',
									value: JSON.stringify({ price: 10, regular_price: 10, tax_status: 'taxable' }),
								},
							],
						},
						{
							meta_data: [
								{ key: '_woocommerce_pos_uuid', value: 'f5e3c8d3-7d6d-4a3b-8c1d-0c2a0d1b3c8d' },
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
								// Verify price was updated in pos_data metadata
								expect.objectContaining({
									key: '_woocommerce_pos_data',
									value: expect.stringContaining(`"price":${newPrice}`),
								}),
							]),
						}),
					]),
				}),
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
});
