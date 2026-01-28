import { calculateOrderTotals } from './calculate-order-totals';

describe('calculateOrderTotals', () => {
	const mockTaxRates = [
		{ id: 1, name: 'Tax 1', rate: '10', compound: false },
		{ id: 2, name: 'Tax 2', rate: '5', compound: true },
	] as any; // Cast to any for testing with mock data

	describe('basic calculations', () => {
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

		it('handles undefined inputs by using default empty arrays', () => {
			const result = calculateOrderTotals({
				taxRates: mockTaxRates,
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

	describe('parseNumber edge cases', () => {
		it('handles NaN and undefined values by treating them as 0', () => {
			const lineItems = [
				{
					subtotal: 'not-a-number', // isNaN('not-a-number') = true -> 0
					total: NaN, // isNaN(NaN) = true -> 0
					subtotal_tax: undefined, // isNaN(undefined) = true -> 0
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// NaN/undefined values should be treated as 0
			expect(result.subtotal).toBe('0');
			expect(result.total).toBe('0');
			expect(result.subtotal_tax).toBe('0');
			expect(result.total_tax).toBe('0');
			expect(result.discount_total).toBe('0');
		});

		/**
		 * NOTE: There's a subtle bug in parseNumber - isNaN(null) returns false
		 * (because Number(null) = 0), but parseFloat(null) returns NaN.
		 * This test documents current behavior - could be improved later.
		 */
		it('documents current behavior with null (potential improvement)', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: null, // isNaN(null) = false, parseFloat(null) = NaN
					subtotal_tax: '0',
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Current behavior: null becomes NaN in calculations
			// This could be improved by checking for null explicitly
			expect(result.total).toBe('NaN');
		});

		it('handles numeric strings correctly', () => {
			const lineItems = [
				{
					subtotal: '50.5',
					total: '45.5',
					subtotal_tax: '5.05',
					total_tax: '4.55',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('50.5');
			expect(result.total).toBe('50.05'); // total + total_tax
			expect(result.discount_total).toBe('5'); // 50.5 - 45.5
		});
	});

	describe('taxes array handling', () => {
		it('handles line items without taxes array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('100');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles fee lines without taxes array', () => {
			const feeLines = [
				{
					total: '10',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				feeLines: feeLines as any,
				taxRates: mockTaxRates,
			});

			expect(result.fee_total).toBe('10');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles shipping lines without taxes array', () => {
			const shippingLines = [
				{
					total: '15',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			expect(result.shipping_total).toBe('15');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles taxes as null instead of array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					taxes: null,
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Should not throw and should process correctly
			expect(result.subtotal).toBe('100');
		});
	});

	describe('tax lines filtering', () => {
		it('filters out tax lines with zero totals', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '10',
					total_tax: '10',
					taxes: [{ id: 1, total: '10' }], // Only tax rate 1 has tax
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Tax rate 2 should be filtered out (both tax_total and shipping_tax_total are 0)
			expect(result.tax_lines).toHaveLength(1);
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 1,
				tax_total: '10',
			});
		});

		it('includes tax line with only shipping_tax_total', () => {
			const shippingLines = [
				{
					total: '10',
					total_tax: '1',
					taxes: [{ id: 2, total: '1' }], // Tax rate 2 has shipping tax only
				},
			];

			const result = calculateOrderTotals({
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			// Tax rate 2 should be included (has shipping_tax_total)
			expect(result.tax_lines).toHaveLength(1);
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 2,
				shipping_tax_total: '1',
				tax_total: '0',
			});
		});

		it('handles empty tax rates array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [],
			});

			expect(result.tax_lines).toEqual([]);
			expect(result.cart_tax).toBe('0');
		});
	});

	describe('multiple line items aggregation', () => {
		it('aggregates totals from multiple line items', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '90',
					subtotal_tax: '10',
					total_tax: '9',
					taxes: [{ id: 1, total: '9' }],
				},
				{
					subtotal: '50',
					total: '50',
					subtotal_tax: '5',
					total_tax: '5',
					taxes: [{ id: 1, total: '5' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('150'); // 100 + 50
			expect(result.subtotal_tax).toBe('15'); // 10 + 5
			expect(result.discount_total).toBe('10'); // (100-90) + (50-50)
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 1,
				tax_total: '14', // 9 + 5
			});
		});

		it('aggregates totals across line items, fees, and shipping', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '10',
					total_tax: '10',
					taxes: [{ id: 1, total: '10' }],
				},
			];
			const feeLines = [
				{
					total: '5',
					total_tax: '0.5',
					taxes: [{ id: 1, total: '0.5' }],
				},
			];
			const shippingLines = [
				{
					total: '10',
					total_tax: '1',
					taxes: [{ id: 1, total: '1' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				feeLines: feeLines as any,
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			// total = 100 + 5 + 10 = 115
			// total_tax = 10 + 0.5 + 1 = 11.5
			// final total = 115 + 11.5 = 126.5
			expect(result.total).toBe('126.5');
			expect(result.total_tax).toBe('11.5');
			expect(result.cart_tax).toBe('10.5'); // line item tax + fee tax (not shipping)
			expect(result.shipping_tax).toBe('1');
		});
	});

	describe('rounding', () => {
		it('rounds values to 6 decimal places', () => {
			const lineItems = [
				{
					subtotal: '33.333333333',
					total: '33.333333333',
					subtotal_tax: '3.3333333333',
					total_tax: '3.3333333333',
					taxes: [{ id: 1, total: '3.3333333333' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Should be rounded to 6 decimal places
			expect(result.subtotal).toBe('33.333333');
			expect(result.subtotal_tax).toBe('3.333333');
		});
	});
});
