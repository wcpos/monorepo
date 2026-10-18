import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { TABLE_HEAD_TEXT } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCheckoutMode } from '../checkout/checkout-mode';
import { LedgerLegs } from '../checkout/tender/ledger-pane';
import { useLedgerView } from '../checkout/tender/use-ledger-view';
import {
	CurrentOrderContext,
	type CurrentOrderRecord,
	useCurrentOrder,
} from '../contexts/current-order';
import { CartHeader } from './cart-header';
import { CheckoutTotals } from './checkout-totals';
import { CartTable } from './table';

/**
 * Checkout and receipt: the cart itself, stilled. The same head row (customer in its slot,
 * the order number where the add and settings controls were), the same table with the
 * cashier's columns rendered read-only, the payments under it inside the same scroll, and
 * the totals pinned below. No Card: it is the cart's own frame (pos/cart ledger line 81).
 *
 * `order` may be a receipt that is no longer the current order, so the cells — which read
 * the current order — are given this one.
 */
export function StilledCart({ order }: { order: EngineRecord<'orders'> }) {
	const context = useCurrentOrder();
	const value = React.useMemo(
		() => ({ ...context, currentOrderRecord: order as unknown as CurrentOrderRecord }),
		[context, order]
	);
	return (
		<CurrentOrderContext.Provider value={value}>
			<StilledCartBody order={order} />
		</CurrentOrderContext.Provider>
	);
}

function StilledCartBody({ order }: { order: EngineRecord<'orders'> }) {
	const t = useT();
	const paidBy = useCheckoutMode().linesPaidBy.get(order.uuid);
	const view = useLedgerView(order);
	return (
		<View className="flex-1">
			<ErrorBoundary>
				<CartHeader stilled />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<CartTable
						readOnly
						paidBy={paidBy}
						footer={
							<View className="gap-2 p-4">
								<Text className={TABLE_HEAD_TEXT}>{t('pos_checkout.payments_tab')}</Text>
								<LedgerLegs view={view} format={view.format} />
							</View>
						}
					/>
				</ErrorBoundary>
			</View>
			<CheckoutTotals view={view} />
		</View>
	);
}
