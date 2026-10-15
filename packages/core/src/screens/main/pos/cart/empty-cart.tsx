import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

/**
 * What the cart column shows with nothing in the cart: the fresh cart before its first
 * line and an open cart the cashier has emptied look the same (the register-page board,
 * roadmap `2026-09-11-register-page`: a muted cart mark and one line of direction).
 */
export function EmptyCart() {
	const t = useT();
	return (
		<View testID="cart-empty" className="flex-1 items-center justify-center gap-2 p-4">
			<Icon name="cartShopping" size="4xl" className="text-muted-foreground" />
			<Text className="text-muted-foreground text-center text-sm">
				{t('pos_cart.empty_cart_hint')}
			</Text>
		</View>
	);
}
