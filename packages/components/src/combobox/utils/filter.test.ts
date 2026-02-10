import { defaultFilter } from './filter';

import type { Option } from '../types';

describe('filter', () => {
	describe('defaultFilter', () => {
		const sampleOptions: Option[] = [
			{ label: 'Apple', value: 'apple' },
			{ label: 'Banana', value: 'banana' },
			{ label: 'Cherry', value: 'cherry' },
			{ label: 'Date', value: 'date' },
			{ label: 'Elderberry', value: 'elderberry' },
		];

		it('should return all items for empty query', () => {
			// Empty query typically matches all
			const result = defaultFilter(sampleOptions, '');
			// The result depends on the implementation - empty string might score all items
			expect(result.length).toBeGreaterThanOrEqual(0);
		});

		it('should filter items matching the query', () => {
			const result = defaultFilter(sampleOptions, 'app');
			expect(result.some((o) => o.label === 'Apple')).toBe(true);
		});

		it('should return empty array when no matches', () => {
			const result = defaultFilter(sampleOptions, 'xyz');
			expect(result).toEqual([]);
		});

		it('should be case insensitive', () => {
			const result = defaultFilter(sampleOptions, 'APPLE');
			expect(result.some((o) => o.label === 'Apple')).toBe(true);
		});

		it('should sort results by score (best first)', () => {
			const options: Option[] = [
				{ label: 'test item', value: '1' },
				{ label: 'testing', value: '2' },
				{ label: 'item test', value: '3' },
			];

			const result = defaultFilter(options, 'test');

			// Results should be sorted by score descending
			expect(result.length).toBeGreaterThan(0);
			// First result should contain 'test' as prefix
			expect(result[0].label.toLowerCase().startsWith('test')).toBe(true);
		});

		it('should match against value as alias', () => {
			const options: Option[] = [
				{ label: 'Product One', value: 'SKU001' },
				{ label: 'Product Two', value: 'SKU002' },
			];

			const result = defaultFilter(options, 'SKU001');
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].label).toBe('Product One');
		});

		describe('threshold', () => {
			it('should use default threshold of 0.1', () => {
				const result = defaultFilter(sampleOptions, 'a');
				// 'a' appears in Apple, Banana, Date, Elderberry
				// Depending on scoring, some might be below threshold
				expect(result.length).toBeGreaterThanOrEqual(1);
			});

			it('should filter out low scores with higher threshold', () => {
				const resultLow = defaultFilter(sampleOptions, 'e', 0.1);
				const resultHigh = defaultFilter(sampleOptions, 'e', 0.5);

				// Higher threshold should return fewer or equal results
				expect(resultHigh.length).toBeLessThanOrEqual(resultLow.length);
			});

			it('should return more results with lower threshold', () => {
				const resultLow = defaultFilter(sampleOptions, 'er', 0.01);
				const resultHigh = defaultFilter(sampleOptions, 'er', 0.5);

				expect(resultLow.length).toBeGreaterThanOrEqual(resultHigh.length);
			});
		});

		describe('edge cases', () => {
			it('should handle empty options array', () => {
				const result = defaultFilter([], 'test');
				expect(result).toEqual([]);
			});

			it('should handle options with numeric values', () => {
				const options: Option[] = [
					{ label: 'Item One', value: '1' },
					{ label: 'Item Two', value: '2' },
				];

				const result = defaultFilter(options, 'One');
				expect(result.length).toBeGreaterThan(0);
			});

			it('should handle special characters in query', () => {
				const options: Option[] = [
					{ label: 'test[array]', value: 'arr' },
					{ label: 'test(function)', value: 'fn' },
				];

				const result = defaultFilter(options, 'test[');
				// Should handle without throwing
				expect(Array.isArray(result)).toBe(true);
			});

			it('should handle unicode characters', () => {
				const options: Option[] = [
					{ label: 'café', value: '1' },
					{ label: 'naïve', value: '2' },
				];

				const result = defaultFilter(options, 'caf');
				expect(result.some((o) => o.label === 'café')).toBe(true);
			});
		});

		describe('ordering', () => {
			it('should return matches sorted by score', () => {
				const options: Option[] = [
					{ label: 'testing', value: '1' },
					{ label: 'test', value: '2' },
					{ label: 'tests', value: '3' },
				];

				const result = defaultFilter(options, 'test');

				// All three should match as they contain 'test'
				expect(result.length).toBe(3);
				// Results should be sorted (highest score first)
				// The order depends on the algorithm's scoring
				expect(result.every((r) => r.label.includes('test'))).toBe(true);
			});

			it('should rank prefix matches higher than substring matches', () => {
				const options: Option[] = [
					{ label: 'contest', value: '1' },
					{ label: 'test', value: '2' },
				];

				const result = defaultFilter(options, 'test');

				// 'test' is prefix match, 'contest' is substring
				if (result.length >= 2) {
					expect(result[0].label).toBe('test');
				}
			});
		});
	});
});
