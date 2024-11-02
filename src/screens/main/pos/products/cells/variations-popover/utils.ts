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
	// Filter the hits based on selectedAttributes
	let filteredHits = hits;

	if (selectedAttributes && selectedAttributes.length > 0) {
		filteredHits = hits.filter((hit) => {
			return selectedAttributes.every((selAttr) => {
				return (hit.document.attributes || []).some(
					(attr) =>
						attr.id === selAttr.id && attr.name === selAttr.name && attr.option === selAttr.option
				);
			});
		});
	}

	return (attributes || [])
		.filter((attribute) => attribute.variation)
		.sort((a, b) => (a.position || 0) - (b.position || 0))
		.map((attribute) => {
			const characterCount = (attribute.options || []).join('').length;
			const selected = selectedAttributes?.find((a) => a.name === attribute.name);
			const optionCounts: Record<string, number> = {};

			// Only calculate option counts if the attribute is not already selected
			if (!selected) {
				(attribute.options || []).forEach((option) => {
					const count = filteredHits.filter((variation) => {
						const matchingAttribute = (variation.document.attributes || []).find(
							(a) => a.id === attribute.id && a.name === attribute.name
						);

						// If the attribute is present, it must match the option; if absent, treat as "any option"
						return matchingAttribute ? matchingAttribute.option === option : true;
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
