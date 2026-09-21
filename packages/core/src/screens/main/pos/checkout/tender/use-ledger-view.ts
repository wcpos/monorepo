import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { derive, fromMinor, type PaymentRow, readLedger, toMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { buildTenderTiles, type TenderTile } from './tiles';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';

export interface LedgerView {
	rows: PaymentRow[];
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
	const tiles = buildTenderTiles(methods, { online });
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, dp))),
		[formatCurrency, dp]
	);
	return {
		rows,
		tiles,
		dp,
		totalMinor: toMinor(payload.total, dp),
		paidMinor: toMinor(derived.paid, dp),
		balanceMinor: toMinor(derived.balance, dp),
		format,
	};
}
