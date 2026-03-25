import { getDisplayLabel, isSelectedIn, toggleMultiValue } from './multi-select';

import type { Option } from '../types';

describe('multi-select utils', () => {
	const apple: Option = { value: 'apple', label: 'Apple' };
	const banana: Option = { value: 'banana', label: 'Banana' };
	const cherry: Option = { value: 'cherry', label: 'Cherry' };

	describe('isSelectedIn (single mode)', () => {
		it('returns true when value matches', () => {
			expect(isSelectedIn(apple, 'apple', false)).toBe(true);
		});

		it('returns false when value does not match', () => {
			expect(isSelectedIn(apple, 'banana', false)).toBe(false);
		});

		it('returns false when value is undefined', () => {
			expect(isSelectedIn(undefined, 'apple', false)).toBe(false);
		});
	});

	describe('isSelectedIn (multi mode)', () => {
		it('returns true when value is in array', () => {
			expect(isSelectedIn([apple, banana], 'apple', true)).toBe(true);
		});

		it('returns false when value is not in array', () => {
			expect(isSelectedIn([apple, banana], 'cherry', true)).toBe(false);
		});

		it('returns false when array is undefined', () => {
			expect(isSelectedIn(undefined, 'apple', true)).toBe(false);
		});

		it('returns false when array is empty', () => {
			expect(isSelectedIn([], 'apple', true)).toBe(false);
		});
	});

	describe('toggleMultiValue', () => {
		it('adds item when not selected', () => {
			expect(toggleMultiValue([apple], banana)).toEqual([apple, banana]);
		});

		it('removes item when already selected', () => {
			expect(toggleMultiValue([apple, banana], apple)).toEqual([banana]);
		});

		it('adds to empty array', () => {
			expect(toggleMultiValue([], apple)).toEqual([apple]);
		});

		it('removes last item to empty array', () => {
			expect(toggleMultiValue([apple], apple)).toEqual([]);
		});

		it('does not mutate the original array', () => {
			const original = [apple, banana];
			toggleMultiValue(original, apple);
			expect(original).toEqual([apple, banana]);
		});
	});

	describe('getDisplayLabel', () => {
		it('returns placeholder when no items selected', () => {
			expect(getDisplayLabel([], 'Select...')).toBe('Select...');
		});

		it('returns single label', () => {
			expect(getDisplayLabel([apple], 'Select...')).toBe('Apple');
		});

		it('returns comma-separated labels when they fit', () => {
			expect(getDisplayLabel([apple, banana], 'Select...', 50)).toBe('Apple, Banana');
		});

		it('truncates with +N when labels overflow', () => {
			const items = [apple, banana, cherry];
			expect(getDisplayLabel(items, 'Select...', 15)).toBe('Apple, Banana +1');
		});

		it('shows at least one label even if it exceeds maxLength', () => {
			const longName: Option = { value: '1', label: 'Very Long Category Name' };
			expect(getDisplayLabel([longName, apple], 'Select...', 10)).toBe(
				'Very Long Category Name +1'
			);
		});
	});
});
