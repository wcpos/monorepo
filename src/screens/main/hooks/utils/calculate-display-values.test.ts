import { calculateDisplayValues } from './calculate-display-values';

describe('Calculate Taxes', () => {
	it('should display calculated values correctly', () => {
		const result = calculateDisplayValues({
			amount: 100,
			rates: [
				{
					id: 72,
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
			amountIncludesTax: true,
			inclOrExcl: 'excl',
		});
		expect(result.displayValue).toBe(83.333333);
		expect(result.taxTotal).toBe(16.666667);
		expect(result.inclOrExcl).toBe('excl');
	});
});
