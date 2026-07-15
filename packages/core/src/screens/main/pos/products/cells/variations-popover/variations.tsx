import * as React from 'react';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { VariationButtons } from './buttons';
import { VariationSelect } from './select';
import { parseAttributes } from './utils';
import { useT } from '../../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import {
	removeVariationMatch,
	setVariationMatch,
} from '../../../../components/product/variation-matches';
import { useQueryState, useQueryStateActions } from '../../../../../../query';

type ProductDocument = import('@wcpos/database').ProductDocument;
type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

interface VariationPopoverProps {
	binding: Pick<
		ReturnType<typeof import('../../../../../../query').useCollectionBinding<'variations'>>,
		'resource' | 'active$'
	>;
	parent: import('@wcpos/database').ProductDocument;
	addToCart: (variation: ProductDocument, metaData: LineItem['meta_data']) => void;
}

/**
 *
 */
export function Variations({ binding, parent, addToCart }: VariationPopoverProps) {
	const result = useObservableSuspense(binding.resource);
	const loading = useObservableEagerState(binding.active$);
	const selectedAttributes = useQueryState<
		'variations',
		import('../../../../../../query').VariationMatch[]
	>((state) => state.filters.attributeMatches);
	const actions = useQueryStateActions<'variations'>();
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
		(attribute: { id?: number; name?: string; option?: string }) => {
			const identity = { id: attribute.id ?? 0, name: attribute.name ?? '' };
			if (attribute.option) {
				actions.setFilter(
					'attributeMatches',
					setVariationMatch(selectedAttributes, { ...identity, option: attribute.option })
				);
			} else {
				actions.setFilter('attributeMatches', removeVariationMatch(selectedAttributes, identity));
			}
		},
		[actions, selectedAttributes]
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
						attr_id: a.selected!.id,
						display_key: a.selected!.name,
						display_value: a.selected!.option,
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
			{selectedVariation ? (
				<Button testID="variation-popover-add-to-cart" onPress={handleAddToCart}>
					<ButtonText>
						{t('common.add_to_cart') + ': ' + format(selectedVariation.price)}
					</ButtonText>
				</Button>
			) : result.count === 0 ? (
				loading ? (
					<HStack testID="variation-popover-syncing" space="xs" className="justify-center">
						<Icon name="arrowRotateRight" loading size="sm" />
						<Text className="text-muted-foreground text-xs">{t('pos_products.syncing')}</Text>
					</HStack>
				) : (
					<HStack testID="variation-popover-unavailable" space="xs" className="justify-center">
						<Icon name="circleExclamation" size="sm" />
						<Text className="text-muted-foreground text-xs">
							{t('pos_products.combination_unavailable')}
						</Text>
					</HStack>
				)
			) : null}
		</VStack>
	);
}
