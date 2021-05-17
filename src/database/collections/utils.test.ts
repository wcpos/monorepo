import { calcTaxes } from './utils';

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
		expect(inclusiveTaxes).toEqual([{ id: 72, taxAmount: 1.665 }]);

		const exclusiveTaxes = calcTaxes(9.99, [taxRate], false);
		expect(exclusiveTaxes).toEqual([{ id: 72, taxAmount: 1.998 }]);
	});
});
