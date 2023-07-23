import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { switchMap, tap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import { usePopover } from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import VariationButtons from './buttons';
import VariationSelect from './select';
import { t } from '../../../../../../lib/translations';
import { useVariations, updateVariationQueryState } from '../../../../contexts/variations';
import useCartHelpers from '../../../../hooks/use-cart-helpers';
import useCollection from '../../../../hooks/use-collection';
import useCurrencyFormat from '../../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface VariationPopoverProps {
	parent: import('@wcpos/database').ProductDocument;
	addToCart: (variation: ProductDocument) => void;
}

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
const VariablePopover = ({ parent, addToCart }: VariationPopoverProps) => {
	const { setPrimaryAction } = usePopover();
	const { collection } = useCollection('variations');
	const { resource, setQuery } = useVariations();
	const variations = useObservableSuspense(resource);

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
		(attribute, option: string) => {
			setQuery((prev) => updateVariationQueryState(prev, { name: attribute.name, option }));
		},
		[setQuery]
	);

	/**
	 *
	 */

	/**
	 *
	 */
	React.useEffect(() => {
		console.log(variations);
		if (variations.length === 1) {
			setPrimaryAction({
				label: t('Add to Cart'),
				onPress: () => addToCart(variations[0]),
			});
		} else {
			setPrimaryAction(undefined);
		}
	}, [addToCart, parent, setPrimaryAction, variations]);

	/**
	 *
	 */
	return (
		<Box space="xSmall">
			{attributes.map((attribute) => {
				// const matched = allMatch.find((match) => match.name === attribute.name);
				const selectedOption = undefined;

				return (
					<Box key={attribute.name} space="xSmall">
						<Text>{attribute.name}</Text>
						{attribute.characterCount < 15 ? (
							<VariationButtons
								attribute={attribute}
								onSelect={handleSelect}
								// selectedOption={selectedOption}
							/>
						) : (
							<VariationSelect
								attribute={attribute}
								onSelect={handleSelect}
								// selectedOption={selectedOption}
							/>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

export default VariablePopover;
