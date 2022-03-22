import find from 'lodash/find';
import forEach from 'lodash/forEach';
import cloneDeep from 'lodash/cloneDeep';
import map from 'lodash/map';
import differenceWith from 'lodash/differenceWith';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;
export type ProductAttribute = {
	id: number;
	name: string;
	position: number;
	visible: boolean;
	variation: boolean;
	options: string[];
};

type StateAttributesOptions = {
	label: string;
	value: string;
	selected: boolean;
	disabled: boolean;
};

type StateAttributes = Omit<ProductAttribute, 'options'> & {
	options: StateAttributesOptions[];
	characterCount: number;
	// products: number[];
	// any: boolean;
};

type State = {
	attributes: StateAttributes[];
	selectedVariationId: number | null;
};

type PossibleVariation = {
	id: number;
	attributes: NonNullable<ProductVariationDocument['attributes']>;
};

/**
 *
 */
export const init = (
	initialAttributes: ProductAttribute[]
	// variations: ProductVariationDocument[]
): State => {
	const attributes =
		initialAttributes &&
		initialAttributes.map((attribute) => {
			const options = attribute.options?.map((option) => {
				return {
					label: option,
					value: option,
					selected: false,
					disabled: false,
				};
			});

			const characterCount = attribute.options?.join('').length;

			return { ...attribute, options, characterCount };
		});

	return {
		attributes,
		selectedVariationId: null,
	};
};

/**
 *
 */
export const expandPossibleVariations = (
	variations: ProductVariationDocument[],
	attributes: ProductAttribute[]
) => {
	const possibilities = [] as PossibleVariation[];

	variations.forEach((variation) => {
		// compare variation.attributes to attributes
		const anyOptions = differenceWith(
			attributes,
			map(variation.attributes, (attribute) => ({
				id: attribute.id,
				name: attribute.name,
			})),
			(a, b) => a.id === b.id && a.name === b.name
		);

		if (anyOptions.length > 0) {
			// we need to 'explode' the any variations
			forEach(anyOptions, (any) => {
				forEach(any.options, (option) => {
					const attrs = variation.attributes.concat({
						id: any.id,
						name: any.name,
						option,
					});
					possibilities.push({
						id: variation.id,
						attributes: attrs,
					});
				});
			});
		} else {
			possibilities.push({
				id: variation.id,
				attributes: variation.attributes,
			});
		}
	});

	return possibilities;
};

/**
 *
 */
export const getSelectedFromAttributes = (attributes: StateAttributes[]) => {
	const result = [];
	attributes.forEach(({ id, name, options }) => {
		const selected = options.find(({ selected }) => selected);
		if (selected) {
			result.push({ id, name, value: selected.value });
		}
	});
	return result;
};

/**
 *
 */
export const getSelectedVariations = (possibleVariations, selected) => {
	return possibleVariations.filter((poss) => {
		return (
			selected.length === 0 ||
			selected.every(({ name, value }) => {
				return !!poss.attributes.find(({ name: attrName, option: attrValue }) => {
					return attrName === name && attrValue === value;
				});
			})
		);
	});
};

/**
 *
 */
export const updateState = (
	prev: State,
	attribute: ProductAttribute,
	selectedOption: StateAttributesOptions,
	possibleVariations: PossibleVariation[]
) => {
	const newState = cloneDeep(prev);
	const attr = find(newState.attributes, { name: attribute.name });
	if (!attr) {
		return newState;
	}

	// update the selected option
	forEach(attr.options, (opt) => {
		if (opt.value === selectedOption.value) {
			opt.selected = !opt.selected;
		} else {
			opt.selected = false;
		}
	});

	const selected = getSelectedFromAttributes(newState.attributes);

	const selectedVariations = getSelectedVariations(possibleVariations, selected);
	if (selectedVariations.length === 1) {
		// only one possible variation found
		// auto-select options
		newState.attributes.forEach((attr) => {
			selectedVariations[0].attributes.forEach((a) => {
				if (attr.id === a.id && attr.name === a.name) {
					attr.options.forEach((opt) => {
						if (opt.value === a.option && opt.value !== selectedOption.value) {
							opt.selected = true;
						}
					});
				}
			});
		});

		// set id
		newState.selectedVariationId = selectedVariations[0].id;
	} else {
		newState.selectedVariationId = null;
	}

	// loop through other attributes and do a mock selection
	newState.attributes
		.filter((attr) => attr.name !== attribute.name)
		.forEach((attr) => {
			attr.options.forEach((option) => {
				const mockSelect = selected
					.filter((s) => attr.id !== s.id && attr.name !== s.name)
					.concat({ name: attr.name, value: option.value });

				const validOption = getSelectedVariations(possibleVariations, mockSelect);

				option.disabled = validOption.length === 0;
			});
		});

	return newState;
};
