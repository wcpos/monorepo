import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { pickUnits, usePickedUnits, useSplitOn } from '../checkout/checkout-mode';
import { LedgerLegs } from '../checkout/tender/ledger-pane';
import { type TenderLineId, unitsMinor } from '../checkout/tender/tender-state';
import { useLedgerView } from '../checkout/tender/use-ledger-view';
import {
	CurrentOrderContext,
	type CurrentOrderRecord,
	useCurrentOrder,
} from '../contexts/current-order';
import { CartHeader } from './cart-header';
import { CartTable } from './table';
import { Totals } from './totals';

/**
 * Checkout and receipt: the cart itself, stilled. The same head row (an identity line: number,
 * customer, time, where the controls were), the same table with the
 * cashier's columns rendered read-only, then Totals and the payments inside the same scroll;
 * nothing pinned below. No Card: it is the cart's own frame (pos/cart ledger lines 81, 83).
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
	const view = useLedgerView(order);
	const splitOn = useSplitOn(order.uuid);
	const picked = usePickedUnits(order.uuid);
	// While Split is on the bill is the picker; the pane (the other column) reads the same picks.
	const picker = splitOn
		? {
				picked: picked ?? {},
				paid: view.paidUnits,
				// What `units` more add after the paid ones: the cents ride on the last unit, as in the pane.
				unitMinor: (key: TenderLineId, units: number) => {
					const line = view.lines.find(({ id }) => String(id) === String(key));
					const paid = view.paidUnits[key]?.units ?? 0;
					return line
						? unitsMinor(line.totalMinor, line.quantity, paid + units) -
								unitsMinor(line.totalMinor, line.quantity, paid)
						: 0;
				},
				format: view.format,
				pick: (key: TenderLineId, units: number) => pickUnits(order.uuid, key, units),
			}
		: undefined;
	return (
		<View className="flex-1">
			<ErrorBoundary>
				<CartHeader stilled />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<CartTable
						readOnly
						paid={view.paidUnits}
						picker={picker}
						footer={
							<View>
								<Totals readOnly />
								<View className="border-border gap-2 border-t p-2">
									<Text className="font-semibold">{t('pos_checkout.payments_tab')}</Text>
									<LedgerLegs view={view} format={view.format} closing />
								</View>
							</View>
						}
					/>
				</ErrorBoundary>
			</View>
		</View>
	);
}
