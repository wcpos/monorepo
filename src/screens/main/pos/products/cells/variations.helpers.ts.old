type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
type ProductAttributes = NonNullable<ProductDocument['attributes']>;
type ProductVariationAttributes = NonNullable<ProductVariationDocument['attributes']>;

export type StateAttributeOption = {
	label: string;
	value: string;
	selected?: boolean;
	disabled?: boolean;
};

export type StateAttribute = Omit<ProductAttributes[number], 'options'> & {
	options: StateAttributeOption[];
	characterCount: number;
};

export type SelectionState = StateAttribute[];

/**
 *
 */
export const getSelectedState = (
	attributes: ProductDocument['attributes'],
	allMatch: { name: string; option: string }[]
): SelectionState => {
	return (attributes || [])
		.filter((attribute) => attribute.variation)
		.sort((a, b) => (a.position || 0) - (b.position || 0))
		.map((attribute) => {
			const options = (attribute.options || []).map((option) => {
				const selected = allMatch.some((match) => {
					return match.name === attribute.name && match.option === option;
				});
				return {
					label: option,
					value: option,
					selected,
					disabled: false,
				};
			});

			const characterCount = (attribute.options || []).join('').length;

			return { ...attribute, options, characterCount };
		});
};

/**
 *
 */
export const makeNewQuery = (
	name: string,
	option: string,
	allMatch: { name: string; option: string }[]
) => {
	return [{ name, option }].reduce((result, objectToMerge) => {
		const index = result.findIndex((match) => match.name === objectToMerge.name);
		if (index >= 0) {
			result[index] = objectToMerge;
		} else {
			result.push(objectToMerge);
		}
		return result;
	}, allMatch);
};

/**
 *
 */
export const extractSelectedMetaData = (selectionState: SelectionState) => {
	return selectionState.map((attribute) => {
		const selectedOption = attribute.options.find((option) => option.selected);
		return {
			attr_id: attribute.id,
			display_key: attribute.name,
			display_value: selectedOption ? selectedOption.value : '',
		};
	});
};
