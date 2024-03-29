import { renderHook, act } from '@testing-library/react-hooks';
import { of } from 'rxjs';

import { useUpdateLineItem } from './use-update-line-item';

jest.mock('../../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			tax_display_cart$: of('excl'), // Emits 'excl' immediately
		},
	}),
}));

jest.mock('../../../contexts/tax-helpers', () => ({
	useTaxHelpers: () => ({
		calculateTaxesFromPrice: jest.fn().mockImplementation(({ price }) => ({
			total: price * 0.1, // Simplified tax calculation for testing
			taxes: [
				{
					id: '1',
					subtotal: price * 0.1,
					total: price * 0.1,
				},
			],
		})),
	}),
}));

const mockIncrementalPatch = jest.fn();

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			getLatest: () => ({
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
						],
					},
					{
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: 'f5e3c8d3-7d6d-4a3b-8c1d-0c2a0d1b3c8d' },
						],
					},
				],
				incrementalPatch: mockIncrementalPatch,
			}),
		},
	}),
}));

describe('useUpdateLineItem', () => {
	it('updates line item name correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newName = 'New Item Name';

		await act(async () => {
			await result.current.updateLineItem(uuid, { name: newName });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
						name: newName,
					}),
				]),
			})
		);
	});

	it('updates line item quantity correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		// Mock UUID and quantity change
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 3;

		await act(async () => {
			result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
						quantity: newQuantity,
					}),
				]),
			})
		);
	});

	it('updates line item price correctly', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		// Mock UUID and price change
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newPrice = '20.00';

		await act(async () => {
			result.current.updateLineItem(uuid, { price: newPrice });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
						price: parseFloat(newPrice),
					}),
				]),
			})
		);
	});

	it('updates subtotal and total when quantity is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		// Mock UUID and price change
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 7;

		await act(async () => {
			result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
						quantity: 7,
						price: 10,
						subtotal: '70',
						total: '70',
					}),
				]),
			})
		);
	});

	it('updates taxes when quantity is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		// Mock UUID and price change
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newQuantity = 7;

		await act(async () => {
			result.current.updateLineItem(uuid, { quantity: newQuantity });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
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
			})
		);
	});

	it('updates taxes when price is changed', async () => {
		const { result } = renderHook(() => useUpdateLineItem());

		// Mock UUID and price change
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const newPrice = '20.00';

		await act(async () => {
			result.current.updateLineItem(uuid, { price: newPrice });
		});

		expect(mockIncrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						meta_data: expect.arrayContaining([expect.objectContaining({ value: uuid })]),
						quantity: 1,
						price: 20,
						subtotal_tax: '1', // subtotal stays the same
						total_tax: '2',
						taxes: [
							{
								id: '1',
								subtotal: '1',
								total: '2',
							},
						],
					}),
				]),
			})
		);
	});
});
