import { getSelectedState, makeNewQuery } from './variations.helpers';

const initialAttributes = [
	{
		id: 1,
		name: 'Color',
		options: ['Blue', 'Green', 'Red'],
		position: 0,
		variation: true,
		visible: true,
	},
	{
		id: 0,
		name: 'Logo',
		options: ['Yes', 'No'],
		position: 1,
		variation: true,
		visible: true,
	},
	{
		id: 0,
		name: 'Cool Animals',
		options: ['Large Fish', 'Boney-spider', 'Bløk Buñy', 'George'],
		position: 2,
		variation: true,
		visible: true,
	},
];

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
			{ id: 0, name: 'Cool Animals', option: 'George' },
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

const initialState = [
	{
		id: 1,
		name: 'Color',
		options: [
			{
				label: 'Blue',
				value: 'Blue',
				selected: false,
				disabled: false,
			},
			{
				label: 'Green',
				value: 'Green',
				selected: false,
				disabled: false,
			},
			{
				label: 'Red',
				value: 'Red',
				selected: false,
				disabled: false,
			},
		],
		position: 0,
		variation: true,
		visible: true,
		characterCount: 12,
	},
	{
		id: 0,
		name: 'Logo',
		options: [
			{
				label: 'Yes',
				value: 'Yes',
				selected: false,
				disabled: false,
			},
			{
				label: 'No',
				value: 'No',
				selected: false,
				disabled: false,
			},
		],
		position: 1,
		variation: true,
		visible: true,
		characterCount: 5,
	},
	{
		id: 0,
		name: 'Cool Animals',
		options: [
			{
				label: 'Large Fish',
				value: 'Large Fish',
				selected: false,
				disabled: false,
			},
			{
				label: 'Boney-spider',
				value: 'Boney-spider',
				selected: false,
				disabled: false,
			},
			{
				label: 'Bløk Buñy',
				value: 'Bløk Buñy',
				selected: false,
				disabled: false,
			},
			{
				label: 'George',
				value: 'George',
				selected: false,
				disabled: false,
			},
		],
		position: 2,
		variation: true,
		visible: true,
		characterCount: 37,
	},
];

describe('Variations Helpers', () => {
	describe('getSelectedState', () => {
		it('should initialise the state', () => {
			const state = getSelectedState(initialAttributes, []);
			expect(state).toEqual(initialState);
		});

		it('should update the selected option', () => {
			const selectBlue = getSelectedState(initialAttributes, [{ name: 'Color', option: 'Blue' }]);
			expect(selectBlue[0].options[0].selected).toBe(true);
			expect(selectBlue[0].options[1].selected).toBe(false);
			expect(selectBlue[0].options[2].selected).toBe(false);
			const selectRed = getSelectedState(initialAttributes, [{ name: 'Color', option: 'Red' }]);
			expect(selectRed[0].options[0].selected).toBe(false);
			expect(selectRed[0].options[1].selected).toBe(false);
			expect(selectRed[0].options[2].selected).toBe(true);
		});

		it('should update multiple selected options', () => {
			const state = getSelectedState(initialAttributes, [
				{ name: 'Color', option: 'Blue' },
				{ name: 'Logo', option: 'Yes' },
			]);
			expect(state[0].options[0].selected).toBe(true);
			expect(state[0].options[1].selected).toBe(false);
			expect(state[0].options[2].selected).toBe(false);
			expect(state[1].options[0].selected).toBe(true);
			expect(state[1].options[1].selected).toBe(false);
		});
	});

	describe('makeNewQuery', () => {
		it('should add a new attribute-option pair if attribute name not in allMatch', () => {
			const attribute = { name: 'color', value: 'red' };
			const option = { name: 'color', value: 'blue' };
			const allMatch = [{ name: 'size', option: 'large' }];

			// @ts-ignore
			const result = makeNewQuery(attribute, option, allMatch);
			const expectedResult = [
				{ name: 'size', option: 'large' },
				{ name: 'color', option: 'blue' },
			];

			expect(result).toEqual(expectedResult);
		});

		it('should update an existing attribute-option pair if attribute name in allMatch', () => {
			const attribute = { name: 'color', value: 'red' };
			const option = { name: 'color', value: 'blue' };
			const allMatch = [
				{ name: 'size', option: 'large' },
				{ name: 'color', option: 'red' },
			];

			// @ts-ignore
			const result = makeNewQuery(attribute, option, allMatch);
			const expectedResult = [
				{ name: 'size', option: 'large' },
				{ name: 'color', option: 'blue' },
			];

			expect(result).toEqual(expectedResult);
		});

		// test('should not modify the original allMatch array', () => {
		// 	const attribute = { name: 'color', value: 'red' };
		// 	const option = { name: 'color', value: 'blue' };
		// 	const allMatch = [
		// 		{ name: 'size', option: 'large' },
		// 		{ name: 'color', option: 'red' },
		// 	];
		// 	const allMatchCopy = [...allMatch];
		// 	// @ts-ignore
		// 	makeNewQuery(attribute, option, allMatch);

		// 	expect(allMatch).toEqual(allMatchCopy);
		// });

		it('should handle empty allMatch array', () => {
			const attribute = { name: 'color', value: 'red' };
			const option = { name: 'color', value: 'blue' };
			// @ts-ignore
			const allMatch = [];
			// @ts-ignore
			const result = makeNewQuery(attribute, option, allMatch);
			const expectedResult = [{ name: 'color', option: 'blue' }];

			expect(result).toEqual(expectedResult);
		});
	});
});
