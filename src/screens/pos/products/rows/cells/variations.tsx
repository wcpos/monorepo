import * as React from 'react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import reduce from 'lodash/reduce';
import forEach from 'lodash/forEach';
import find from 'lodash/find';
import intersection from 'lodash/intersection';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Select from '@wcpos/common/src/components/select';
import Box from '@wcpos/common/src/components/box';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;
type ProductAttribute = {
	id: string;
	name: string;
	options: string[];
};

interface Props {
	variationsResource: ObservableResource<ProductVariationDocument[]>;
	attributes: ProductAttribute[];
	addToCart: (variation: ProductVariationDocument, metaData: any) => void;
}

const init = (initialAttributes, variations) => {
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
		selectedVariation: undefined,
	};
};

const Variations = ({ variationsResource, attributes, addToCart }: Props) => {
	const variations = useObservableSuspense(variationsResource);
	const [state, setState] = React.useState(() => init(attributes, variations));

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(name, option) => {
			setState((prev) => {
				const newState = { ...prev };
				const { options } = find(newState.attributes, { name });
				let allowedProducts = [];
				let selectedProducts = [];

				// find the selected option
				forEach(options, (opt) => {
					opt.selected = opt.value === option.value;
					if (opt.selected) {
						allowedProducts = opt.products;
						selectedProducts = opt.products;
					}
				});

				// check other options and disable if not allowed
				forEach(newState.attributes, (attribute) => {
					if (attribute.name !== name) {
						forEach(attribute.options, (opt) => {
							opt.disabled = intersection(allowedProducts, opt.products).length === 0;
							if (opt.selected && !opt.disabled) {
								selectedProducts = intersection(selectedProducts, opt.products);
							}

							opt.selected =
								!attribute.any &&
								selectedProducts.length === 1 &&
								opt.products.includes(selectedProducts[0]);
						});
					}
				});

				// find the selected variation
				if (selectedProducts.length === 1) {
					newState.selectedVariation = find(variations, { id: selectedProducts[0] });
				} else {
					newState.selectedVariation = undefined;
				}

				return newState;
			});
		},
		[variations]
	);

	/**
	 * add selected variation to cart
	 */
	const handleAddToCart = React.useCallback(async () => {
		if (state.selectedVariation) {
			const metaData = state.attributes.map((attribute) => {
				const { id, options } = attribute;
				const selected = find(options, { selected: true });

				return {
					attr_id: id,
					display_key: attribute.name,
					display_value: selected.value,
				};
			});
			addToCart(state.selectedVariation, metaData);
		}
	}, [addToCart, state.attributes, state.selectedVariation]);

	return (
		<Box space="xSmall">
			{state.attributes.map((attribute) => (
				<Box key={attribute.name} space="xSmall">
					<Text>{attribute.name}</Text>
					<Button.Group>
						{attribute.options.map((option) => (
							<Button
								key={option.value}
								type={option.selected ? 'success' : 'primary'}
								disabled={option.disabled}
								onPress={() => {
									handleSelect(attribute.name, option);
								}}
							>
								{option.label}
							</Button>
						))}
					</Button.Group>
				</Box>
			))}
			{state.selectedVariation && (
				<Button title={`Add to Cart: ${state.selectedVariation.price}`} onPress={handleAddToCart} />
			)}
		</Box>
	);
};

export default Variations;
