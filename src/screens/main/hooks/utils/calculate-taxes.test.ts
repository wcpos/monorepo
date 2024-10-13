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
			amountIncludeTax: true,
		});
		expect(inclusiveTaxes).toEqual([{ id: 72, total: 1.665 }]);

		const exclusiveTaxes = calculateTaxes({
			amount: 9.99,
			rates: [taxRate],
			amountIncludeTax: false,
		});
		expect(exclusiveTaxes).toEqual([{ id: 72, total: 1.998 }]);
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
			amountIncludeTax: false,
		});
		expect(exclusiveTaxes).toEqual([
			{ id: 72, total: 5 },
			{ id: 17, total: 8.925 },
		]);

		// prices inclusive of tax.
		const inclusiveTaxes = calculateTaxes({ amount: 100, rates: taxRates, amountIncludeTax: true });
		/**
		 * 100 is inclusive of all taxes.
		 *
		 * Compound would be 100 - ( 100 / 1.085 ) = 7.8341.
		 * Next tax would be calced on 100 - 7.8341 = 92.1659.
		 * 92.1659 - ( 92.1659 / 1.05 ) = 4.38885.
		 */
		expect(inclusiveTaxes).toEqual([
			{ id: 17, total: 7.834101 },
			{ id: 72, total: 4.388852 },
		]);
	});
});
