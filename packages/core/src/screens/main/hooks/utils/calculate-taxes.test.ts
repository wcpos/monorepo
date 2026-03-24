import { calculateTaxes } from './calculate-taxes';

/**
 * https://github.com/woocommerce/woocommerce/blob/trunk/tests/legacy/unit-tests/tax/tax.php
 */
describe('Calculate Taxes', () => {
	it('should calculate the inclusive and exclusive tax', () => {
		const taxRate = {
			id: 72,
			country: 'GB',
			rate: '20.0000',
			name: 'VAT',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: '',
		};

		const inclusiveTaxes = calculateTaxes({
			amount: 9.99,
			rates: [taxRate],
			amountIncludesTax: true,
		});
		expect(inclusiveTaxes).toEqual({ taxes: [{ id: 72, total: 1.665 }], total: 1.665 });

		const exclusiveTaxes = calculateTaxes({
			amount: 9.99,
			rates: [taxRate],
			amountIncludesTax: false,
		});
		expect(exclusiveTaxes).toEqual({ taxes: [{ id: 72, total: 1.998 }], total: 1.998 });
	});

	it('should calculate the compound tax', () => {
		const taxRates = [
			{
				id: 72,
				country: 'CA',
				rate: '5.0000',
				name: 'GST',
				priority: 1,
				compound: false,
				shipping: true,
				order: 1,
				class: '',
			},
			{
				id: 17,
				country: 'CA',
				state: 'QC',
				rate: '8.5000',
				name: 'PST',
				priority: 2,
				compound: true,
				shipping: true,
				order: 2,
				class: '',
			},
		];

		// prices exclusive of tax.
		const exclusiveTaxes = calculateTaxes({
			amount: 100,
			rates: taxRates,
			amountIncludesTax: false,
		});
		expect(exclusiveTaxes).toEqual({
			taxes: [
				{ id: 72, total: 5 },
				{ id: 17, total: 8.925 },
			],
			total: 13.925,
		});

		// prices inclusive of tax.
		const inclusiveTaxes = calculateTaxes({
			amount: 100,
			rates: taxRates,
			amountIncludesTax: true,
		});
		/**
		 * 100 is inclusive of all taxes.
		 *
		 * Compound would be 100 - ( 100 / 1.085 ) = 7.8341.
		 * Next tax would be calced on 100 - 7.8341 = 92.1659.
		 * 92.1659 - ( 92.1659 / 1.05 ) = 4.38885.
		 */
		expect(inclusiveTaxes).toEqual({
			taxes: [
				{ id: 17, total: 7.834101 },
				{ id: 72, total: 4.388852 },
			],
			total: 12.222953,
		});
	});

	describe('dp parameter (price_num_decimals)', () => {
		const vatRate = {
			id: 1,
			country: 'GB',
			rate: '20.0000',
			name: 'VAT',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: '',
		};

		it('dp=0 (JPY): ¥999 exclusive at 10%', () => {
			const rate = { ...vatRate, rate: '10.0000' };
			const result = calculateTaxes({
				amount: 999,
				rates: [rate],
				amountIncludesTax: false,
				dp: 0,
			});
			// 999 * 0.10 = 99.9, rounded to rounding precision (6dp) = 99.9
			expect(result.taxes[0].total).toBe(99.9);
			expect(result.total).toBe(99.9);
		});

		it('dp=0 (JPY): ¥1000 inclusive at 10%', () => {
			const rate = { ...vatRate, rate: '10.0000' };
			const result = calculateTaxes({
				amount: 1000,
				rates: [rate],
				amountIncludesTax: true,
				dp: 0,
			});
			// 1000 - 1000/1.1 = 1000 - 909.0909... = 90.909090...
			// rounded to 6dp = 90.909091
			expect(result.taxes[0].total).toBeCloseTo(90.909091, 5);
		});

		it('dp=3: 9.999 exclusive at 20%', () => {
			const result = calculateTaxes({
				amount: 9.999,
				rates: [vatRate],
				amountIncludesTax: false,
				dp: 3,
			});
			// 9.999 * 0.20 = 1.9998, rounded to 6dp = 1.9998
			expect(result.taxes[0].total).toBe(1.9998);
			expect(result.total).toBe(1.9998);
		});

		it('dp=3: 9.999 inclusive at 20%', () => {
			const result = calculateTaxes({
				amount: 9.999,
				rates: [vatRate],
				amountIncludesTax: true,
				dp: 3,
			});
			// 9.999 - 9.999/1.2 = 9.999 - 8.3325 = 1.6665
			expect(result.taxes[0].total).toBe(1.6665);
		});

		it('dp=4: 9.9999 exclusive at 20%', () => {
			const result = calculateTaxes({
				amount: 9.9999,
				rates: [vatRate],
				amountIncludesTax: false,
				dp: 4,
			});
			// 9.9999 * 0.20 = 1.99998, rounded to 6dp = 1.99998
			expect(result.taxes[0].total).toBe(1.99998);
		});

		it('dp=0 compound taxes (JPY)', () => {
			const rates = [
				{ ...vatRate, id: 1, rate: '5.0000', compound: false, order: 1 },
				{ ...vatRate, id: 2, rate: '8.5000', compound: true, order: 2 },
			];
			const result = calculateTaxes({
				amount: 1000,
				rates,
				amountIncludesTax: false,
				dp: 0,
			});
			// Non-compound: 1000 * 0.05 = 50
			// Compound: (1000 + 50) * 0.085 = 89.25
			expect(result.taxes[0].total).toBe(50);
			expect(result.taxes[1].total).toBe(89.25);
			expect(result.total).toBe(139.25);
		});
	});

	it('BUG: fix shipping calculation', () => {
		const taxRates = [
			{
				id: 72,
				country: 'GB',
				rate: '5.0000',
				name: 'VAT',
				priority: 1,
				compound: true,
				shipping: true,
				order: 1,
				class: 'reduced-rate',
			},
		];

		const exclusiveTaxes = calculateTaxes({
			amount: 100,
			rates: taxRates,
			amountIncludesTax: false,
		});

		expect(exclusiveTaxes).toEqual({
			taxes: [{ id: 72, total: 5 }],
			total: 5,
		});
	});
});
