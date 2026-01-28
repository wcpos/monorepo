/**
 * @jest-environment node
 *
 * Tests for tax rate filtering logic.
 *
 * This is critical business logic for POS tax calculations.
 * The filterTaxRates function filters tax rates based on:
 * - Country match (exact or empty = wildcard)
 * - State match (exact or empty = wildcard)
 * - Postcode match (exact, wildcard *, or range ...)
 * - City match (exact or empty = wildcard)
 * - Priority-based selection (only first match at each priority level)
 * - Tax class grouping (returns one rate per class)
 */
import { filterTaxRates } from './tax-rates.helpers';

// Helper to create mock tax rates
const createTaxRate = (overrides: Partial<ReturnType<typeof createTaxRate>> = {}) => ({
	id: 1,
	country: '',
	state: '',
	postcodes: [] as string[],
	cities: [] as string[],
	rate: '10',
	name: 'Tax',
	priority: 1,
	order: 1,
	class: 'standard',
	compound: false,
	shipping: true,
	...overrides,
});

describe('tax-rates.helpers', () => {
	describe('filterTaxRates', () => {
		describe('basic filtering', () => {
			it('should return empty array for empty input', () => {
				const result = filterTaxRates([]);
				expect(result).toEqual([]);
			});

			it('should return all rates when no location filter is provided', () => {
				const rates = [
					createTaxRate({ id: 1, country: '', state: '' }),
					createTaxRate({ id: 2, country: '', state: '' }),
				];
				// With empty location, rates with empty country/state will match
				// But priority filtering still applies - only first match per priority
				const result = filterTaxRates(rates);
				expect(result.length).toBeGreaterThan(0);
			});

			it('should filter by country', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'US' }),
					createTaxRate({ id: 2, country: 'CA' }),
					createTaxRate({ id: 3, country: '' }), // Matches all countries
				];
				const result = filterTaxRates(rates, 'US');

				// Should match US and empty country rates
				const ids = result.map((r) => r.id);
				expect(ids).toContain(1);
				expect(ids).not.toContain(2);
			});

			it('should be case-insensitive for country', () => {
				const rates = [createTaxRate({ id: 1, country: 'US' })];
				const result = filterTaxRates(rates, 'us');
				expect(result).toHaveLength(1);
			});

			it('should filter by state', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'US', state: 'CA' }),
					createTaxRate({ id: 2, country: 'US', state: 'NY' }),
					createTaxRate({ id: 3, country: 'US', state: '' }), // Matches all states
				];
				const result = filterTaxRates(rates, 'US', 'CA');

				const ids = result.map((r) => r.id);
				expect(ids).toContain(1);
				expect(ids).not.toContain(2);
			});

			it('should be case-insensitive for state', () => {
				const rates = [createTaxRate({ id: 1, country: 'US', state: 'CA' })];
				const result = filterTaxRates(rates, 'US', 'ca');
				expect(result).toHaveLength(1);
			});
		});

		describe('postcode matching', () => {
			it('should match exact postcode', () => {
				const rates = [
					createTaxRate({ id: 1, postcodes: ['90210'] }),
					createTaxRate({ id: 2, postcodes: ['10001'] }),
				];
				const result = filterTaxRates(rates, '', '', '90210');
				expect(result.map((r) => r.id)).toContain(1);
				expect(result.map((r) => r.id)).not.toContain(2);
			});

			it('should match postcode with wildcard (*)', () => {
				const rates = [
					createTaxRate({ id: 1, postcodes: ['902*'] }), // Matches 902xx
					createTaxRate({ id: 2, postcodes: ['100*'] }), // Matches 100xx
				];
				const result = filterTaxRates(rates, '', '', '90210');
				expect(result.map((r) => r.id)).toContain(1);
				expect(result.map((r) => r.id)).not.toContain(2);
			});

			it('should match postcode range (...)', () => {
				const rates = [
					createTaxRate({ id: 1, postcodes: ['90000...90999'] }), // Range
					createTaxRate({ id: 2, postcodes: ['10000...10999'] }),
				];
				const result = filterTaxRates(rates, '', '', '90210');
				expect(result.map((r) => r.id)).toContain(1);
				expect(result.map((r) => r.id)).not.toContain(2);
			});

			it('should normalize postcodes (remove spaces, uppercase)', () => {
				const rates = [createTaxRate({ id: 1, postcodes: ['AB1 2CD'] })];
				const result = filterTaxRates(rates, '', '', 'ab12cd');
				expect(result).toHaveLength(1);
			});

			it('should match empty postcodes array (wildcard)', () => {
				const rates = [createTaxRate({ id: 1, postcodes: [] })];
				const result = filterTaxRates(rates, '', '', '12345');
				expect(result).toHaveLength(1);
			});

			it('should match multiple postcode patterns', () => {
				const rates = [createTaxRate({ id: 1, postcodes: ['90210', '902*', '10000...10999'] })];
				// Should match any of the patterns
				expect(filterTaxRates(rates, '', '', '90210')).toHaveLength(1);
				expect(filterTaxRates(rates, '', '', '90299')).toHaveLength(1);
				expect(filterTaxRates(rates, '', '', '10500')).toHaveLength(1);
				expect(filterTaxRates(rates, '', '', '50000')).toHaveLength(0);
			});
		});

		describe('city matching', () => {
			it('should match exact city', () => {
				const rates = [
					createTaxRate({ id: 1, cities: ['Los Angeles'] }),
					createTaxRate({ id: 2, cities: ['New York'] }),
				];
				const result = filterTaxRates(rates, '', '', '', 'Los Angeles');
				expect(result.map((r) => r.id)).toContain(1);
				expect(result.map((r) => r.id)).not.toContain(2);
			});

			it('should be case-insensitive for city', () => {
				const rates = [createTaxRate({ id: 1, cities: ['Los Angeles'] })];
				const result = filterTaxRates(rates, '', '', '', 'LOS ANGELES');
				expect(result).toHaveLength(1);
			});

			it('should match empty cities array (wildcard)', () => {
				const rates = [createTaxRate({ id: 1, cities: [] })];
				const result = filterTaxRates(rates, '', '', '', 'Any City');
				expect(result).toHaveLength(1);
			});

			it('should match any city in the list', () => {
				const rates = [createTaxRate({ id: 1, cities: ['Los Angeles', 'San Diego', 'San Francisco'] })];
				expect(filterTaxRates(rates, '', '', '', 'San Diego')).toHaveLength(1);
				expect(filterTaxRates(rates, '', '', '', 'Chicago')).toHaveLength(0);
			});
		});

		describe('priority-based filtering', () => {
			it('should return only first match at each priority level', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'US', priority: 1 }),
					createTaxRate({ id: 2, country: 'US', priority: 1 }), // Same priority, should be excluded
					createTaxRate({ id: 3, country: 'US', priority: 2 }), // Different priority
				];
				const result = filterTaxRates(rates, 'US');

				// Should get first match from priority 1 and first from priority 2
				expect(result).toHaveLength(2);
				expect(result.map((r) => r.id)).toContain(1);
				expect(result.map((r) => r.id)).not.toContain(2);
				expect(result.map((r) => r.id)).toContain(3);
			});

			it('should sort by priority, then order, then id', () => {
				const rates = [
					createTaxRate({ id: 3, country: 'US', priority: 2, order: 1 }),
					createTaxRate({ id: 1, country: 'US', priority: 1, order: 2 }),
					createTaxRate({ id: 2, country: 'US', priority: 1, order: 1 }),
				];
				const result = filterTaxRates(rates, 'US');

				// First match at priority 1 (after sorting by order) should be id 2
				// First match at priority 2 should be id 3
				expect(result).toHaveLength(2);
				expect(result[0].id).toBe(2); // priority 1, order 1
				expect(result[1].id).toBe(3); // priority 2, order 1
			});
		});

		describe('tax class grouping', () => {
			it('should return one rate per tax class', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'US', class: 'standard' }),
					createTaxRate({ id: 2, country: 'US', class: 'reduced' }),
					createTaxRate({ id: 3, country: 'US', class: 'zero' }),
				];
				const result = filterTaxRates(rates, 'US');

				expect(result).toHaveLength(3);
				const classes = result.map((r) => r.class);
				expect(classes).toContain('standard');
				expect(classes).toContain('reduced');
				expect(classes).toContain('zero');
			});

			it('should handle multiple rates in same class with priority', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'US', class: 'standard', priority: 1 }),
					createTaxRate({ id: 2, country: 'US', class: 'standard', priority: 1 }),
					createTaxRate({ id: 3, country: 'CA', class: 'standard', priority: 1 }),
				];
				const result = filterTaxRates(rates, 'US');

				// Only first match for standard class in US
				const standardRates = result.filter((r) => r.class === 'standard');
				expect(standardRates).toHaveLength(1);
				expect(standardRates[0].id).toBe(1);
			});
		});

		describe('combined filtering', () => {
			it('should filter by all criteria combined', () => {
				const rates = [
					createTaxRate({
						id: 1,
						country: 'US',
						state: 'CA',
						postcodes: ['90*'],
						cities: ['Los Angeles'],
					}),
					createTaxRate({
						id: 2,
						country: 'US',
						state: 'CA',
						postcodes: ['90*'],
						cities: ['San Diego'],
					}),
					createTaxRate({
						id: 3,
						country: 'US',
						state: 'NY',
						postcodes: ['100*'],
						cities: ['New York'],
					}),
				];

				const result = filterTaxRates(rates, 'US', 'CA', '90210', 'Los Angeles');
				expect(result).toHaveLength(1);
				expect(result[0].id).toBe(1);
			});

			it('should handle real-world US tax scenario', () => {
				const rates = [
					// Federal (all US)
					createTaxRate({ id: 1, country: 'US', state: '', priority: 1, class: 'standard' }),
					// California state tax
					createTaxRate({ id: 2, country: 'US', state: 'CA', priority: 2, class: 'standard' }),
					// LA County tax
					createTaxRate({
						id: 3,
						country: 'US',
						state: 'CA',
						postcodes: ['90000...90999'],
						priority: 3,
						class: 'standard',
					}),
					// NYC tax (shouldn't match)
					createTaxRate({
						id: 4,
						country: 'US',
						state: 'NY',
						cities: ['New York'],
						priority: 3,
						class: 'standard',
					}),
				];

				const result = filterTaxRates(rates, 'US', 'CA', '90210', 'Los Angeles');

				// Should match federal (priority 1), state (priority 2), and county (priority 3)
				expect(result).toHaveLength(3);
				const ids = result.map((r) => r.id);
				expect(ids).toContain(1);
				expect(ids).toContain(2);
				expect(ids).toContain(3);
				expect(ids).not.toContain(4);
			});
		});

		describe('edge cases', () => {
			it('should handle undefined location params', () => {
				const rates = [createTaxRate({ id: 1, country: '' })];
				// Call with undefined values (should use defaults)
				const result = filterTaxRates(rates, undefined as any, undefined as any);
				expect(result).toHaveLength(1);
			});

			it('should handle rates with missing properties', () => {
				const rates = [
					{
						id: 1,
						country: null,
						state: null,
						postcodes: null,
						cities: null,
						class: 'standard',
						priority: 1,
						order: 1,
					} as any,
				];
				// Should not throw
				expect(() => filterTaxRates(rates, 'US')).not.toThrow();
			});

			it('should return empty array when no rates match', () => {
				const rates = [
					createTaxRate({ id: 1, country: 'CA' }),
					createTaxRate({ id: 2, country: 'GB' }),
				];
				const result = filterTaxRates(rates, 'US');
				expect(result).toEqual([]);
			});
		});
	});
});
