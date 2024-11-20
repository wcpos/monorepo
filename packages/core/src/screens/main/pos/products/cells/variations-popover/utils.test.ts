import type { ProductDocument, ProductVariationDocument } from '@wcpos/database';

import { parseAttributes } from './utils';

describe('parseAttributes', () => {
	const attributes: ProductDocument['attributes'] = [
		{
			id: 1,
			name: 'Color',
			position: 0,
			visible: true,
			variation: true,
			options: ['Red', 'Blue'],
		},
		{
			id: 2,
			name: 'Size',
			position: 1,
			visible: true,
			variation: true,
			options: ['Small', 'Large'],
		},
	];

	// Full set of 4 possible variations
	const hits: { document: ProductVariationDocument }[] = [
		{
			document: {
				attributes: [
					{ id: 1, name: 'Color', option: 'Red' },
					{ id: 2, name: 'Size', option: 'Small' },
				],
			} as ProductVariationDocument,
		},
		{
			document: {
				attributes: [
					{ id: 1, name: 'Color', option: 'Red' },
					{ id: 2, name: 'Size', option: 'Large' },
				],
			} as ProductVariationDocument,
		},
		{
			document: {
				attributes: [
					{ id: 1, name: 'Color', option: 'Blue' },
					{ id: 2, name: 'Size', option: 'Small' },
				],
			} as ProductVariationDocument,
		},
		{
			document: {
				attributes: [
					{ id: 1, name: 'Color', option: 'Blue' },
					{ id: 2, name: 'Size', option: 'Large' },
				],
			} as ProductVariationDocument,
		},
	];

	it('should calculate option counts and character counts correctly', () => {
		const selectedAttributes = undefined;
		const result = parseAttributes(attributes, selectedAttributes, hits);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7, // 'Red'.length + 'Blue'.length = 7
				},
				optionCounts: { Red: 2, Blue: 2 },
				selected: undefined,
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10, // 'Small'.length + 'Large'.length = 10
				},
				optionCounts: { Small: 2, Large: 2 },
				selected: undefined,
			},
		]);
	});

	it('should auto-select option when only one viable option exists', () => {
		// Only one hit, meaning only one viable option for each attribute
		const singleHit = [
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 2, name: 'Size', option: 'Small' },
					],
				} as ProductVariationDocument,
			},
		];
		const selectedAttributes = undefined;
		const result = parseAttributes(attributes, selectedAttributes, singleHit);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7,
				},
				optionCounts: { Red: 1, Blue: 0 },
				selected: {
					id: 1,
					name: 'Color',
					option: 'Red',
				},
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10,
				},
				optionCounts: { Small: 1, Large: 0 },
				selected: {
					id: 2,
					name: 'Size',
					option: 'Small',
				},
			},
		]);
	});

	it('should not calculate option counts if attribute is already selected', () => {
		const selectedAttributes = [{ id: 1, name: 'Color', option: 'Red' }];

		const hits: { document: ProductVariationDocument }[] = [
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 2, name: 'Size', option: 'Small' },
					],
				} as ProductVariationDocument,
			},
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 2, name: 'Size', option: 'Large' },
					],
				} as ProductVariationDocument,
			},
		];

		const result = parseAttributes(attributes, selectedAttributes, hits);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7,
				},
				optionCounts: {}, // No counts calculated for pre-selected attribute
				selected: { id: 1, name: 'Color', option: 'Red' },
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10,
				},
				optionCounts: { Small: 1, Large: 1 },
				selected: undefined,
			},
		]);
	});

	it('should not calculate option counts if all attributes are already selected', () => {
		const selectedAttributes = [
			{ id: 1, name: 'Color', option: 'Red' },
			{ id: 2, name: 'Size', option: 'Small' },
		];

		const hits: { document: ProductVariationDocument }[] = [
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 2, name: 'Size', option: 'Small' },
					],
				} as ProductVariationDocument,
			},
		];

		const result = parseAttributes(attributes, selectedAttributes, hits);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7,
				},
				optionCounts: {}, // No counts calculated for pre-selected attribute
				selected: { id: 1, name: 'Color', option: 'Red' },
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10,
				},
				optionCounts: {},
				selected: { id: 2, name: 'Size', option: 'Small' },
			},
		]);
	});

	it('should handle empty attributes array', () => {
		const result = parseAttributes([], undefined, hits);
		expect(result).toEqual([]);
	});

	it('should handle attributes with no options', () => {
		const attributesWithNoOptions = [
			{
				id: 1,
				name: 'Material',
				position: 0,
				visible: true,
				variation: true,
				options: [],
			},
		];
		const result = parseAttributes(attributesWithNoOptions, undefined, hits);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Material',
					position: 0,
					visible: true,
					variation: true,
					options: [],
					characterCount: 0,
				},
				optionCounts: {}, // No options to count
				selected: undefined,
			},
		]);
	});

	it('should return zero counts if there are no hits', () => {
		const selectedAttributes = undefined;
		const emptyHits: { document: ProductVariationDocument }[] = [];

		const result = parseAttributes(attributes, selectedAttributes, emptyHits);

		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7,
				},
				optionCounts: { Red: 0, Blue: 0 }, // Zero counts with no hits
				selected: undefined,
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10,
				},
				optionCounts: { Small: 0, Large: 0 },
				selected: undefined,
			},
		]);
	});

	it('should handle missing variations', () => {
		const hits: { document: ProductVariationDocument }[] = [
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Blue' },
						{ id: 2, name: 'Size', option: 'Large' },
					],
				} as ProductVariationDocument,
			},
		];
		const selectedAttributes = [{ id: 1, name: 'Color', option: 'Blue' }];

		const result = parseAttributes(attributes, selectedAttributes, hits);
		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Red', 'Blue'],
					characterCount: 7,
				},
				optionCounts: {},
				selected: { id: 1, name: 'Color', option: 'Blue' },
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Small', 'Large'],
					characterCount: 10,
				},
				optionCounts: { Small: 0, Large: 1 },
				selected: { id: 2, name: 'Size', option: 'Large' },
			},
		]);
	});

	it('BUG: it should fix this autoselect bug', () => {
		const attributes: ProductDocument['attributes'] = [
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
		];

		const selectedAttributes = [{ id: 1, name: 'Color', option: 'Red' }];

		const hits: { document: ProductVariationDocument }[] = [
			{
				document: {
					attributes: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 0, name: 'Logo', option: 'No' },
					],
				} as ProductVariationDocument,
			},
		];

		const result = parseAttributes(attributes, selectedAttributes, hits);
		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Blue', 'Green', 'Red'],
					characterCount: 12,
				},
				optionCounts: {},
				selected: { id: 1, name: 'Color', option: 'Red' },
			},
			{
				attribute: {
					id: 0,
					name: 'Logo',
					position: 1,
					visible: true,
					variation: true,
					options: ['Yes', 'No'],
					characterCount: 5,
				},
				optionCounts: { Yes: 0, No: 1 },
				selected: { id: 0, name: 'Logo', option: 'No' },
			},
		]);
	});

	it('BUG: should fix this issue where "any" option is selected and the other variants are returning counts of 0', () => {
		const attributes = [
			{
				id: 1,
				name: 'Color',
				options: ['Blue', 'Green', 'Red'],
				position: 0,
				variation: true,
				visible: true,
			},
			{
				id: 2,
				name: 'Size',
				options: ['Large', 'Medium', 'Small'],
				position: 1,
				variation: true,
				visible: true,
			},
		];
		const selectedAttributes = [
			{
				id: 2,
				name: 'Size',
				option: 'Large',
			},
		];
		const hits = [
			{
				document: {
					attributes: [
						{
							id: 1,
							name: 'Color',
							option: 'Green',
						},
					],
					id: 30,
					name: 'Green',
					parent_id: 15,
				},
			},
			{
				document: {
					attributes: [
						{
							id: 1,
							name: 'Color',
							option: 'Red',
						},
					],
					id: 29,
					name: 'Red',
					parent_id: 15,
				},
			},
			{
				document: {
					attributes: [
						{
							id: 1,
							name: 'Color',
							option: 'Blue',
						},
					],
					id: 31,
					name: 'Blue',
					parent_id: 15,
				},
			},
		] as { document: ProductVariationDocument }[];
		const result = parseAttributes(attributes, selectedAttributes, hits);
		expect(result).toEqual([
			{
				attribute: {
					id: 1,
					name: 'Color',
					position: 0,
					visible: true,
					variation: true,
					options: ['Blue', 'Green', 'Red'],
					characterCount: 12,
				},
				optionCounts: { Blue: 1, Green: 1, Red: 1 },
				selected: undefined,
			},
			{
				attribute: {
					id: 2,
					name: 'Size',
					position: 1,
					visible: true,
					variation: true,
					options: ['Large', 'Medium', 'Small'],
					characterCount: 16,
				},
				optionCounts: {},
				selected: { id: 2, name: 'Size', option: 'Large' },
			},
		]);
	});

	describe('tests for "any" variations', () => {
		it('should calculate option counts and character counts correctly', () => {
			const selectedAttributes = undefined;

			const anyHits: { document: ProductVariationDocument }[] = [
				{
					document: {
						attributes: [{ id: 1, name: 'Color', option: 'Red' }],
					} as ProductVariationDocument,
				},
				{
					document: {
						attributes: [{ id: 1, name: 'Color', option: 'Blue' }],
					} as ProductVariationDocument,
				},
			];

			const result = parseAttributes(attributes, selectedAttributes, anyHits);

			expect(result).toEqual([
				{
					attribute: {
						id: 1,
						name: 'Color',
						position: 0,
						visible: true,
						variation: true,
						options: ['Red', 'Blue'],
						characterCount: 7, // 'Red'.length + 'Blue'.length = 7
					},
					optionCounts: { Red: 2, Blue: 2 },
					selected: undefined,
				},
				{
					attribute: {
						id: 2,
						name: 'Size',
						position: 1,
						visible: true,
						variation: true,
						options: ['Small', 'Large'],
						characterCount: 10, // 'Small'.length + 'Large'.length = 10
					},
					optionCounts: { Small: 2, Large: 2 },
					selected: undefined,
				},
			]);
		});

		it('should NOT auto-select when "any" variations are present', () => {
			// Only one hit, meaning only one viable option for each attribute
			const singleHit = [
				{
					document: {
						attributes: [{ id: 1, name: 'Color', option: 'Red' }],
					} as ProductVariationDocument,
				},
			];
			const selectedAttributes = [{ id: 1, name: 'Color', option: 'Red' }];
			const result = parseAttributes(attributes, selectedAttributes, singleHit);

			expect(result).toEqual([
				{
					attribute: {
						id: 1,
						name: 'Color',
						position: 0,
						visible: true,
						variation: true,
						options: ['Red', 'Blue'],
						characterCount: 7,
					},
					optionCounts: {}, // No counts calculated for pre-selected attribute
					selected: {
						id: 1,
						name: 'Color',
						option: 'Red',
					},
				},
				{
					attribute: {
						id: 2,
						name: 'Size',
						position: 1,
						visible: true,
						variation: true,
						options: ['Small', 'Large'],
						characterCount: 10,
					},
					optionCounts: { Small: 1, Large: 1 },
					selected: undefined,
				},
			]);
		});

		it('should not calculate option counts if attribute is already selected', () => {
			const selectedAttributes = [{ id: 1, name: 'Color', option: 'Red' }];

			const anyhits: { document: ProductVariationDocument }[] = [
				{
					document: {
						attributes: [{ id: 1, name: 'Color', option: 'Red' }],
					} as ProductVariationDocument,
				},
			];

			const result = parseAttributes(attributes, selectedAttributes, anyhits);

			expect(result).toEqual([
				{
					attribute: {
						id: 1,
						name: 'Color',
						position: 0,
						visible: true,
						variation: true,
						options: ['Red', 'Blue'],
						characterCount: 7,
					},
					optionCounts: {}, // No counts calculated for pre-selected attribute
					selected: { id: 1, name: 'Color', option: 'Red' },
				},
				{
					attribute: {
						id: 2,
						name: 'Size',
						position: 1,
						visible: true,
						variation: true,
						options: ['Small', 'Large'],
						characterCount: 10,
					},
					optionCounts: { Small: 1, Large: 1 },
					selected: undefined,
				},
			]);
		});
	});
});
