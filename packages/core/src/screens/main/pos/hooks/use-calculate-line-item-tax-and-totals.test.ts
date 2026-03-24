/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useLineItemData } from './use-line-item-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { calculateTaxes } from '../../hooks/utils/calculate-taxes';

// Mock the external hooks used within the custom hook
jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: jest.fn(),
}));
jest.mock('../../hooks/use-calculate-taxes-from-value', () => ({
	useCalculateTaxesFromValue: jest.fn(),
}));
jest.mock('./use-line-item-data', () => ({
	useLineItemData: jest.fn(),
}));

describe('useCalculateLineItemTaxAndTotals', () => {
	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks();
	});

	it('should correctly calculate line item tax and totals when prices exclude tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({
			pricesIncludeTax: false,
			priceNumDecimals: 2,
			taxRoundAtSubtotal: false,
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount, amountIncludesTax = false }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax,
				});
			}),
		});
		(useLineItemData as jest.Mock).mockReturnValue({
			getLineItemData: jest.fn(() => ({
				price: 100,
				regular_price: 120,
				tax_status: 'taxable',
			})),
		});

		const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

		const lineItem = {
			quantity: 2,
			tax_class: 'standard',
		};

		act(() => {
			const calculatedItem = result.current.calculateLineItemTaxesAndTotals(lineItem);

			expect(calculatedItem).toEqual({
				quantity: 2,
				tax_class: 'standard',
				price: 100,
				total: '200',
				total_tax: '40',
				subtotal: '240',
				subtotal_tax: '48',
				taxes: [
					{
						id: 1,
						subtotal: '48',
						total: '40',
					},
				],
			});
		});
	});

	it('should correctly calculate line item tax and totals when prices include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({
			pricesIncludeTax: true,
			priceNumDecimals: 2,
			taxRoundAtSubtotal: false,
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount, amountIncludesTax = true }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax,
				});
			}),
		});
		(useLineItemData as jest.Mock).mockReturnValue({
			getLineItemData: jest.fn(() => ({
				price: 100,
				regular_price: 120,
				tax_status: 'taxable',
			})),
		});

		const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

		const lineItem = {
			quantity: 2,
			tax_class: 'standard',
		};

		act(() => {
			const calculatedItem = result.current.calculateLineItemTaxesAndTotals(lineItem);

			expect(calculatedItem).toEqual({
				quantity: 2,
				tax_class: 'standard',
				price: 83.333333, // rounding precision (6dp), not dp
				total: '166.666667', // rounding precision (6dp)
				total_tax: '33.33', // rounded to dp when roundAtSubtotal=false
				subtotal: '200',
				subtotal_tax: '40',
				taxes: [
					{
						id: 1,
						subtotal: '40',
						total: '33.33',
					},
				],
			});
		});
	});

	it('should correctly round line item tax and totals when prices include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({
			pricesIncludeTax: true,
			priceNumDecimals: 2,
			taxRoundAtSubtotal: false,
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount, amountIncludesTax = true }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax,
				});
			}),
		});
		(useLineItemData as jest.Mock).mockReturnValue({
			getLineItemData: jest.fn(() => ({
				price: 25,
				regular_price: 30,
				tax_status: 'taxable',
			})),
		});

		const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

		const lineItem = {
			quantity: 3,
			tax_class: 'standard',
		};

		act(() => {
			const calculatedItem = result.current.calculateLineItemTaxesAndTotals(lineItem);

			expect(calculatedItem).toEqual({
				quantity: 3,
				tax_class: 'standard',
				price: 20.833333,
				total: '62.5',
				subtotal: '75',
				subtotal_tax: '15',
				total_tax: '12.5',
				taxes: [
					{
						id: 1,
						subtotal: '15',
						total: '12.5',
					},
				],
			});
		});
	});

	it('should correctly calculate when prices do not include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({
			pricesIncludeTax: false,
			priceNumDecimals: 2,
			taxRoundAtSubtotal: false,
		});
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount, amountIncludesTax = true }) => {
				return calculateTaxes({
					amount,
					rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
					amountIncludesTax,
				});
			}),
		});
		(useLineItemData as jest.Mock).mockReturnValue({
			getLineItemData: jest.fn(() => ({
				price: 100,
				regular_price: 120,
				tax_status: 'taxable',
			})),
		});

		const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
		};

		act(() => {
			const calculatedItem = result.current.calculateLineItemTaxesAndTotals(lineItem);

			expect(calculatedItem).toEqual({
				quantity: 1,
				tax_class: 'standard',
				price: 100, // Price remains same as prices exclude tax
				total: '100', // price * quantity
				subtotal: '120', // regular_price * quantity
				total_tax: '20', // 20% tax on total (100)
				taxes: [
					{
						id: 1,
						subtotal: '24', // subtotal tax on 120
						total: '20', // total tax on 100
					},
				],
				subtotal_tax: '24',
			});
		});
	});

	describe('dp parameter (price_num_decimals)', () => {
		it('dp=0 (JPY): ¥1000 exclusive at 10%', () => {
			(useTaxRates as jest.Mock).mockReturnValue({
				pricesIncludeTax: false,
				priceNumDecimals: 0,
				taxRoundAtSubtotal: false,
			});
			(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
				calculateTaxesFromValue: jest.fn(({ amount }) => {
					return calculateTaxes({
						amount,
						rates: [{ id: 1, rate: '10.0000', compound: false, order: 1 }],
						amountIncludesTax: false,
						dp: 0,
					});
				}),
			});
			(useLineItemData as jest.Mock).mockReturnValue({
				getLineItemData: jest.fn(() => ({
					price: 1000,
					regular_price: 1200,
					tax_status: 'taxable',
				})),
			});

			const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

			const lineItem = { quantity: 1, tax_class: 'standard' };

			act(() => {
				const calculated = result.current.calculateLineItemTaxesAndTotals(lineItem);

				expect(calculated.price).toBe(1000);
				expect(calculated.total).toBe('1000');
				expect(calculated.subtotal).toBe('1200');
				expect(calculated.total_tax).toBe('100');
				expect(calculated.subtotal_tax).toBe('120');
			});
		});

		it('dp=0 (JPY): ¥999 inclusive at 10%', () => {
			(useTaxRates as jest.Mock).mockReturnValue({
				pricesIncludeTax: true,
				priceNumDecimals: 0,
				taxRoundAtSubtotal: false,
			});
			(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
				calculateTaxesFromValue: jest.fn(({ amount }) => {
					return calculateTaxes({
						amount,
						rates: [{ id: 1, rate: '10.0000', compound: false, order: 1 }],
						amountIncludesTax: true,
						dp: 0,
					});
				}),
			});
			(useLineItemData as jest.Mock).mockReturnValue({
				getLineItemData: jest.fn(() => ({
					price: 999,
					regular_price: 999,
					tax_status: 'taxable',
				})),
			});

			const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

			const lineItem = { quantity: 1, tax_class: 'standard' };

			act(() => {
				const calculated = result.current.calculateLineItemTaxesAndTotals(lineItem);

				// 999/1.1 = 908.181818..., tax = 90.818182 (at 6dp)
				// roundTaxTotal(90.818182, 0, true) = roundHalfDown(90.818182, 0) = 91
				// totalExclTax = 999 - 90.818182 = 908.181818
				// roundHalfUp(908.181818, 6) = 908.181818 (rounding precision, not dp)
				expect(calculated.total_tax).toBe('91');
				expect(calculated.total).toBe('908.181818');
				expect(calculated.price).toBe(908.181818);
			});
		});

		it('dp=3: $9.999 exclusive at 20%', () => {
			(useTaxRates as jest.Mock).mockReturnValue({
				pricesIncludeTax: false,
				priceNumDecimals: 3,
				taxRoundAtSubtotal: false,
			});
			(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
				calculateTaxesFromValue: jest.fn(({ amount }) => {
					return calculateTaxes({
						amount,
						rates: [{ id: 1, rate: '20.0000', compound: false, order: 1 }],
						amountIncludesTax: false,
						dp: 3,
					});
				}),
			});
			(useLineItemData as jest.Mock).mockReturnValue({
				getLineItemData: jest.fn(() => ({
					price: 9.999,
					regular_price: 9.999,
					tax_status: 'taxable',
				})),
			});

			const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

			const lineItem = { quantity: 2, tax_class: 'standard' };

			act(() => {
				const calculated = result.current.calculateLineItemTaxesAndTotals(lineItem);

				// total = 9.999*2 = 19.998
				// tax = 19.998 * 0.2 = 3.9996 at 6dp
				// roundTaxTotal(3.9996, 3, false) = roundHalfUp(3.9996, 3) = 4
				expect(calculated.price).toBe(9.999);
				expect(calculated.total).toBe('19.998');
				expect(calculated.total_tax).toBe('4');
			});
		});
	});
});
