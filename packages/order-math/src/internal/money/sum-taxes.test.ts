import { sumItemizedTaxes, sumStoredLineTax, sumTaxes } from './sum-taxes';

describe('Calculate Taxes', () => {
	it('sumStoredLineTax follows the round-at-subtotal setting for stored compound rates', () => {
		const storedPerRate = [0.816016, 0.212164, 1.071429];
		expect(sumStoredLineTax(storedPerRate, 2, true, false)).toBe(2.1);
		expect(sumStoredLineTax(storedPerRate, 2, true, true)).toBe(2.099609);
	});

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

		expect(sumItemizedTaxes({ taxes: [taxes1, taxes2] })).toEqual([
			{ id: 1, total: 2.665 },
			{ id: 2, total: 4 },
		]);
	});
});
