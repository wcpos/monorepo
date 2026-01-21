import type { ProductDocument, ProductVariationDocument } from '@wcpos/database';

/**
 * VARIATIONS POPOVER - PURPOSE & LOGIC
 * =====================================
 *
 * This component allows users to select product variation attributes (e.g., Color, Size)
 * and see which combinations are available in stock.
 *
 * KEY CONCEPT: "Any Option" Variations
 * ------------------------------------
 * WooCommerce allows variations to have "Any" for an attribute, meaning that variation
 * matches ANY value of that attribute. In the database, "any option" is represented by
 * the attribute being ABSENT from the variation's attributes array.
 *
 * Example:
 *   Product attributes: Color [Red, Blue], Size [S, M, L]
 *   Variation 1: { attributes: [{ name: 'Color', option: 'Red' }] }  // Size = Any
 *   Variation 2: { attributes: [{ name: 'Color', option: 'Blue' }, { name: 'Size', option: 'S' }] }
 *
 *   Variation 1 matches: Red+S, Red+M, Red+L (3 combinations)
 *   Variation 2 matches: Blue+S only (1 combination)
 *
 * ALGORITHM:
 * ----------
 * Instead of materializing permutations (which is O(M^N) exponential), we use direct
 * matching which is O(V * A * O) linear:
 *
 * For each attribute option, count how many hits "match" it, where a hit matches if:
 * 1. The hit specifies that exact option, OR the hit doesn't specify the attribute ("any")
 * 2. AND the hit is compatible with all currently selected attributes
 *
 * The counts represent "number of variations that could match this option" - used by
 * the UI to disable options with count=0 (no matching variations).
 */

type SelectedAttribute = { id: number; name: string; option: string };

/**
 * Check if a variation hit is compatible with a specific attribute option
 * and all currently selected attributes.
 *
 * A hit "matches" an attribute value if:
 * - The hit specifies that exact value, OR
 * - The hit doesn't specify the attribute at all ("any option" = matches everything)
 */
function hitMatchesOption(
	hit: { document: ProductVariationDocument },
	targetAttrId: number,
	targetOption: string,
	selectedAttributes: SelectedAttribute[] | undefined
): boolean {
	const hitAttrs = hit.document.attributes || [];

	// Check if hit is compatible with the target option
	const targetHitAttr = hitAttrs.find((a) => a.id === targetAttrId);
	if (targetHitAttr && targetHitAttr.option !== targetOption) {
		return false; // Hit specifies a different option - no match
	}
	// If targetHitAttr is undefined, hit has "any option" for this attr - matches all values

	// Check if hit is compatible with all selected attributes
	if (selectedAttributes && selectedAttributes.length > 0) {
		for (const selected of selectedAttributes) {
			const hitAttr = hitAttrs.find((a) => a.id === selected.id);
			if (hitAttr && hitAttr.option !== selected.option) {
				return false; // Hit specifies different value than what user selected
			}
			// If hitAttr is undefined, hit has "any option" - compatible with any selection
		}
	}

	return true;
}

/**
 * Calculates option counts for each attribute and determines auto-selection
 * for attributes with only one viable option.
 *
 * @param attributes - The parent product's variation attributes with all possible options
 * @param selectedAttributes - Currently selected attribute values by the user
 * @param hits - Variation documents that match the current query/selection
 * @returns Array of attribute data with option counts and auto-selected values
 */
export const parseAttributes = (
	attributes: ProductDocument['attributes'],
	selectedAttributes: SelectedAttribute[] | undefined,
	hits: { document: ProductVariationDocument }[]
) => {
	return (attributes || [])
		.filter((attribute) => attribute.variation)
		.sort((a, b) => (a.position || 0) - (b.position || 0))
		.map((attribute) => {
			const characterCount = (attribute.options || []).join('').length;
			const selected = selectedAttributes?.find((a) => a.name === attribute.name);
			const optionCounts: Record<string, number> = {};

			// Only calculate option counts if the attribute is not already selected
			if (!selected) {
				for (const option of attribute.options || []) {
					// Count hits that match this option (considering "any option" and selections)
					let count = 0;
					for (const hit of hits) {
						if (hitMatchesOption(hit, attribute.id, option, selectedAttributes)) {
							count++;
						}
					}
					optionCounts[option] = count;
				}
			}

			// Auto-select option if there is only one viable option with a count > 0
			const viableOptions = Object.entries(optionCounts).filter(([, count]) => count > 0);
			const autoSelected =
				!selected && viableOptions.length === 1
					? {
							id: attribute.id,
							name: attribute.name,
							option: viableOptions[0][0],
						}
					: selected;

			return { attribute: { ...attribute, characterCount }, optionCounts, selected: autoSelected };
		});
};
