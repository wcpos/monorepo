import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import { usePopover } from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

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
	// const { setPrimaryAction } = usePopover();
	const result = useObservableSuspense(query.resource);
	const selectedAttributes = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'attributes', '$allMatch']))),
		get(query.getParams(), ['selector', 'attributes', '$allMatch'])
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
			query.updateVariationAttributeSelector({
				id: attribute.id,
				name: attribute.name,
				option,
			});
		},
		[query]
	);

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	if (selectedVariation) {
	// 		// convert attributes to meta_data
	// 		const selectedAttributesMetaData = (selectedAttributes || []).map((a) => ({
	// 			attr_id: a.id,
	// 			display_key: a.name,
	// 			display_value: a.option,
	// 		}));
	// 		setPrimaryAction({
	// 			label: t('Add to Cart') + ': ' + format(selectedVariation.price),
	// 			action: () => addToCart(selectedVariation, selectedAttributesMetaData),
	// 		});
	// 	} else {
	// 		setPrimaryAction(undefined);
	// 	}
	// }, [addToCart, format, parent, selectedAttributes, selectedVariation, setPrimaryAction, t]);

	/**
	 *
	 */
	return (
		<Box space="xSmall" style={{ minWidth: 200 }}>
			{attributes.map((attribute) => {
				// find selected option
				const selected = selectedAttributes?.find((a) => a.name === attribute.name);

				return (
					<Box key={attribute.name} space="xSmall">
						<Text>{attribute.name}</Text>
						{attribute.characterCount < 15 ? (
							<VariationButtons
								attribute={attribute}
								onSelect={handleSelect}
								selectedOption={selected?.option}
							/>
						) : (
							<VariationSelect
								attribute={attribute}
								onSelect={handleSelect}
								selectedOption={selected?.option}
							/>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

export default Variations;
