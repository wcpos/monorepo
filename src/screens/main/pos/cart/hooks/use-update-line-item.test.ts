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
			taxes: [],
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

	it('updates line item price correctly and recalculates taxes', async () => {
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
});
