import { calcTaxes, sumTaxes, sumItemizedTaxes } from './utils';

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

		const inclusiveTaxes = calcTaxes(9.99, [taxRate], true);
		expect(inclusiveTaxes).toEqual([{ id: 72, total: 1.665 }]);

		const exclusiveTaxes = calcTaxes(9.99, [taxRate], false);
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
		const exclusiveTaxes = calcTaxes(100, taxRates, false);
		expect(exclusiveTaxes).toEqual([
			{ id: 72, total: 5.0 },
			{ id: 17, total: 8.925 },
		]);

		// prices inclusive of tax.
		const inclusiveTaxes = calcTaxes(100, taxRates, true);
		/**
		 * 100 is inclusive of all taxes.
		 *
		 * Compound would be 100 - ( 100 / 1.085 ) = 7.8341.
		 * Next tax would be calced on 100 - 7.8341 = 92.1659.
		 * 92.1659 - ( 92.1659 / 1.05 ) = 4.38885.
		 */
		expect(inclusiveTaxes).toEqual([
			{ id: 17, total: 7.8341 },
			{ id: 72, total: 4.3889 },
		]);
	});

	it('should sum taxes', () => {
		const taxes = [
			{ id: 1, total: 1.665 },
			{ id: 2, total: 2 },
		];
		expect(sumTaxes(taxes)).toEqual(3.665);
	});

	it('should sum itemized taxes', () => {
		const taxes1 = [
			{ id: 1, total: 1.665 },
			{ id: 2, total: 2 },
		];
		const taxes2 = [
			{ id: 1, total: 1 },
			{ id: 2, total: 2 },
		];

		expect(sumItemizedTaxes([taxes1, taxes2])).toEqual([
			{ id: 1, total: 2.665 },
			{ id: 2, total: 4 },
		]);
	});
});
