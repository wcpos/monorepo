import { filterVariationsByAttributes } from './query.helpers';

const variations = [
	{
		id: 29,
		attributes: [
			{ id: 1, name: 'Color', option: 'Red' },
			{ id: 0, name: 'Logo', option: 'No' },
		],
	},
	{
		id: 30,
		attributes: [
			{ id: 1, name: 'Color', option: 'Green' },
			{ id: 0, name: 'Logo', option: 'No' },
		],
	},
	{
		id: 31,
		attributes: [
			{ id: 1, name: 'Color', option: 'Blue' },
			{ id: 0, name: 'Logo', option: 'No' },
		],
	},
	{
		id: 36,
		attributes: [
			{ id: 1, name: 'Color', option: 'Blue' },
			{ id: 0, name: 'Logo', option: 'Yes' },
		],
	},
];

describe('Variations Helpers', () => {
	it('should filter variations by single attributes', () => {
		const allMatch = [{ name: 'Color', option: 'Blue' }];
		// @ts-ignore
		const result = filterVariationsByAttributes(variations, allMatch);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe(31);
		expect(result[1].id).toBe(36);
	});

	it('should filter variations by multiple attributes', () => {
		const allMatch = [
			{ name: 'Color', option: 'Blue' },
			{ name: 'Logo', option: 'No' },
		];
		// @ts-ignore
		const result = filterVariationsByAttributes(variations, allMatch);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(31);
	});

	it('should return "any" variations', () => {
		const allMatch = [
			{ name: 'Color', option: 'Red' },
			{ name: 'Any', option: 'Foo' },
		];
		// @ts-ignore
		const result = filterVariationsByAttributes(variations, allMatch);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(29);
	});
});
