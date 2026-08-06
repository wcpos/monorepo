import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import { useOrderMoneyDivergence } from '../contexts/order-money-divergence';

/**
 * "Your store changed this order's totals" — the cashier-facing half of R1.
 *
 * Placed inline, directly above the totals block, and NOT as a toast or a
 * modal. Three deliberate choices:
 *
 *  - INLINE, not a toast. A toast auto-dismisses while the cashier is looking
 *    at the customer, and the one thing this alert must do is still be there
 *    when they look back. It also sits beside the numbers it is talking about,
 *    so "check the total" is one glance, not a memory exercise.
 *  - NOT a modal. The server's totals STAND — the sale is valid and blocking it
 *    would be the POS second-guessing its own source of truth. This tells the
 *    cashier to review before handing over goods; it does not stop them.
 *  - DISMISSIBLE, per order. The cashier acknowledges it once, for this order,
 *    and it does not come back for a sale they have already reviewed.
 *
 * It renders nothing on the overwhelmingly common path: a 2dp ack of the same
 * money is not divergence (#946), so this is silent on ordinary sales.
 */
export function TotalsChangedBanner() {
	const { currentOrder } = useCurrentOrder();
	const orderId = (currentOrder as unknown as { uuid?: string } | undefined)?.uuid;
	const { divergence, dismiss } = useOrderMoneyDivergence(orderId);
	const t = useT();

	if (!divergence) return null;

	const totalChange = divergence.fields.find((field) => field.field === 'total');
	const otherCount = divergence.fields.length - (totalChange ? 1 : 0);

	return (
		<View
			testID="order-totals-changed-banner"
			className="border-attention/50 bg-attention/10 m-2 rounded-md border p-2"
		>
			<HStack className="items-start gap-2">
				<VStack className="flex-1 gap-1">
					<Text className="text-sm font-medium">{t('pos_cart.totals_changed_title')}</Text>
					<Text className="text-muted-foreground text-sm">{t('pos_cart.totals_changed_body')}</Text>
					{totalChange ? (
						<Text testID="order-totals-changed-total" className="text-sm font-medium">
							{t('pos_cart.totals_changed_total', {
								before: totalChange.expected,
								after: totalChange.got,
							})}
						</Text>
					) : null}
					{otherCount > 0 ? (
						<Text testID="order-totals-changed-other" className="text-muted-foreground text-xs">
							{t('pos_cart.totals_changed_other_amounts', {
								count: otherCount,
							})}
						</Text>
					) : null}
				</VStack>
				<IconButton
					testID="order-totals-changed-dismiss"
					name="xmark"
					size="sm"
					accessibilityLabel={t('pos_cart.totals_changed_dismiss')}
					onPress={dismiss}
				/>
			</HStack>
		</View>
	);
}
