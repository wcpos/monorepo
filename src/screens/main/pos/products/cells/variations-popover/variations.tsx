import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense, useObservableEagerState } from 'observable-hooks';
import { map, skip } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import VariationButtons from './buttons';
import VariationSelect from './select';
import { useT } from '../../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type OrderDocument = import('@wcpos/database').OrderDocument;
type ProductVariationCollection = import('@wcpos/database').ProductVariationCollection;
type Query = import('@wcpos/query').Query<ProductVariationCollection>;

interface VariationPopoverProps {
	query: Query;
	parent: import('@wcpos/database').ProductDocument;
	addToCart: (
		variation: ProductDocument,
		metaData: OrderDocument['line_items'][number]['meta_data']
	) => void;
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
	const selectedAttributes = useObservableEagerState(
		query.params$.pipe(map(() => query.getAllAttributesSelectors()))
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
		(attribute) => {
			query.where('attributes', { $elemMatch: attribute });
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
		<VStack className="min-w-52">
			{attributes.map((attribute) => {
				// find selected option
				const selected = selectedAttributes?.find((a) => a.name === attribute.name);

				return (
					<VStack key={attribute.name} space="xs">
						<Text>{attribute.name}</Text>
						{attribute.characterCount < 15 ? (
							<VariationButtons
								attribute={attribute}
								onSelect={handleSelect}
								selected={selected?.option}
							/>
						) : (
							<VariationSelect
								attribute={attribute}
								onSelect={handleSelect}
								selected={selected?.option}
							/>
						)}
					</VStack>
				);
			})}
			{selectedVariation && (
				<Button onPress={handleAddToCart}>
					<ButtonText>{t('Add to Cart') + ': ' + format(selectedVariation.price)}</ButtonText>
				</Button>
			)}
		</VStack>
	);
};

export default Variations;
