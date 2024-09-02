import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { map, skip } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import VariationButtons from './buttons';
import VariationSelect from './select';
import { useT } from '../../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type ProductVariationCollection = import('@wcpos/database').ProductVariationCollection;
type Query = import('@wcpos/query').Query<ProductVariationCollection>;

interface VariationPopoverProps {
	query: Query;
	parent: import('@wcpos/database').ProductDocument;
	addToCart: (variation: ProductDocument, metaData: LineItemDocument['meta_data']) => void;
}

/**
 *
 */
export const getAttributesWithCharacterCount = (attributes: ProductDocument['attributes']) => {
	return (attributes || [])
		.filter((attribute) => attribute.variation)
		.sort((a, b) => (a.position || 0) - (b.position || 0))
		.map((attribute) => {
			const characterCount = (attribute.options || []).join('').length;
			return { ...attribute, characterCount };
		});
};

/**
 *
 */
const Variations = ({ query, parent, addToCart }: VariationPopoverProps) => {
	const result = useObservableSuspense(query.resource);
	const selectedAttributes = useObservableState(
		query.params$.pipe(
			skip(1), // @FIXME: there's an infinite loop if I don't skip the first one
			map(() => query.getAllAttributesSelectors())
		),
		query.getAllAttributesSelectors()
	);
	const selectedVariation = result.count === 1 && result.hits[0].document;
	const { format } = useCurrencyFormat();
	const t = useT();

	/**
	 *
	 */
	const attributes = React.useMemo(
		() => getAttributesWithCharacterCount(parent.attributes),
		[parent.attributes]
	);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			query.where('attributes', { $elemMatch: { id: attribute.id, name: attribute.name, option } });
		},
		[query]
	);

	/**
	 *
	 */
	const handleAddToCart = React.useCallback(() => {
		if (selectedVariation) {
			const selectedAttributesMetaData = (selectedAttributes || []).map((a) => ({
				attr_id: a.id,
				display_key: a.name,
				display_value: a.option,
			}));
			addToCart(selectedVariation, selectedAttributesMetaData);
		}
	}, [addToCart, selectedAttributes, selectedVariation]);

	/**
	 *
	 */
	return (
		<VStack>
			{attributes.map((attribute) => {
				// find selected option
				const selected = selectedAttributes?.find((a) => a.name === attribute.name);

				return (
					<VStack key={attribute.name} space="xs">
						<Text>{attribute.name}</Text>
						{attribute.characterCount < 15 ? (
							<VariationButtons
								attribute={attribute}
								onSelect={(option) => handleSelect(attribute, option)}
								selectedOption={selected?.option}
							/>
						) : (
							<VariationSelect
								attribute={attribute}
								onSelect={(option) => handleSelect(attribute, option)}
								selectedOption={selected?.option}
							/>
						)}
					</VStack>
				);
			})}
			{selectedVariation && (
				<View className="flex-row justify-end">
					<Button onPress={handleAddToCart}>
						<ButtonText>{t('Add to Cart') + ': ' + format(selectedVariation.price)}</ButtonText>
					</Button>
				</View>
			)}
		</VStack>
	);
};

export default Variations;
