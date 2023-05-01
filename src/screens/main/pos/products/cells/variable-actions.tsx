import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';

import { Variations } from './variations';
import { getSelectedState, makeNewQuery, extractSelectedMetaData } from './variations.helpers';
import { t } from '../../../../../lib/translations';
import useVariations, { VariationsProvider } from '../../../contexts/variations';
import useCartHelpers from '../../../hooks/use-cart-helpers';
import useCurrencyFormat from '../../../hooks/use-currency-format';

import type { StateAttribute, StateAttributeOption } from './variations.helpers';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 * NOTE popover is in portal outside of VariationsProvider
 * An inline popover cannot overflow the parent FlashList
 * I could wrap VariationsSelect in VariationsProvider, but that seems messy
 */
export const WrappedVariableActions = ({ item: product }: Props) => {
	const [opened, setOpened] = React.useState(false);
	const { data: variations, setQuery, query$ } = useVariations();
	const { addVariation } = useCartHelpers();
	const attributes = useObservableState(product.attributes$, product.attributes);
	const selectedVariation = variations.length === 1 ? variations[0] : undefined;
	const { format } = useCurrencyFormat();
	const query = useObservableState(query$, query$.getValue());
	const allMatch = get(query, 'selector.attributes.$allMatch', []);
	const selectionState = getSelectedState(
		attributes,
		allMatch
		// variations.map((variation) => variation.attributes)
	);

	/**
	 *
	 */
	React.useEffect(() => {
		setQuery('selector.attributes.$allMatch', []);
	}, [opened, setQuery]);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute: StateAttribute, option: StateAttributeOption) => {
			const newQuery = makeNewQuery(attribute.name, option.value, allMatch);
			setQuery('selector.attributes.$allMatch', newQuery);
		},
		[allMatch, setQuery]
	);

	/**
	 *
	 */
	const addToCart = React.useCallback(() => {
		const metaData = extractSelectedMetaData(selectionState);
		addVariation(selectedVariation, product, metaData);
		setOpened(false);
	}, [selectionState, addVariation, selectedVariation, product]);

	/**
	 *
	 */
	return (
		<Popover
			withinPortal
			opened={opened}
			onClose={() => setOpened(false)}
			placement="right"
			primaryAction={
				selectedVariation
					? {
							label: t('Add to cart: {price}', {
								_tags: 'core',
								price: format(selectedVariation?.price || 0),
							}),
							action: addToCart,
					  }
					: undefined
			}
		>
			<Popover.Target>
				<Icon
					name="circleChevronRight"
					size="xxLarge"
					type="success"
					onPress={() => setOpened(true)}
				/>
			</Popover.Target>
			<Popover.Content>
				<Variations selectionState={selectionState} onSelect={handleSelect} />
			</Popover.Content>
		</Popover>
	);
};

/**
 *
 */
export const VariableActions = ({ item }: Props) => {
	return (
		<VariationsProvider parent={item}>
			<WrappedVariableActions item={item} />
		</VariationsProvider>
	);
};
