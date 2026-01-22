import { calculateOrderTotals } from './calculate-order-totals';

describe('calculateOrderTotals', () => {
	const mockTaxRates = [
		{ id: 1, name: 'Tax 1', rate: '10', compound: false },
		{ id: 2, name: 'Tax 2', rate: '5', compound: true },
	] as any; // Cast to any for testing with mock data

	it('calculates totals correctly for simple line items', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: 1, total: '9' }],
			},
		];
		const shippingLines = [{ total: '10', total_tax: '1', taxes: [{ id: 1, total: '1' }] }];
		const feeLines = [{ total: '5', total_tax: '0.5', taxes: [{ id: 2, total: '0.5' }] }];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			shippingLines: shippingLines as any,
			feeLines: feeLines as any,
			taxRates: mockTaxRates,
			taxRoundAtSubtotal: false,
		});

		// Based on implementation logic:
		// - Line item: subtotal=100, total=90, subtotal_tax=10, total_tax=9
		//   discount_total = 100 - 90 = 10, discount_tax = 10 - 9 = 1
		//   taxLines[1].tax_total += 9
		// - Shipping: total=10, total_tax=1
		//   taxLines[1].shipping_tax_total += 1
		// - Fee: total=5, total_tax=0.5
		//   taxLines[2].tax_total += 0.5
		// cart_tax = sumBy(taxLines, 'tax_total') = 9 + 0.5 = 9.5
		// total = 90 + 5 + 10 = 105, total_tax = 9 + 0.5 + 1 = 10.5
		// final total = total + total_tax = 115.5
		expect(result).toEqual({
			discount_total: '10',
			discount_tax: '1',
			shipping_total: '10',
			shipping_tax: '1',
			cart_tax: '9.5',
			total: '115.5',
			total_tax: '10.5',
			tax_lines: expect.arrayContaining([
				expect.objectContaining({ rate_id: 1, tax_total: '9', shipping_tax_total: '1' }),
				expect.objectContaining({ rate_id: 2, tax_total: '0.5', shipping_tax_total: '0' }),
			]),
			subtotal: '100',
			subtotal_tax: '10',
			fee_total: '5',
			fee_tax: '0.5',
		});
	});

	it('handles empty input arrays', () => {
		const result = calculateOrderTotals({
			lineItems: [],
			shippingLines: [],
			feeLines: [],
			taxRates: mockTaxRates,
			taxRoundAtSubtotal: false,
		});

		expect(result).toEqual({
			discount_total: '0',
			discount_tax: '0',
			shipping_total: '0',
			shipping_tax: '0',
			cart_tax: '0',
			total: '0',
			total_tax: '0',
			tax_lines: [],
			subtotal: '0',
			subtotal_tax: '0',
			fee_total: '0',
			fee_tax: '0',
		});
	});
});
