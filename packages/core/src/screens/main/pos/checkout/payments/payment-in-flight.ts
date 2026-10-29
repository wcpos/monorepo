import * as React from 'react';

import { getTerminalPaymentsService } from '../../../../../services/terminal-payments';

// § 4.6 holds switches for a terminal waiting OR a redirect gateway open. The pay frame
// publishes no flag of its own, so its mount marks that half without changing an order.
let frames = 0;
const listeners = new Set<() => void>();
const subscribeFrames = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
export function markPayFrame(open: boolean): void {
	frames += open ? 1 : -1;
	listeners.forEach((listener) => listener());
}
const subscribeEmpty = () => () => {};
export function usePaymentInFlight(): boolean {
	const service = getTerminalPaymentsService();
	const terminal = React.useSyncExternalStore(
		service?.subscribe ?? subscribeEmpty,
		() => !!service && [...service.getSnapshot().values()].some((leg) => leg.phase !== 'final')
	);
	const frame = React.useSyncExternalStore(subscribeFrames, () => frames > 0);
	return terminal || frame;
}
