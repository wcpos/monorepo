import type { ProductDocument, ProductVariationDocument } from '@wcpos/database';

/**
 * Calculates option counts for each attribute and determines auto-selection
 * for attributes with only one viable option.
 */
export const parseAttributes = (
	attributes: ProductDocument['attributes'],
	selectedAttributes: { id: number; name: string; option: string }[] | undefined,
	hits: { document: ProductVariationDocument }[]
) => {
	// Filter hits based on selected attributes
	let filteredHits = hits;

	if (selectedAttributes && selectedAttributes.length > 0) {
		filteredHits = hits.filter((hit) => {
			return selectedAttributes.every((selAttr) => {
				const hitAttribute = (hit.document.attributes || []).find((attr) => attr.id === selAttr.id);

				if (hitAttribute) {
					// Hit has the attribute, options must match
					return hitAttribute.option === selAttr.option;
				} else {
					// Hit does *not* have the attribute, it's compatible (represents "any")
					return true;
				}
			});
		});
	}

	// Parse and compute attribute data
	return (attributes || [])
		.filter((attribute) => attribute.variation)
		.sort((a, b) => (a.position || 0) - (b.position || 0))
		.map((attribute) => {
			const characterCount = (attribute.options || []).join('').length;
			const selected = selectedAttributes?.find((a) => a.name === attribute.name);
			const optionCounts: Record<string, number> = {};

			// Only calculate option counts if the attribute is not already selected
			if (!selected) {
				// For each option, count how many variations would be valid if this option was selected
				(attribute.options || []).forEach((option) => {
					// Check if this option is compatible with all other selected attributes
					const count = filteredHits.filter((hit) => {
						// If the hit already has this attribute, check if it matches
						const existingAttr = (hit.document.attributes || []).find(
							(attr) => attr.id === attribute.id
						);

						if (existingAttr) {
							return existingAttr.option === option;
						}

						// If the hit doesn't have this attribute, it's compatible with any option
						return true;
					}).length;

					optionCounts[option] = count;
				});
			}

			// Auto-select option if there is only one viable option with a count > 0
			const viableOptions = Object.entries(optionCounts).filter(([, count]) => count > 0);
			const autoSelected =
				!selected && viableOptions.length === 1
					? {
							id: attribute.id,
							name: attribute.name,
							option: viableOptions[0][0], // Select the only viable option
						}
					: selected;

			return { attribute: { ...attribute, characterCount }, optionCounts, selected: autoSelected };
		});
};
