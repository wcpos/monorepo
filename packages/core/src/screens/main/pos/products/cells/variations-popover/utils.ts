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
	// Handle "any option" by generating permutations for missing attributes
	const expandedHits = hits.flatMap((hit) => {
		const missingAttributes = attributes?.filter(
			(attribute) =>
				attribute.variation &&
				!(hit.document.attributes || []).some((attr) => attr.id === attribute.id)
		);

		if (missingAttributes && missingAttributes.length > 0) {
			// Generate permutations for all options of missing attributes
			return missingAttributes.reduce(
				(permutedHits, attr) => {
					return permutedHits.flatMap((currentHit) =>
						(attr.options || []).map((option) => ({
							document: {
								...currentHit.document,
								attributes: [
									...(currentHit.document.attributes || []),
									{ id: attr.id, name: attr.name, option },
								],
							},
						}))
					);
				},
				[hit]
			);
		}

		// If no attributes are missing, keep the hit as is
		return [hit];
	});

	// Filter hits based on selected attributes
	let filteredHits = expandedHits;

	if (selectedAttributes && selectedAttributes.length > 0) {
		filteredHits = expandedHits.filter((hit) =>
			selectedAttributes.every((selAttr) =>
				(hit.document.attributes || []).some(
					(attr) =>
						attr.id === selAttr.id && attr.name === selAttr.name && attr.option === selAttr.option
				)
			)
		);
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
				(attribute.options || []).forEach((option) => {
					const count = filteredHits.filter((variation) =>
						(variation.document.attributes || []).some(
							(a) => a.id === attribute.id && a.name === attribute.name && a.option === option
						)
					).length;

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
