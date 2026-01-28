import type { ProductDocument, ProductVariationDocument } from '@wcpos/database';

import { parseAttributes } from './utils';

/**
 * PARSEATTRIBUTES TEST SUITE
 * ==========================
 *
 * These tests document the expected behavior of parseAttributes.
 *
 * CORE FUNCTIONALITY:
 * -------------------
 * 1. Calculate `optionCounts` for each attribute option
 *    - Count = number of variations that match if user selects that option
 *    - Used to disable UI buttons for options with count=0
 *
 * 2. Auto-select attributes with only one viable option (count > 0)
 *
 * 3. Filter counts based on already-selected attributes
 *
 * KEY BEHAVIOR: "ANY OPTION" HANDLING
 * -----------------------------------
 * WooCommerce allows "Any X" variations where an attribute is not specified.
 * In the database, this is represented by the attribute being ABSENT from
 * the variation's attributes array.
 *
 * Matching logic:
 * - A hit "matches" an option if it specifies that option OR doesn't specify the attribute
 * - Counts represent raw hits that match (not expanded permutations)
 *
 * Example:
 *   Attributes: Color [Red, Blue], Size [Small, Large]
 *   Hits: [
 *     { attributes: [{ Color: 'Red' }] },   // Size = "any"
 *     { attributes: [{ Color: 'Blue' }] },  // Size = "any"
 *   ]
 *
 *   Expected optionCounts:
 *   - Color: { Red: 1, Blue: 1 }  // Each color has 1 matching hit
 *   - Size: { Small: 2, Large: 2 }  // Both hits have "any" size, so both match each option
 *
 * ALGORITHM COMPLEXITY:
 * ---------------------
 * O(V * A * O) where V=variations, A=attributes, O=options - linear, not exponential.
 */

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

			// Two variations: Red (any size), Blue (any size)
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

			// Counts represent raw hits that match each option (not expanded permutations)
			// - Red: 1 hit (the Red variation)
			// - Blue: 1 hit (the Blue variation)
			// - Small/Large: 2 hits each (both variations have "any" for Size, so both match)
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
					optionCounts: { Red: 1, Blue: 1 },
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

	/**
	 * Performance tests for "any option" handling
	 *
	 * The direct matching approach is O(V * A * O) - linear complexity.
	 * These tests verify that even extreme cases complete quickly.
	 */
	describe('performance with many "any option" attributes', () => {
		it('should handle 5 attrs x 10 options efficiently', () => {
			// Create 5 attributes, each with 10 options
			// Old approach: 10^5 = 100,000 permutations (crash)
			// New approach: 5 * 10 * 1 = 50 checks (fast)
			const manyAttributes: ProductDocument['attributes'] = [];
			for (let i = 1; i <= 5; i++) {
				const options = [];
				for (let j = 1; j <= 10; j++) {
					options.push(`Option${j}`);
				}
				manyAttributes.push({
					id: i,
					name: `Attribute${i}`,
					position: i - 1,
					visible: true,
					variation: true,
					options,
				});
			}

			// Single variation with NO attributes specified (all are "any option")
			const anyOptionHits: { document: ProductVariationDocument }[] = [
				{
					document: {
						attributes: [], // Empty = "any option" for ALL attributes
					} as ProductVariationDocument,
				},
			];

			const startTime = performance.now();
			const result = parseAttributes(manyAttributes, undefined, anyOptionHits);
			const endTime = performance.now();
			const duration = endTime - startTime;


			expect(result).toHaveLength(5);
			expect(duration).toBeLessThan(50);
		});

		it('should handle 8 attrs x 5 options efficiently', () => {
			// Old approach: 5^8 = 390,625 permutations (crash)
			// New approach: 8 * 5 * 1 = 40 checks (fast)
			const attributes: ProductDocument['attributes'] = [];
			for (let i = 1; i <= 8; i++) {
				attributes.push({
					id: i,
					name: `Attr${i}`,
					position: i - 1,
					visible: true,
					variation: true,
					options: ['A', 'B', 'C', 'D', 'E'],
				});
			}

			// Single variation with all "any option"
			const hits: { document: ProductVariationDocument }[] = [
				{
					document: {
						attributes: [],
					} as ProductVariationDocument,
				},
			];

			const startTime = performance.now();
			const result = parseAttributes(attributes, undefined, hits);
			const endTime = performance.now();
			const duration = endTime - startTime;


			expect(result).toHaveLength(8);
			expect(duration).toBeLessThan(50);
		});

		it('should handle multiple hits each with partial "any option" attributes', () => {
			// 4 attributes with 8 options each
			// 3 hits, each missing 3 attributes = 8^3 = 512 permutations each = 1536 total
			// This is still manageable but shows the growth pattern
			const attributes: ProductDocument['attributes'] = [];
			for (let i = 1; i <= 4; i++) {
				attributes.push({
					id: i,
					name: `Attr${i}`,
					position: i - 1,
					visible: true,
					variation: true,
					options: ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8'],
				});
			}

			const hits: { document: ProductVariationDocument }[] = [
				{
					document: {
						attributes: [{ id: 1, name: 'Attr1', option: 'O1' }],
					} as ProductVariationDocument,
				},
				{
					document: {
						attributes: [{ id: 2, name: 'Attr2', option: 'O2' }],
					} as ProductVariationDocument,
				},
				{
					document: {
						attributes: [{ id: 3, name: 'Attr3', option: 'O3' }],
					} as ProductVariationDocument,
				},
			];

			const startTime = performance.now();
			const result = parseAttributes(attributes, undefined, hits);
			const endTime = performance.now();
			const duration = endTime - startTime;


			expect(result).toHaveLength(4);
			// This case is still fast enough, but with more missing attrs it compounds
			expect(duration).toBeLessThan(100);
		});
	});
});
