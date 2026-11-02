import { isInMotionPaymentStatus, readLedger } from '@wcpos/order-math';

import type { OrderSaveState } from '../checkout/checkout-mode';
import type { OpenOrderHit } from '../contexts/current-order';

/** The tray covers every open cart, including those outside the mounted tab reach. */
export function trayExceptions({
	orders,
	activeValue,
	saveStates,
	awaiting,
}: {
	orders: readonly OpenOrderHit[];
	activeValue: string;
	saveStates: ReadonlyMap<string, OrderSaveState>;
	awaiting: ReadonlySet<string> | null;
}) {
	const tones = new Set<'warning' | 'error'>();
	for (const { record } of orders) {
		const uuid = record.uuid;
		if (uuid === activeValue) continue;
		if (saveStates.get(uuid)?.kind === 'rejected') tones.add('error');
		else if (
			awaiting?.has(uuid) ||
			readLedger(record.payload.meta_data).some(
				(row) => row.capture_mode === 'server' && isInMotionPaymentStatus(row.status)
			)
		)
			tones.add('warning');
	}
	return tones;
}
