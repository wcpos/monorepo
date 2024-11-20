import * as React from 'react';

import { useObservableSuspense, useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import VariationButtons from './buttons';
import VariationSelect from './select';
import { parseAttributes } from './utils';
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
const Variations = ({ query, parent, addToCart }: VariationPopoverProps) => {
	const result = useObservableSuspense(query.resource);
	const selectedAttributes = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getVariationMatches()))
	);
	const selectedVariation = result.count === 1 && result.hits[0].document;
	const { format } = useCurrencyFormat();
	const t = useT();

	/**
	 *
	 */
	const attributeOptions = React.useMemo(
		() => parseAttributes(parent.attributes, selectedAttributes, result.hits),
		[parent.attributes, selectedAttributes, result.hits]
	);

	/**
	 * @NOTE - buttons can toggle the variation match off (removeVariationMatch) when the option is null
	 */
	const handleSelect = React.useCallback(
		(attribute) => {
			if (attribute.option) {
				query.variationMatch(attribute).exec();
			} else {
				query.removeVariationMatch({ id: attribute.id, name: attribute.name }).exec();
			}
		},
		[query]
	);

	/**
	 *
	 */
	const handleAddToCart = React.useCallback(() => {
		if (selectedVariation) {
			const selectedAttributesMetaData = (attributeOptions || [])
				.filter((a) => a.selected)
				.map((a) => {
					const metaData = {
						attr_id: a.selected.id,
						display_key: a.selected.name,
						display_value: a.selected.option,
					};
					return metaData;
				});
			addToCart(selectedVariation, selectedAttributesMetaData);
		}
	}, [addToCart, attributeOptions, selectedVariation]);

	/**
	 *
	 */
	return (
		<VStack className="min-w-52">
			{attributeOptions.map(({ attribute, optionCounts, selected }) => (
				<VStack key={attribute.name} space="xs">
					<Text>{attribute.name}</Text>
					{attribute.characterCount < 15 ? (
						<VariationButtons
							attribute={attribute}
							onSelect={handleSelect}
							selected={selected?.option}
							optionCounts={optionCounts}
						/>
					) : (
						<VariationSelect
							attribute={attribute}
							onSelect={handleSelect}
							selected={selected?.option}
						/>
					)}
				</VStack>
			))}
			{selectedVariation && (
				<Button onPress={handleAddToCart}>
					<ButtonText>{t('Add to Cart') + ': ' + format(selectedVariation.price)}</ButtonText>
				</Button>
			)}
		</VStack>
	);
};

export default Variations;
