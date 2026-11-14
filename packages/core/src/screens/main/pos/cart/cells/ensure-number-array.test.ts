import { ensureNumberArray } from './ensure-number-array';

it('keeps only real percentages, in order', () => {
	expect(ensureNumberArray('5, 10, x, 0, 150, 15, 20')).toEqual([5, 10, 15, 20]);
	expect(ensureNumberArray([5, 10, 15, 20])).toEqual([5, 10, 15, 20]);
	expect(ensureNumberArray('')).toEqual([]);
});
