import find from 'lodash/find';
import reduce from 'lodash/reduce';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;
type ProductAttributes = import('@wcpos/common/src/database').ProductDocument['attributes'];

type StateAttributes = ProductAttributes & {
	label: string;
	value: string;
	selected: boolean;
	disabled: boolean;
	products: number[];
	any: boolean;
};

type State = {
	attributes: StateAttributes[];
	selectedVariation: ProductVariationDocument | null;
};

/**
 *
 */
export const init = (
	initialAttributes: ProductAttributes,
	variations: ProductVariationDocument[]
): State => {
	const attributes = reduce(
		initialAttributes,
		(result, attribute) => {
			if (attribute.variation) {
				let any = false;

				const options = attribute.options.map((option) => {
					const products = variations
						.filter((variation) => {
							if (!find(variation.attributes, { name: attribute.name })) {
								// special case for 'any' option
								any = true;
								return true;
							}
							return find(variation.attributes, { name: attribute.name });
						})
						.map((variation) => variation.id);

					return {
						label: option,
						value: option,
						selected: false,
						disabled: false,
						products,
					};
				});

				result.push({ ...attribute, options, any });
			}
			return result;
		},
		[]
	);

	return {
		attributes,
		selectedVariation: null,
	};
};
