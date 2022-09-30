import * as React from 'react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import find from 'lodash/find';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useVariations from '@wcpos/core/src/contexts/variations';
import Text from '@wcpos/components/src/text';
import Button from '@wcpos/components/src/button';
import Select from '@wcpos/components/src/select';
import Box from '@wcpos/components/src/box';
import {
	init,
	updateState,
	expandPossibleVariations,
	getSelectedFromAttributes,
	ProductAttribute,
} from './variations.helpers';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
// type ProductAttributes = import('@wcpos/database').ProductDocument['attributes'];

interface Props {
	variations: ProductVariationDocument[];
	attributes: ProductAttribute[];
	addToCart: (variation: ProductVariationDocument, metaData: any) => void;
}

const Variations = ({ variations, attributes, addToCart }: Props) => {
	const [state, setState] = React.useState(() => init(attributes));
	const { format } = useCurrencyFormat();

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
			{state.attributes?.map((attribute) => {
				const selected = find(attribute.options, { selected: true });

				return (
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
								value={selected}
								options={attribute.options}
								onChange={(option) => {
									handleSelect(attribute, option);
								}}
								placeholder="Select an option"
							/>
						)}
					</Box>
				);
			})}
			{selectedVariation && (
				<Button
					title={`Add to Cart: ${format(selectedVariation.price || 0)}`}
					onPress={handleAddToCart}
				/>
			)}
		</Box>
	);
};

export default Variations;
