import * as React from 'react';

import find from 'lodash/find';
// import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Select from '@wcpos/components/src/select';
import Text from '@wcpos/components/src/text';

// import useVariations from '../../../../../contexts/variations';
import {
	init,
	updateState,
	expandPossibleVariations,
	getSelectedFromAttributes,
	ProductAttribute,
} from './variations.helpers';
import { t } from '../../../../../lib/translations';
import useCurrencyFormat from '../../../hooks/use-currency-format';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
// type ProductAttributes = import('@wcpos/database').ProductDocument['attributes'];

interface Props {
	variations: ProductVariationDocument[];
	attributes: ProductAttribute[];
	addToCart: (variation: ProductVariationDocument, metaData: any) => void;
	setPrimaryAction: (action: { label: string; action: () => void }) => void;
}

/**
 * TODO: this is kind of messy, needs a refactor
 * - it may be better to search via the VariationsProvider
 */
export const Variations = ({ variations, attributes, addToCart, setPrimaryAction }: Props) => {
	const [state, setState] = React.useState(() => init(attributes));
	const { format } = useCurrencyFormat();

	/**
	 *
	 */
	React.useEffect(() => {
		if (state.selectedVariationId) {
			const selectedVariation = find(variations, { id: state.selectedVariationId });
			const metaData = getSelectedFromAttributes(state.attributes).map((attribute) => ({
				attr_id: attribute.id,
				display_key: attribute.name,
				display_value: attribute.value,
			}));

			setPrimaryAction({
				label: t('Add to cart: {price}', {
					_tags: 'core',
					price: format(selectedVariation?.price || 0),
				}),
				action: () => {
					addToCart(selectedVariation, metaData);
				},
			});
		}
	}, [
		addToCart,
		format,
		setPrimaryAction,
		state.attributes,
		state.selectedVariationId,
		variations,
	]);

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
										type={option.selected ? 'success' : 'secondary'}
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
									handleSelect(attribute, { label: option, value: option });
								}}
								placeholder="Select an option"
							/>
						)}
					</Box>
				);
			})}
		</Box>
	);
};
