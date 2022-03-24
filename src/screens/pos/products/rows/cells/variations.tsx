import * as React from 'react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import find from 'lodash/find';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Select from '@wcpos/common/src/components/select';
import Box from '@wcpos/common/src/components/box';
import {
	init,
	updateState,
	expandPossibleVariations,
	getSelectedFromAttributes,
	ProductAttribute,
} from './variations.helpers';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;
// type ProductAttributes = import('@wcpos/common/src/database').ProductDocument['attributes'];

interface Props {
	variationsResource: ObservableResource<ProductVariationDocument[]>;
	attributes: ProductAttribute[];
	addToCart: (variation: ProductVariationDocument, metaData: any) => void;
}

const Variations = ({ variationsResource, attributes, addToCart }: Props) => {
	const variations = useObservableSuspense(variationsResource);
	const [state, setState] = React.useState(() => init(attributes));

	/**
	 * Find the variation that matches the current state
	 */
	const selectedVariation = React.useMemo(
		() => find(variations, { id: state.selectedVariationId }),
		[variations, state.selectedVariationId]
	) as ProductVariationDocument | undefined;

	/**
	 * Expand possible variations to account for 'any' options
	 */
	const possibleVariations = React.useMemo(
		() => expandPossibleVariations(variations, attributes),
		[variations, attributes]
	);

	/**
	 * Update state based on new attribute selection
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			setState((prev) => updateState(prev, attribute, option, possibleVariations));
		},
		[possibleVariations]
	);

	/**
	 * Add selected variation to cart
	 */
	const handleAddToCart = React.useCallback(async () => {
		if (selectedVariation) {
			const metaData = getSelectedFromAttributes(state.attributes).map((attribute) => ({
				attr_id: attribute.id,
				display_key: attribute.name,
				display_value: attribute.value,
			}));
			addToCart(selectedVariation, metaData);
		}
	}, [addToCart, selectedVariation, state.attributes]);

	/**
	 * Render variation options
	 */
	return (
		<Box space="xSmall">
			{state.attributes?.map((attribute) => (
				<Box key={attribute.name} space="xSmall">
					<Text>{attribute.name}</Text>
					{attribute.characterCount < 15 ? (
						<Button.Group>
							{attribute.options?.map((option) => (
								<Button
									key={option.value}
									type={option.selected ? 'success' : 'primary'}
									disabled={option.disabled}
									onPress={() => {
										handleSelect(attribute, option);
									}}
								>
									{option.label}
								</Button>
							))}
						</Button.Group>
					) : (
						<Select
							options={attribute.options}
							onChange={(option) => {
								debugger;
							}}
							placeholder="Select an option"
						/>
					)}
				</Box>
			))}
			{selectedVariation && (
				<Button title={`Add to Cart: ${selectedVariation.price}`} onPress={handleAddToCart} />
			)}
		</Box>
	);
};

export default Variations;
