import { filterTaxRates } from '../src/hooks/tax-rates.helpers';

const makeTaxRate = (overrides = {}) => ({
	id: 1,
	country: '',
	state: '',
	postcodes: [],
	cities: [],
	rate: '10',
	name: 'Tax',
	priority: 1,
	compound: false,
	shipping: true,
	order: 1,
	class: 'standard',
	label: 'Tax',
	...overrides,
});

describe('tax-rates.helpers', () => {
	describe('filterTaxRates', () => {
		it('should return one rate per priority within same class', () => {
			// Same class + same priority = only first match returned
			const rates = [makeTaxRate({ id: 1 }), makeTaxRate({ id: 2 })] as any[];
			expect(filterTaxRates(rates)).toHaveLength(1);
		});

		it('should filter by country', () => {
			const rates = [
				makeTaxRate({ id: 1, country: 'US' }),
				makeTaxRate({ id: 2, country: 'GB' }),
			] as any[];
			const result = filterTaxRates(rates, 'US');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should match rates with empty country (wildcard)', () => {
			const rates = [
				makeTaxRate({ id: 1, country: '' }),
				makeTaxRate({ id: 2, country: 'US' }),
			] as any[];
			const result = filterTaxRates(rates, 'GB');
			expect(result.some((r: any) => r.id === 1)).toBe(true);
		});

		it('should filter by state', () => {
			const rates = [
				makeTaxRate({ id: 1, country: 'US', state: 'CA' }),
				makeTaxRate({ id: 2, country: 'US', state: 'NY' }),
			] as any[];
			const result = filterTaxRates(rates, 'US', 'CA');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should be case insensitive for country and state', () => {
			const rates = [makeTaxRate({ id: 1, country: 'us', state: 'ca' })] as any[];
			const result = filterTaxRates(rates, 'US', 'CA');
			expect(result).toHaveLength(1);
		});

		it('should filter by exact postcode', () => {
			const rates = [
				makeTaxRate({ id: 1, postcodes: ['90210'] }),
				makeTaxRate({ id: 2, postcodes: ['10001'] }),
			] as any[];
			const result = filterTaxRates(rates, '', '', '90210');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should filter by postcode wildcard', () => {
			const rates = [makeTaxRate({ id: 1, postcodes: ['902*'] })] as any[];
			const result = filterTaxRates(rates, '', '', '90210');
			expect(result).toHaveLength(1);
		});

		it('should filter by postcode range', () => {
			const rates = [makeTaxRate({ id: 1, postcodes: ['90000...91000'] })] as any[];
			const result = filterTaxRates(rates, '', '', '90500');
			expect(result).toHaveLength(1);
		});

		it('should filter by city', () => {
			const rates = [
				makeTaxRate({ id: 1, cities: ['Los Angeles'] }),
				makeTaxRate({ id: 2, cities: ['New York'] }),
			] as any[];
			const result = filterTaxRates(rates, '', '', '', 'Los Angeles');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should be case insensitive for city', () => {
			const rates = [makeTaxRate({ id: 1, cities: ['los angeles'] })] as any[];
			const result = filterTaxRates(rates, '', '', '', 'LOS ANGELES');
			expect(result).toHaveLength(1);
		});

		it('should group by class and return one per priority', () => {
			const rates = [
				makeTaxRate({ id: 1, class: 'standard', priority: 1 }),
				makeTaxRate({ id: 2, class: 'standard', priority: 1 }),
			] as any[];
			const result = filterTaxRates(rates);
			// Only first match at priority 1 should be returned
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should return matches from different priorities', () => {
			const rates = [
				makeTaxRate({ id: 1, class: 'standard', priority: 1, country: 'US' }),
				makeTaxRate({ id: 2, class: 'standard', priority: 2, country: 'US' }),
			] as any[];
			const result = filterTaxRates(rates, 'US');
			expect(result).toHaveLength(2);
		});

		it('should handle empty tax rates array', () => {
			expect(filterTaxRates([])).toEqual([]);
		});
	});
});
