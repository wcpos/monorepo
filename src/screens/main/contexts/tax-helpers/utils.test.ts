import {
	calculateTaxes,
	sumTaxes,
	sumItemizedTaxes,
	calculateDisplayValues,
	calculateLineItemTotals,
	calculateOrderTotalsAndTaxes,
} from './utils';

/**
 * https://github.com/woocommerce/woocommerce/blob/trunk/tests/legacy/unit-tests/tax/tax.php
 */
describe('Calculate Taxes', () => {
	it('should calculate the inclusive and exclusive tax', () => {
		const taxRate = {
			id: '72',
			country: 'GB',
			rate: '20.0000',
			name: 'VAT',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: '',
		};

		// @ts-ignore
		const inclusiveTaxes = calculateTaxes(9.99, [taxRate], true);
		expect(inclusiveTaxes).toEqual([{ id: '72', total: '1.665' }]);

		// @ts-ignore
		const exclusiveTaxes = calculateTaxes(9.99, [taxRate], false);
		expect(exclusiveTaxes).toEqual([{ id: '72', total: '1.998' }]);
	});

	it('should calculate the compound tax', () => {
		const taxRates = [
			{
				id: '72',
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
				id: '17',
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
		// @ts-ignore
		const exclusiveTaxes = calculateTaxes(100, taxRates, false);
		expect(exclusiveTaxes).toEqual([
			{ id: '72', total: '5' },
			{ id: '17', total: '8.925' },
		]);

		// prices inclusive of tax.
		// @ts-ignore
		const inclusiveTaxes = calculateTaxes(100, taxRates, true);
		/**
		 * 100 is inclusive of all taxes.
		 *
		 * Compound would be 100 - ( 100 / 1.085 ) = 7.8341.
		 * Next tax would be calced on 100 - 7.8341 = 92.1659.
		 * 92.1659 - ( 92.1659 / 1.05 ) = 4.38885.
		 */
		expect(inclusiveTaxes).toEqual([
			{ id: '17', total: '7.8341' },
			{ id: '72', total: '4.3889' },
		]);
	});

	it('should sum taxes', () => {
		const taxes = [
			{ id: '1', total: '1.665' },
			{ id: '2', total: '2' },
		];
		expect(sumTaxes(taxes)).toEqual(3.665);
	});

	it('should sum itemized taxes', () => {
		const taxes1 = [
			{ id: '1', total: '1.665' },
			{ id: '2', total: '2' },
		];
		const taxes2 = [
			{ id: '1', total: '1' },
			{ id: '2', total: '2' },
		];

		// @ts-ignore
		expect(sumItemizedTaxes([taxes1, taxes2])).toEqual([
			{ id: '1', total: '2.665' },
			{ id: '2', total: '4' },
		]);
	});

	it('should display calculated values correctly', () => {
		const result = calculateDisplayValues({
			price: '100',
			rates: [
				// @ts-ignore
				{
					id: '72',
					country: 'GB',
					rate: '20.0000',
					name: 'VAT',
					priority: 1,
					compound: false,
					shipping: true,
					order: 1,
					class: '',
				},
			],
			pricesIncludeTax: true,
			taxDisplayShop: 'excl',
			taxRoundAtSubtotal: true,
		});
		expect(result.displayPrice).toBe('83.3333');
		expect(result.taxTotal).toBe('16.6667');
		expect(result.taxDisplayShop).toBe('excl');
	});

	describe('calculateLineItemTotals', () => {
		test('Calculates line item totals correctly with prices including tax', () => {
			const result = calculateLineItemTotals({
				qty: 2,
				price: '100',
				rates: [
					// @ts-ignore
					{
						id: '72',
						country: 'GB',
						rate: '20.0000',
						name: 'VAT',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: '',
					},
				],
				pricesIncludeTax: true,
				taxRoundAtSubtotal: true,
			});

			expect(result.price).toBe(83.333333);
			expect(result.subtotal).toBe('166.666666');
			expect(result.subtotal_tax).toBe('33.333333');
			expect(result.total).toBe('166.666666');
			expect(result.total_tax).toBe('33.333333');
			expect(result.taxes).toEqual([
				{
					id: '72',
					subtotal: '33.333333',
					total: '33.333333',
				},
			]);
		});

		test('Calculates line item totals correctly with prices excluding tax', () => {
			const result = calculateLineItemTotals({
				qty: 2,
				price: '100',
				rates: [
					// @ts-ignore
					{
						id: '72',
						country: 'GB',
						rate: '20.0000',
						name: 'VAT',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: '',
					},
				],
				pricesIncludeTax: false,
				taxRoundAtSubtotal: true,
			});

			expect(result.subtotal).toBe('200');
			expect(result.subtotal_tax).toBe('40');
			expect(result.total).toBe('200');
			expect(result.total_tax).toBe('40');
			expect(result.taxes).toEqual([
				{
					id: '72',
					subtotal: '40',
					total: '40',
				},
			]);
		});

		test('Calculates line item totals with no tax rates', () => {
			const result = calculateLineItemTotals({
				qty: 2,
				price: '100',
				rates: [],
				pricesIncludeTax: false,
				taxRoundAtSubtotal: true,
			});

			expect(result.subtotal).toBe('200');
			expect(result.subtotal_tax).toBe('0');
			expect(result.total).toBe('200');
			expect(result.total_tax).toBe('0');
			expect(result.taxes).toEqual([]);
		});

		test('Match the REST API output', () => {
			const result = calculateLineItemTotals({
				qty: 1,
				price: '19',
				rates: [
					// @ts-ignore
					{
						id: '1',
						label: 'Standard Rate',
						rate: '10.0000',
						class: 'standard',
						priority: 1,
					},
				],
				pricesIncludeTax: true,
				taxRoundAtSubtotal: true,
			});

			expect(result.price).toBe(17.272727);
			expect(result.subtotal).toBe('17.272727');
			expect(result.subtotal_tax).toBe('1.727273');
			expect(result.total).toBe('17.272727');
			expect(result.total_tax).toBe('1.727273');
		});
	});

	describe('calculateOrderTotals', () => {
		test('Calculates order totals correctly', () => {
			const lines = [
				{
					total: '100',
					total_tax: '20',
					taxes: [
						{
							id: '1',
							total: '20',
						},
					],
				},
				{
					total: '200',
					total_tax: '10',
					taxes: [
						{
							id: '2',
							total: '10',
						},
					],
				},
			];

			const result = calculateOrderTotalsAndTaxes({
				// @ts-ignore
				lines,
				taxRoundAtSubtotal: true,
				rates: [
					// @ts-ignore
					{
						id: '1',
						label: 'Standard Rate',
						compound: false,
					},
					// @ts-ignore
					{
						id: '2',
						label: 'Reduced Rate',
						compound: false,
					},
				],
			});

			expect(result.total).toBe('330');
			expect(result.total_tax).toBe('30');
			expect(result.tax_lines).toEqual([
				{
					rate_id: '1',
					label: 'Standard Rate',
					compound: false,
					tax_total: '20',
				},
				{
					rate_id: '2',
					label: 'Reduced Rate',
					compound: false,
					tax_total: '10',
				},
			]);
		});

		test('Calculates order totals with no tax rates', () => {
			const lines = [
				{
					total: '100',
					total_tax: '0',
				},
				{
					total: '200',
					total_tax: '0',
				},
			];

			const result = calculateOrderTotalsAndTaxes({
				// @ts-ignore
				lines,
				taxRoundAtSubtotal: true,
				rates: [],
			});

			expect(result.total).toBe('300');
			expect(result.total_tax).toBe('0');
			expect(result.tax_lines).toEqual([]);
		});

		test('Calculates order totals with empty lines', () => {
			const lines: any[] = [];
			const result = calculateOrderTotalsAndTaxes({
				lines,
				taxRoundAtSubtotal: true,
				rates: [
					// @ts-ignore
					{
						id: '1',
						label: 'Standard Rate',
						compound: false,
					},
					// @ts-ignore
					{
						id: '2',
						label: 'Reduced Rate',
						compound: false,
					},
				],
			});

			expect(result.total).toBe('0');
			expect(result.total_tax).toBe('0');
			expect(result.tax_lines).toEqual([]);
		});

		test('Calculates order totals with multiple tax rates', () => {
			const customRates = [
				// @ts-ignore
				{
					id: '1',
					label: 'Standard Rate',
					compound: false,
				},
				// @ts-ignore
				{
					id: '2',
					label: 'Reduced Rate',
					compound: false,
				},
				{
					id: '3',
					class: 'additional',
					name: 'Additional Rate',
					compound: 'no',
				},
			];
			const lines = [
				{
					total: '100',
					total_tax: '20',
					taxes: [
						{
							id: '1',
							total: '20',
						},
					],
				},
				{
					total: '200',
					total_tax: '15',
					taxes: [
						{
							id: '3',
							total: '15',
						},
					],
				},
			];
			const result = calculateOrderTotalsAndTaxes({
				// @ts-ignore
				lines,
				taxRoundAtSubtotal: true,
				// @ts-ignore
				rates: customRates,
			});

			expect(result.total).toBe('335');
			expect(result.total_tax).toBe('35');
			expect(result.tax_lines).toEqual([
				{
					rate_id: '1',
					label: 'Standard Rate',
					compound: 'no',
					tax_total: '20',
				},
				{
					rate_id: '3',
					label: 'Additional Rate',
					compound: 'no',
					tax_total: '15',
				},
			]);
		});
	});
});
