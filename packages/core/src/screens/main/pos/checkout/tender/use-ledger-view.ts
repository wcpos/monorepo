import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	activeAwaitingCustomer,
	type AwaitingCustomerStamp,
	derive,
	fromMinor,
	isLivePaymentStatus,
	type PaymentRow,
	readLedger,
	readPaidUnits,
	toMinor,
} from '@wcpos/order-math';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';

import { buildTenderTiles, type TenderTile } from './tiles';
import { paidUnitsByLine, type TenderLineId } from './tender-state';
import { useAllocations } from '../checkout-mode';
import { getUuidFromLineItem } from '../../hooks/utils';
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
	/** Each payment's units per line: the order's journaled ones under this till's live ones. */
	allocations: Record<string, Record<TenderLineId, number>>;
	lines: ReturnType<typeof tenderLines>;
	/** Units of each line the live payments covered, with their methods (`paidUnitsByLine`). */
	paidUnits: ReturnType<typeof paidUnitsByLine>;
}

/** The order's item lines as a split picks them: keyed as the bill's rows, tax inside the money. */
export function tenderLines(items: EngineRecord<'orders'>['payload']['line_items'], dp: number) {
	return (items ?? []).flatMap(({ name, quantity, total, total_tax, ...line }) => {
		// A line removed offline stays as a tombstone (`product_id: null`, as `useCartLines` filters)
		// until the deletion syncs: it is not on the bill and cannot be picked or paid for.
		if (line.product_id === null) return [];
		const id = getUuidFromLineItem(line) ?? line.id;
		// Tax is always inside the money a unit adds to a payment, whatever the cart shows.
		const totalMinor = toMinor(total ?? '0', dp) + toMinor(total_tax ?? '0', dp);
		return id === undefined ? [] : [{ id, name: name ?? '', quantity: quantity ?? 1, totalMinor }];
	});
}

export function useLedgerView(
	order: EngineRecord<'orders'>
): LedgerView & { format: (minor: number) => string } {
	const payload = useRecordField(order, (record) => record.payload);
	const { store } = useStoreSession();
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { methods } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const storeAllocations = useAllocations(order.uuid);
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, { dp });
	const tiles = buildTenderTiles(methods, { online });
	const allocations = { ...readPaidUnits(payload.meta_data), ...(storeAllocations ?? {}) };
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, dp))),
		[formatCurrency, dp]
	);
	return {
		rows,
		invoiceSent: activeAwaitingCustomer(payload.meta_data),
		tiles,
		dp,
		totalMinor: toMinor(payload.total, dp),
		paidMinor: toMinor(derived.paid, dp),
		balanceMinor: toMinor(derived.balance, dp),
		allocations,
		lines: tenderLines(payload.line_items, dp),
		paidUnits: paidUnitsByLine(
			allocations,
			rows
				.filter(({ status }) => isLivePaymentStatus(status))
				.map(({ id, method_id }) => ({
					id,
					title: tiles.find(({ method }) => method.id === method_id)?.method.title ?? method_id,
				}))
		),
		format,
	};
}
