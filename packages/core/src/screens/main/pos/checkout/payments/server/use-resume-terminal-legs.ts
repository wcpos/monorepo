import * as React from 'react';

import { readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import {
	getTerminalPaymentsService,
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../../../services/terminal-payments';

function resumeOrder(order: EngineRecord<'orders'>) {
	const service = getTerminalPaymentsService();
	const payload = order.getLatest?.().payload ?? order.payload;
	if (!service || !payload.id) return;
	const row = readLedger(payload.meta_data).find(
		(row) =>
			row.capture_mode === 'server' && (row.status === 'pending' || row.status === 'authorized')
	);
	const tracked = service.get(order.uuid);
	if (tracked && (tracked.phase !== 'final' || tracked.row.id === row?.id)) return;
	if (row)
		service.resume({
			orderUuid: order.uuid,
			orderId: payload.id,
			orderNumber: payload.number ?? String(payload.id),
			row,
		});
}
export function useResumeTerminalLegs(order: EngineRecord<'orders'> | undefined): void {
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
	}, [order, meta, version]);
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
