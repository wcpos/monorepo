import * as React from 'react';
import { Pressable, View } from 'react-native';

import { BeatingCount, type CountMotion, useCountBeat } from '@wcpos/components/badge';

import { useT } from '../../../../../../contexts/translations';
import { useCurrentOrder } from '../../../contexts/current-order';

/**
 * How many of a product are in the cart. When the count changes under the cashier's hand it
 * plays the count beat every count badge plays (`useCountBeat`): the number changes hands
 * and an add lands. That is all of it (owner, 2026-10-01: a ring splashing out of the badge
 * was too much).
 *
 * It stays mounted while the count is zero (rendering `empty`) so that it is there to see
 * the first add. A count that differs because the row was recycled for another product, or
 * because another order came into view, is not an add and nothing moves.
 */
export function InCartCount({
	product,
	count,
	onPress,
	empty = null,
	motion,
}: {
	/** The product counted: the same product with a new count is a change worth showing. */
	product: string;
	count: number;
	onPress?: () => void;
	/** What stands in the badge's place while nothing is in the cart. */
	empty?: React.ReactNode;
	motion?: CountMotion;
}) {
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const beat = useCountBeat({
		value: count,
		text: count > 0 ? String(count) : null,
		identity: `${currentOrderRecord?.uuid}:${product}`,
		motion,
	});

	if (count <= 0) return <>{empty}</>;

	const badge = (
		<View className="size-6">
			<BeatingCount
				beat={beat}
				text={String(count)}
				className="bg-primary size-6 rounded-full"
				textClassName="text-primary-foreground tabular-nums"
			/>
		</View>
	);
	if (!onPress) {
		return <View accessibilityLabel={t('pos_products.in_cart_count', { count })}>{badge}</View>;
	}
	// Pressable when it stands in for the `+`: the badge is then the row's named add control,
	// and its target keeps the row token (the 44-pt floor) around the compact badge.
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t('pos_products.in_cart_count', { count })}
			onPress={onPress}
			hitSlop={8}
			className="min-h-row min-w-row items-center justify-center"
		>
			{badge}
		</Pressable>
	);
}
