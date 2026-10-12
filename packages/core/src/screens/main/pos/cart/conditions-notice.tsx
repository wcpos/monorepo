import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { openLineQuantity, useCartUnmet } from '../conditions/use-cart-conditions';
import { useRemoveLineItem } from '../hooks/use-remove-line-item';

/**
 * Unmet checkout conditions (roadmap#62, variant A), beside the totals-changed banner in its amber
 * box. Each row is its fix: Reduce opens the line's keypad, Remove is the line strip's own writer.
 */
export function CartConditionsNotice() {
	const unmet = useCartUnmet();
	const t = useT();
	const { removeLineItem } = useRemoveLineItem();
	if (unmet.length === 0) return null;
	return (
		<View
			testID="cart-conditions-notice"
			className="border-attention/50 bg-attention/10 m-2 rounded-md border px-2"
		>
			{unmet.map(({ lineUuid, fix, reasonKey, params }, index) => (
				<Pressable
					key={lineUuid}
					testID="cart-condition-row"
					accessibilityRole="button"
					// `removeLineItem` logs and toasts its own failures, as it does for the strip.
					onPress={() =>
						fix === 'reduce'
							? openLineQuantity(lineUuid)
							: void removeLineItem(lineUuid, 'line_items')
					}
					className={cn(
						'min-h-11 flex-row items-center gap-2',
						index > 0 && 'border-attention/30 border-t'
					)}
				>
					<Icon name="box" variant="attention" />
					<Text className="flex-1 text-sm font-medium" numberOfLines={1}>
						{reasonKey === 'pos_cart.only_n_available'
							? t('pos_cart.only_n_available', params)
							: t('pos_cart.out_of_stock_for', params)}
					</Text>
					<Text className="text-sm font-semibold">
						{fix === 'reduce' ? t('pos_cart.reduce_line') : t('pos_cart.remove_line')}
					</Text>
					<Icon name="chevronRight" size="sm" />
				</Pressable>
			))}
		</View>
	);
}
