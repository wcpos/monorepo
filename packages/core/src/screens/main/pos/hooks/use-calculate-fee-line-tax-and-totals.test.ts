/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useFeeLineData } from './use-fee-line-data';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { useCurrentOrder } from '../contexts/current-order';
import { calculateTaxes } from '../../hooks/utils/calculate-taxes';

// Mock the external hooks
jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: jest.fn(),
}));
jest.mock('../../hooks/use-calculate-taxes-from-value', () => ({
	useCalculateTaxesFromValue: jest.fn(),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: jest.fn(),
}));

describe('useCalculateFeeLineTaxAndTotals', () => {
	beforeEach(() => {
		jest.clearAllMocks();

		// Default mock for currentOrder
		(useCurrentOrder as jest.Mock).mockReturnValue({
			currentOrder: {
				getLatest: jest.fn(() => ({
					line_items: [],
				})),
			},
		});
	});

	it('should correctly calculate fee line tax and totals when prices exclude tax', () => {
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 10,
				percent: false,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: false,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			expect(calculatedFeeLine.total).toBe('10');
			expect(calculatedFeeLine.total_tax).toBe('2');
			expect(calculatedFeeLine.taxes).toEqual([
				{
					id: 1,
					total: '2',
				},
			]);
		});
	});

	it('should correctly calculate fee line tax and totals when prices include tax', () => {
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 12,
				percent: false,
				prices_include_tax: true,
				percent_of_cart_total_with_tax: false,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: true,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			// 12 includes tax, so total = 12 - 2 = 10
			expect(calculatedFeeLine.total).toBe('10');
			expect(calculatedFeeLine.total_tax).toBe('2');
		});
	});

	it('should calculate percent-based fee from cart total (excluding tax)', () => {
		(useCurrentOrder as jest.Mock).mockReturnValue({
			currentOrder: {
				getLatest: jest.fn(() => ({
					line_items: [
						{ product_id: 1, total: '100', total_tax: '20' },
						{ product_id: 2, total: '50', total_tax: '10' },
					],
				})),
			},
		});
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 10, // 10% fee
				percent: true,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: false,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			// Cart total = 100 + 50 = 150
			// 10% of 150 = 15
			expect(calculatedFeeLine.total).toBe('15');
			expect(calculatedFeeLine.total_tax).toBe('3');
		});
	});

	it('should calculate percent-based fee from cart total (including tax)', () => {
		(useCurrentOrder as jest.Mock).mockReturnValue({
			currentOrder: {
				getLatest: jest.fn(() => ({
					line_items: [
						{ product_id: 1, total: '100', total_tax: '20' },
						{ product_id: 2, total: '50', total_tax: '10' },
					],
				})),
			},
		});
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 10, // 10% fee
				percent: true,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: true,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			// Cart total with tax = (100 + 20) + (50 + 10) = 180
			// 10% of 180 = 18
			expect(calculatedFeeLine.total).toBe('18');
			expect(calculatedFeeLine.total_tax).toBe('3.6');
		});
	});

	it('should skip items with null product_id when calculating cart total', () => {
		(useCurrentOrder as jest.Mock).mockReturnValue({
			currentOrder: {
				getLatest: jest.fn(() => ({
					line_items: [
						{ product_id: 1, total: '100', total_tax: '20' },
						{ product_id: null, total: '50', total_tax: '10' }, // This should be skipped
					],
				})),
			},
		});
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 10, // 10% fee
				percent: true,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: false,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			// Only first item counts: cart total = 100
			// 10% of 100 = 10
			expect(calculatedFeeLine.total).toBe('10');
			expect(calculatedFeeLine.total_tax).toBe('2');
		});
	});

	it('should handle empty cart for percent-based fee', () => {
		(useCurrentOrder as jest.Mock).mockReturnValue({
			currentOrder: {
				getLatest: jest.fn(() => ({
					line_items: [],
				})),
			},
		});
		(useFeeLineData as jest.Mock).mockReturnValue({
			getFeeLineData: jest.fn(() => ({
				amount: 10, // 10% fee
				percent: true,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: false,
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateFeeLineTaxAndTotals());

		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
		};

		act(() => {
			const calculatedFeeLine = result.current.calculateFeeLineTaxesAndTotals(feeLine);

			// 10% of 0 = 0
			expect(calculatedFeeLine.total).toBe('0');
			expect(calculatedFeeLine.total_tax).toBe('0');
		});
	});
});
