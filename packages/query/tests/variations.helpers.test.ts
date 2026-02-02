import {
	normalizeVariationAttributes,
	filterVariationsByAttributes,
} from '../src/hooks/variations.helpers';

describe('variations.helpers', () => {
	describe('normalizeVariationAttributes', () => {
		it('should return valid attributes unchanged', () => {
			const attrs = [
				{ name: 'Color', option: 'Red' },
				{ name: 'Size', option: 'Large' },
			];
			expect(normalizeVariationAttributes(attrs)).toEqual(attrs);
		});

		it('should filter out items missing name', () => {
			const attrs = [{ option: 'Red' } as any, { name: 'Size', option: 'Large' }];
			expect(normalizeVariationAttributes(attrs)).toEqual([{ name: 'Size', option: 'Large' }]);
		});

		it('should filter out items missing option', () => {
			const attrs = [{ name: 'Color' } as any, { name: 'Size', option: 'Large' }];
			expect(normalizeVariationAttributes(attrs)).toEqual([{ name: 'Size', option: 'Large' }]);
		});

		it('should filter out items with non-string name or option', () => {
			const attrs = [
				{ name: 123, option: 'Red' } as any,
				{ name: 'Size', option: 456 } as any,
			];
			expect(normalizeVariationAttributes(attrs)).toEqual([]);
		});

		it('should return empty array for non-array input', () => {
			expect(normalizeVariationAttributes(null as any)).toEqual([]);
			expect(normalizeVariationAttributes(undefined as any)).toEqual([]);
		});

		it('should return empty array for empty input', () => {
			expect(normalizeVariationAttributes([])).toEqual([]);
		});
	});

	describe('filterVariationsByAttributes', () => {
		const variations = [
			{ attributes: [{ name: 'Color', option: 'Red' }, { name: 'Size', option: 'Large' }] },
			{ attributes: [{ name: 'Color', option: 'Blue' }, { name: 'Size', option: 'Small' }] },
			{ attributes: [{ name: 'Color', option: 'Red' }, { name: 'Size', option: 'Small' }] },
		] as any[];

		it('should return all variations when no attributes specified', () => {
			expect(filterVariationsByAttributes(variations, [])).toEqual(variations);
		});

		it('should filter by single attribute', () => {
			const result = filterVariationsByAttributes(variations, [
				{ name: 'Color', option: 'Red' },
			]);
			expect(result).toHaveLength(2);
			expect(result[0].attributes[0].option).toBe('Red');
			expect(result[1].attributes[0].option).toBe('Red');
		});

		it('should filter by multiple attributes', () => {
			const result = filterVariationsByAttributes(variations, [
				{ name: 'Color', option: 'Red' },
				{ name: 'Size', option: 'Large' },
			]);
			expect(result).toHaveLength(1);
		});

		it('should return empty when no match', () => {
			const result = filterVariationsByAttributes(variations, [
				{ name: 'Color', option: 'Green' },
			]);
			expect(result).toHaveLength(0);
		});

		it('should treat missing attribute as "any"', () => {
			const variationsWithPartial = [
				{ attributes: [{ name: 'Color', option: 'Red' }] }, // no Size attribute
				{ attributes: [{ name: 'Color', option: 'Red' }, { name: 'Size', option: 'Large' }] },
			] as any[];

			const result = filterVariationsByAttributes(variationsWithPartial, [
				{ name: 'Color', option: 'Red' },
				{ name: 'Size', option: 'Large' },
			]);
			// First variation has no Size so it matches "any" Size
			expect(result).toHaveLength(2);
		});

		it('should handle variations with no attributes', () => {
			const noAttrVariations = [{ attributes: undefined }] as any[];
			const result = filterVariationsByAttributes(noAttrVariations, [
				{ name: 'Color', option: 'Red' },
			]);
			expect(result).toHaveLength(0);
		});
	});
});
