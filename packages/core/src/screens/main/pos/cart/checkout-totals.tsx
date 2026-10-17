import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

import type { LedgerView } from '../checkout/tender/use-ledger-view';

/**
 * The stilled cart's foot: the order total, what has been paid and what remains. Pinned
 * under the scroll, where the cart's own totals sit in cart mode.
 */
export function CheckoutTotals({
	view,
}: {
	view: Pick<LedgerView, 'totalMinor' | 'paidMinor' | 'balanceMinor'> & {
		format: (minor: number) => string;
	};
}) {
	const t = useT();
	const { format } = view;
	return (
		<View testID="checkout-ledger-totals" className="border-border gap-2 border-t p-4">
			<HStack className="justify-between">
				<Text>{t('common.total')}</Text>
				<Text testID="checkout-order-total" className="tabular-nums">
					{format(view.totalMinor)}
				</Text>
			</HStack>
			<HStack className="justify-between">
				<Text>{t('pos_checkout.paid')}</Text>
				<Text className="tabular-nums">{format(view.paidMinor)}</Text>
			</HStack>
			<HStack className="justify-between">
				<Text className="font-bold">{t('pos_checkout.remaining')}</Text>
				<Text className="font-bold tabular-nums" testID="checkout-ledger-remaining">
					{format(view.balanceMinor)}
				</Text>
			</HStack>
		</View>
	);
}
