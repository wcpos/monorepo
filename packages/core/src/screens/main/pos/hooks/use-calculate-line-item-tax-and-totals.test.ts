import { renderHook, act } from '@testing-library/react-hooks';

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
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: false });
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
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: true });
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
				price: 83.333333,
				total: '166.666667',
				total_tax: '33.333333',
				subtotal: '200',
				subtotal_tax: '40',
				taxes: [
					{
						id: 1,
						subtotal: '40',
						total: '33.333333',
					},
				],
			});
		});
	});

	it('should correctly round line item tax and totals when prices include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: true });
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
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: false });
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
});
