import { calculateOrderTotals } from './calculate-order-totals';

describe('calculateOrderTotals', () => {
	const mockTaxRates = [
		{ id: '1', name: 'Tax 1', rate: '10', compound: false },
		{ id: '2', name: 'Tax 2', rate: '5', compound: true },
	];

	it('calculates totals correctly for simple line items', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: '1', total: '9' }],
			},
		];
		const shippingLines = [{ total: '10', total_tax: '1', taxes: [{ id: '1', total: '1' }] }];
		const feeLines = [{ total: '5', total_tax: '0.5', taxes: [{ id: '2', total: '0.5' }] }];

		const result = calculateOrderTotals({
			lineItems,
			shippingLines,
			feeLines,
			taxRates: mockTaxRates,
			taxRoundAtSubtotal: false,
		});

		expect(result).toEqual({
			discount_total: '10.00',
			discount_tax: '1.00',
			shipping_total: '10.00',
			shipping_tax: '1.00',
			cart_tax: '11.00',
			total: '106.50',
			total_tax: '11.50',
			tax_lines: expect.arrayContaining([
				expect.objectContaining({ rate_id: 1, tax_total: '10.00', shipping_tax_total: '1.00' }),
				expect.objectContaining({ rate_id: 2, tax_total: '0.50', shipping_tax_total: '0.00' }),
			]),
			subtotal: '100.00',
			subtotal_tax: '10.00',
			fee_total: '5.00',
			fee_tax: '0.50',
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
			discount_total: '0.00',
			discount_tax: '0.00',
			shipping_total: '0.00',
			shipping_tax: '0.00',
			cart_tax: '0.00',
			total: '0.00',
			total_tax: '0.00',
			tax_lines: [],
			subtotal: '0.00',
			subtotal_tax: '0.00',
			fee_total: '0.00',
			fee_tax: '0.00',
		});
	});
});
