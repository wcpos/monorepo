import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	activeAwaitingCustomer,
	type AwaitingCustomerStamp,
	derive,
	fromMinor,
	type PaymentRow,
	readLedger,
	toMinor,
} from '@wcpos/order-math';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';

import { buildTenderTiles, type TenderTile } from './tiles';
import { type SplitView, splitView, useSplitStore } from './split-view';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';

export interface LedgerView {
	rows: PaymentRow[];
	/** Contract 1.2: the order was sent to the customer and no money has been taken since. */
	invoiceSent: AwaitingCustomerStamp | null;
	tiles: TenderTile[];
	dp: number;
	totalMinor: number;
	paidMinor: number;
	balanceMinor: number;
	/** The split as the tender pane reads it (`splitView`): the bill and the order view show its numbers. */
	split: SplitView;
}

export function useLedgerView(
	order: EngineRecord<'orders'>
): LedgerView & { format: (minor: number) => string } {
	const payload = useRecordField(order, (record) => record.payload);
	const { store } = useStoreSession();
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { methods, byId } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const splitStore = useSplitStore(order.uuid);
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, { dp });
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, dp))),
		[formatCurrency, dp]
	);
	return {
		rows,
		invoiceSent: activeAwaitingCustomer(payload.meta_data),
		tiles: buildTenderTiles(methods, { online }),
		dp,
		totalMinor: toMinor(payload.total, dp),
		paidMinor: toMinor(derived.paid, dp),
		balanceMinor: toMinor(derived.balance, dp),
		// No plan: the bill and the order view show what was paid, never a leg to come.
		split: splitView({
			payload,
			rows,
			dp,
			titleOf: (id) => byId.get(id)?.title ?? id,
			store: splitStore,
			plan: null,
		}),
		format,
	};
}
