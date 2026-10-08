import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	type AwaitingCustomerStamp,
	derive,
	fromMinor,
	type PaymentRow,
	readAwaitingCustomer,
	readLedger,
	toMinor,
} from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { buildTenderTiles, type TenderTile } from './tiles';
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
}

export function useLedgerView(
	order: EngineRecord<'orders'>
): LedgerView & { format: (minor: number) => string } {
	const payload = useRecordField(order, (record) => record.payload);
	const { store } = useStoreSession();
	const dp = store.price_num_decimals ?? 2;
	const { methods } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, { dp });
	const stamp = readAwaitingCustomer(payload.meta_data);
	const counting = rows.some((row) => row.status === 'captured' || row.status === 'authorized');
	const tiles = buildTenderTiles(methods, { online });
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, dp))),
		[formatCurrency, dp]
	);
	return {
		rows,
		invoiceSent: stamp && !counting ? stamp : null,
		tiles,
		dp,
		totalMinor: toMinor(payload.total, dp),
		paidMinor: toMinor(derived.paid, dp),
		balanceMinor: toMinor(derived.balance, dp),
		format,
	};
}
