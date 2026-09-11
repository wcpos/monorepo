import * as React from 'react';

import { type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useStoreSession } from '../../../../../../contexts/app-state';
import {
	getTerminalPaymentsService,
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../../../services/terminal-payments';

export function resumableTerminalRow(row: PaymentRow): boolean {
	return (
		(row.capture_mode === 'server' && (row.status === 'pending' || row.status === 'authorized')) ||
		(row.capture_mode === 'device' &&
			(row.status === 'pending' || (row.status === 'authorized' && !row.recorded_offline)))
	);
}

function resumeOrder(order: EngineRecord<'orders'>, dp: number) {
	const service = getTerminalPaymentsService();
	const payload = order.getLatest?.().payload ?? order.payload;
	if (!service) return;
	const rows = readLedger(payload.meta_data);
	for (const row of rows) {
		if (
			row.capture_mode === 'device' &&
			row.recorded_offline &&
			(payload.id || row.status === 'authorized')
		)
			service.trackOffline({
				dp,
				orderUuid: order.uuid,
				orderId: payload.id ?? 0,
				orderNumber: payload.number ?? String(payload.id),
				row,
			});
	}
	void service.flushOffline();
	const row = rows.find(resumableTerminalRow);
	const tracked = service.get(order.uuid);
	if (tracked && (tracked.phase !== 'final' || tracked.row.id === row?.id)) return;
	if (row && payload.id)
		service.resume({
			dp,
			orderUuid: order.uuid,
			orderId: payload.id ?? 0,
			orderNumber: payload.number ?? String(payload.id),
			row,
		});
}
export function useResumeTerminalLegs(order: EngineRecord<'orders'> | undefined): void {
	const id = useRecordField(order, (record) => record.payload.id);
	const meta = useRecordField(order, (record) => record.payload.meta_data);
	const dp = useStoreSession().store.price_num_decimals ?? 2;
	const version = React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	// Reconcile an externally hydrated ledger when its metadata or service lifetime changes.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Hydrated server state, not a UI event.
		if (order) resumeOrder(order, dp);
	}, [order, meta, id, version, dp]);
}
export function useResumeTerminalLegsForOrders(orders: readonly EngineRecord<'orders'>[]): void {
	const dp = useStoreSession().store.price_num_decimals ?? 2;
	const version = React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	// The open-order query publishes a new result when rows hydrate or their ledgers change.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Reconcile an external service, not parent React state.
		orders.forEach((order) => resumeOrder(order, dp));
	}, [orders, version, dp]);
}
