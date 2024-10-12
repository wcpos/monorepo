import { renderHook, act } from '@testing-library/react-hooks';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useLineItemData } from './use-line-item-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';

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

	it('should correctly calculate line item tax and totals when prices include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: true });
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => ({
				total: amount * 0.2, // Simulate 20% tax
				taxes: [{ id: 1, total: amount * 0.2 }],
			})),
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
				price: 80, // Price without tax (100 - 20)
				total: '160', // priceWithoutTax * quantity
				subtotal: '192', // regularPriceWithoutTax * quantity
				total_tax: '40', // total tax for 2 items (20% of 160)
				taxes: [
					{
						id: 1,
						subtotal: '24', // subtotal tax for 192
						total: '40', // total tax for 160
					},
				],
				subtotal_tax: '24',
			});
		});
	});

	it('should correctly calculate when prices do not include tax', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: false });
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => ({
				total: amount * 0.2, // Simulate 20% tax
				taxes: [{ id: 1, total: amount * 0.2 }],
			})),
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

	it('should handle line items without a subtotal', () => {
		// Mocking external hook responses
		(useTaxRates as jest.Mock).mockReturnValue({ pricesIncludeTax: true });
		(useCalculateTaxesFromValue as jest.Mock).mockReturnValue({
			calculateTaxesFromValue: jest.fn(({ amount }) => ({
				total: amount * 0.1, // Simulate 10% tax
				taxes: [{ id: 1, total: amount * 0.1 }],
			})),
		});
		(useLineItemData as jest.Mock).mockReturnValue({
			getLineItemData: jest.fn(() => ({
				price: 150,
				tax_status: 'taxable',
			})),
		});

		const { result } = renderHook(() => useCalculateLineItemTaxAndTotals());

		const lineItem = {
			quantity: 3,
			tax_class: 'reduced-rate',
			// No regular_price, so no subtotal
		};

		act(() => {
			const calculatedItem = result.current.calculateLineItemTaxesAndTotals(lineItem);

			expect(calculatedItem).toEqual({
				quantity: 3,
				tax_class: 'reduced-rate',
				price: 135, // Price without tax (150 - 15)
				total: '405', // priceWithoutTax * quantity
				subtotal: '', // No subtotal as no regular_price was provided
				total_tax: '45', // 10% of total (150 * 3)
				taxes: [
					{
						id: 1,
						subtotal: '', // No subtotal
						total: '45', // total tax for 3 items
					},
				],
				subtotal_tax: undefined,
			});
		});
	});
});
