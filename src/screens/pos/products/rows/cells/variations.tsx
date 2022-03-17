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
// import { usePOSContext } from '../../../context';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;
type ProductAttribute = {
	id: string;
	name: string;
	options: string[];
};

interface Props {
	variationsResource: ObservableResource<ProductVariationDocument[]>;
	attributes: ProductAttribute[];
}

// const attributes = [
// 	{
// 		id: 1,
// 		name: 'Color',
// 		position: 0,
// 		visible: true,
// 		variation: true,
// 		options: [
// 			{ label: 'Blue', value: 'Blue', selected: false, disabled: false, products: [31, 36] },
// 			{ label: 'Green', value: 'Green', selected: false, disabled: false, products: [30] },
// 			{ label: 'Red', value: 'Red', selected: true, disabled: false, products: [29] },
// 		],
// 	},
// 	{
// 		id: 0,
// 		name: 'Logo',
// 		position: 1,
// 		visible: true,
// 		variation: true,
// 		options: [
// 			{ label: 'Yes', value: 'Yes', selected: false, disabled: true, products: [36] },
// 			{ label: 'No', value: 'No', selected: true, disabled: false, products: [29, 30, 31] },
// 		],
// 	},
// ];

const init = (initialAttributes, variations) => {
	const attributes = reduce(
		initialAttributes,
		(result, attribute) => {
			if (attribute.variation) {
				const options = attribute.options.map((option) => {
					const products = variations
						.filter((variation) => find(variation.attributes, { id: attribute.id, option }))
						.map((variation) => variation.id);

					return {
						label: option,
						value: option,
						selected: false,
						disabled: false,
						products,
					};
				});
				result.push({ ...attribute, options });
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

const Variations = ({ variationsResource, attributes, currentOrder, parent }: Props) => {
	// const { currentOrder } = usePOSContext();
	const variations = useObservableSuspense(variationsResource);
	const [state, setState] = React.useState(() => init(attributes, variations));

	/**
	 *
	 */
	const handleSelect = React.useCallback((id, option) => {
		setState((prev) => {
			const newState = { ...prev };
			const { options } = find(newState.attributes, { id });
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
				if (attribute.id !== id) {
					const { options } = attribute;
					forEach(options, (opt) => {
						opt.disabled = intersection(allowedProducts, opt.products).length === 0;
						if (opt.selected && !opt.disabled) {
							selectedProducts = intersection(selectedProducts, opt.products);
						}

						opt.selected =
							selectedProducts.length === 1 && opt.products.includes(selectedProducts[0]);
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
	}, []);

	/**
	 * add selected variation to cart
	 */
	const addToCart = React.useCallback(async () => {
		if (currentOrder && state.selectedVariation) {
			currentOrder.addOrUpdateLineItem(state.selectedVariation, parent);
		}
	}, [currentOrder, parent, state.selectedVariation]);

	return (
		<Box space="xSmall">
			{state.attributes.map((attribute) => (
				<Box key={attribute.id} space="xSmall">
					<Text>{attribute.name}</Text>
					<Button.Group>
						{attribute.options.map((option) => (
							<Button
								key={option.value}
								type={option.selected ? 'success' : 'primary'}
								disabled={option.disabled}
								onPress={() => {
									handleSelect(attribute.id, option);
								}}
							>
								{option.label}
							</Button>
						))}
					</Button.Group>
				</Box>
			))}
			{state.selectedVariation && (
				<Button title={`Add to Cart: ${state.selectedVariation.price}`} onPress={addToCart} />
			)}
		</Box>
	);
};

export default Variations;
