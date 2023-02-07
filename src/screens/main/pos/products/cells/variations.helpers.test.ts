import { init, updateState, expandPossibleVariations } from './variations.helpers';

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

const initialState = {
	attributes: [
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
	],
	selectedVariationId: null,
};

const expandedVariations = expandPossibleVariations(variations, initialAttributes);

describe('Variations Helpers', () => {
	it('should initialise the state', () => {
		const state = init(initialAttributes);
		expect(state).toEqual(initialState);
	});

	it('should update the selected option', () => {
		const selectBlue = updateState(
			initialState,
			initialAttributes[0],
			{
				label: 'Blue',
				value: 'Blue',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		expect(selectBlue.attributes[0].options[0].selected).toBe(true);
		expect(selectBlue.attributes[0].options[1].selected).toBe(false);
		expect(selectBlue.attributes[0].options[2].selected).toBe(false);

		const selectRed = updateState(
			initialState,
			initialAttributes[0],
			{
				label: 'Red',
				value: 'Red',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		expect(selectRed.attributes[0].options[0].selected).toBe(false);
		expect(selectRed.attributes[0].options[1].selected).toBe(false);
		expect(selectRed.attributes[0].options[2].selected).toBe(true);
	});

	it('should disable options if not available with selection', () => {
		const selectLogo = updateState(
			initialState,
			initialAttributes[1],
			{
				label: 'Logo',
				value: 'Yes',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		// Logo options
		expect(selectLogo.attributes[1].options[0].selected).toBe(true);
		expect(selectLogo.attributes[1].options[1].selected).toBe(false);

		// Color options
		expect(selectLogo.attributes[0].options[0].disabled).toBe(false);
		expect(selectLogo.attributes[0].options[1].disabled).toBe(true);
		expect(selectLogo.attributes[0].options[2].disabled).toBe(true);

		// Cool Animals options
		expect(selectLogo.attributes[2].options[0].disabled).toBe(false);
		expect(selectLogo.attributes[2].options[1].disabled).toBe(false);
		expect(selectLogo.attributes[2].options[2].disabled).toBe(false);
		expect(selectLogo.attributes[2].options[3].disabled).toBe(false);
	});

	it('should handle special case for any options', () => {
		const selectColor = updateState(
			initialState,
			initialAttributes[0],
			{
				label: 'Color',
				value: 'Blue',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		const selectLogo = updateState(
			selectColor,
			initialAttributes[1],
			{
				label: 'Logo',
				value: 'No',
				selected: false,
				disabled: false,
			},
			variations
		);

		// Color options
		expect(selectLogo.attributes[0].options[0].selected).toBe(true);

		// Logo option
		expect(selectLogo.attributes[1].options[1].selected).toBe(true);

		// Cool Animals options
		expect(selectLogo.attributes[2].options[0].disabled).toBe(true);
		expect(selectLogo.attributes[2].options[1].disabled).toBe(true);
		expect(selectLogo.attributes[2].options[2].disabled).toBe(true);
		expect(selectLogo.attributes[2].options[3].disabled).toBe(false);
		expect(selectLogo.attributes[2].options[3].selected).toBe(true);
	});

	it('should allow deselection', () => {
		const colorState = updateState(
			initialState,
			initialAttributes[0],
			{
				label: 'Color',
				value: 'Blue',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		// Color options
		expect(colorState.attributes[0].options[0].selected).toBe(true);

		const colorStateAgain = updateState(
			colorState,
			initialAttributes[0],
			{
				label: 'Color',
				value: 'Blue',
				selected: false,
				disabled: false,
			},
			expandedVariations
		);

		expect(colorStateAgain.attributes[0].options[0].selected).toBe(false);
	});
});
