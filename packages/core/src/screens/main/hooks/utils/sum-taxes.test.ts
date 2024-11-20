import { sumTaxes, sumItemizedTaxes } from './sum-taxes';

describe('Calculate Taxes', () => {
	it('should sum taxes', () => {
		const taxes = [
			{ id: 1, total: 1.665 },
			{ id: 2, total: 2 },
		];
		expect(sumTaxes({ taxes })).toEqual(3.665);
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

		// @ts-ignore
		expect(sumItemizedTaxes({ taxes: [taxes1, taxes2] })).toEqual([
			{ id: 1, total: 2.665 },
			{ id: 2, total: 4 },
		]);
	});
});
