import * as React from 'react';

import { type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

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

function resumeOrder(order: EngineRecord<'orders'>) {
	const service = getTerminalPaymentsService();
	const payload = order.getLatest?.().payload ?? order.payload;
	if (!service) return;
	const rows = readLedger(payload.meta_data);
	for (const row of rows) {
		if (row.capture_mode === 'device' && row.recorded_offline)
			service.trackOffline({
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
	if (row && (payload.id || row.capture_mode === 'device'))
		service.resume({
			orderUuid: order.uuid,
			orderId: payload.id ?? 0,
			orderNumber: payload.number ?? String(payload.id),
			row,
		});
}
export function useResumeTerminalLegs(order: EngineRecord<'orders'> | undefined): void {
	const id = useRecordField(order, (record) => record.payload.id);
	const meta = useRecordField(order, (record) => record.payload.meta_data);
	const version = React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	// Reconcile an externally hydrated ledger when its metadata or service lifetime changes.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Hydrated server state, not a UI event.
		if (order) resumeOrder(order);
	}, [order, meta, id, version]);
}
export function useResumeTerminalLegsForOrders(orders: readonly EngineRecord<'orders'>[]): void {
	const version = React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	// The open-order query publishes a new result when rows hydrate or their ledgers change.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Reconcile an external service, not parent React state.
		orders.forEach(resumeOrder);
	}, [orders, version]);
}
