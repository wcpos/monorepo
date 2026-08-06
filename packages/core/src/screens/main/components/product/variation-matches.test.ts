import { getVariationMatchOption } from './variation-matches';

describe('getVariationMatchOption', () => {
	it('resolves the option for the matching attribute identity', () => {
		const matches = [
			{ id: 1, name: 'Color', option: 'Red' },
			{ id: 2, name: 'Size', option: 'Large' },
		];

		expect(getVariationMatchOption(matches, { id: 2, name: 'Size' })).toBe('Large');
		expect(getVariationMatchOption(matches, { id: 2, name: 'Color' })).toBeUndefined();
	});
});
