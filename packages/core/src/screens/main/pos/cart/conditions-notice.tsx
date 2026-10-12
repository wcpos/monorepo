import * as React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { openLineQuantity, useCartUnmet } from '../conditions/use-cart-conditions';
import { useRemoveLineItem } from '../hooks/use-remove-line-item';

// Unmet checkout conditions (roadmap#62, variant A), in the banner's slot; each row is its fix.
export function CartConditionsNotice() {
	const unmet = useCartUnmet();
	const t = useT();
	const { removeLineItem } = useRemoveLineItem();
	if (unmet.length === 0) return null;
	return (
		<ScrollView // outside the cart's scroll view: about three rows, then it scrolls itself
			testID="cart-conditions-notice"
			className="border-attention/50 bg-attention/10 m-2 max-h-36 grow-0 rounded-md border px-2"
		>
			{unmet.map(({ lineUuid, fix, reasonKey, params }, index) => (
				<Pressable
					key={`${lineUuid}:${index}`}
					testID={`cart-condition-row-${lineUuid || index}`}
					accessibilityRole="button"
					// A line without a POS uuid (made outside the POS) cannot be reached: no verb.
					onPress={() =>
						lineUuid &&
						(fix === 'reduce'
							? openLineQuantity(lineUuid)
							: void removeLineItem(lineUuid, 'line_items'))
					}
					className={cn(
						'active:bg-attention/20 min-h-11 flex-row items-center gap-2',
						index > 0 && 'border-attention/30 border-t'
					)}
				>
					<Icon name="box" variant="attention" />
					<Text className="flex-1 text-sm font-medium" numberOfLines={1}>
						{reasonKey === 'pos_cart.only_n_available'
							? t('pos_cart.only_n_available', params)
							: t('pos_products.out_of_stock', params)}
					</Text>
					{!!lineUuid && (
						<Text className="text-sm font-semibold">
							{fix === 'reduce' ? t('pos_cart.reduce_line') : t('pos_cart.remove_line')}
						</Text>
					)}
					{!!lineUuid && <Icon name="chevronRight" size="sm" />}
				</Pressable>
			))}
		</ScrollView>
	);
}
