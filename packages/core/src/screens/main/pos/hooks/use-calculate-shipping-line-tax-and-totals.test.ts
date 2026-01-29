/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';
import { useShippingLineData } from './use-shipping-line-data';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { calculateTaxes } from '../../hooks/utils/calculate-taxes';

// Mock the external hooks
jest.mock('./use-shipping-line-data', () => ({
	useShippingLineData: jest.fn(),
}));
jest.mock('../../hooks/use-calculate-taxes-from-value', () => ({
	useCalculateTaxesFromValue: jest.fn(),
}));

describe('useCalculateShippingLineTaxAndTotals', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should correctly calculate shipping line tax and totals when prices exclude tax', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 10,
				prices_include_tax: false,
				tax_status: 'taxable',
				tax_class: 'standard',
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

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Flat Rate',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.total).toBe('10');
			expect(calculatedShippingLine.total_tax).toBe('2');
			expect(calculatedShippingLine.taxes).toEqual([
				{
					id: 1,
					total: '2',
				},
			]);
		});
	});

	it('should correctly calculate shipping line tax and totals when prices include tax', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 12,
				prices_include_tax: true,
				tax_status: 'taxable',
				tax_class: 'standard',
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

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Flat Rate',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			// 12 includes tax, so total = 12 - 2 = 10
			expect(calculatedShippingLine.total).toBe('10');
			expect(calculatedShippingLine.total_tax).toBe('2');
		});
	});

	it('should handle zero shipping amount', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 0,
				prices_include_tax: false,
				tax_status: 'taxable',
				tax_class: 'standard',
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

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Free Shipping',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.total).toBe('0');
			expect(calculatedShippingLine.total_tax).toBe('0');
		});
	});

	it('should handle non-taxable shipping', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 10,
				prices_include_tax: false,
				tax_status: 'none',
				tax_class: '',
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(() => ({
				total: 0,
				taxes: [],
			})),
		});

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Flat Rate',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.total).toBe('10');
			expect(calculatedShippingLine.total_tax).toBe('0');
			expect(calculatedShippingLine.taxes).toEqual([]);
		});
	});

	it('should handle multiple tax rates', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 100,
				prices_include_tax: false,
				tax_status: 'taxable',
				tax_class: 'standard',
			})),
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => {
				return calculateTaxes({
					amount,
					rates: [
						{ id: 1, rate: '10.0000', compound: false, order: 1 },
						{ id: 2, rate: '5.0000', compound: false, order: 2 },
					],
					amountIncludesTax: false,
				});
			}),
		});

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Express Shipping',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.total).toBe('100');
			expect(calculatedShippingLine.total_tax).toBe('15');
			expect(calculatedShippingLine.taxes).toHaveLength(2);
			expect(calculatedShippingLine.taxes[0]).toEqual({ id: 1, total: '10' });
			expect(calculatedShippingLine.taxes[1]).toEqual({ id: 2, total: '5' });
		});
	});

	it('should preserve original shipping line properties', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 10,
				prices_include_tax: false,
				tax_status: 'taxable',
				tax_class: 'standard',
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

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_id: 'flat_rate',
			method_title: 'Flat Rate',
			instance_id: '1',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.method_id).toBe('flat_rate');
			expect(calculatedShippingLine.method_title).toBe('Flat Rate');
			expect(calculatedShippingLine.instance_id).toBe('1');
		});
	});

	it('should handle decimal shipping amounts', () => {
		(useShippingLineData as jest.Mock).mockReturnValue({
			getShippingLineData: jest.fn(() => ({
				amount: 9.99,
				prices_include_tax: false,
				tax_status: 'taxable',
				tax_class: 'standard',
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

		const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

		const shippingLine = {
			method_title: 'Standard Shipping',
		};

		act(() => {
			const calculatedShippingLine =
				result.current.calculateShippingLineTaxesAndTotals(shippingLine);

			expect(calculatedShippingLine.total).toBe('9.99');
			expect(calculatedShippingLine.total_tax).toBe('1.998');
		});
	});
});
