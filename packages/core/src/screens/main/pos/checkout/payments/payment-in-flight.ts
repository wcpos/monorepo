import * as React from 'react';

import {
	getTerminalPaymentsService,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../../services/terminal-payments';

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
const noop = () => {};
const terminalWaiting = () => {
	const service = getTerminalPaymentsService();
	return !!service && [...service.getSnapshot().values()].some((leg) => leg.phase !== 'final');
};
// The service starts in an effect after the sheet's first render and restarts on a rebind, so
// the singleton is never read once: this subscription follows the service's start and re-attaches
// to the legs of whichever service is running (Codex, #3056; the compiler memoises a
// zero-argument getter read during render).
const subscribeTerminal = (listener: () => void) => {
	let stopLegs = getTerminalPaymentsService()?.subscribe(listener) ?? noop;
	const stopStart = subscribeTerminalPaymentsServiceStart(() => {
		stopLegs();
		stopLegs = getTerminalPaymentsService()?.subscribe(listener) ?? noop;
		listener();
	});
	return () => {
		stopStart();
		stopLegs();
	};
};
export function usePaymentInFlight(): boolean {
	const terminal = React.useSyncExternalStore(subscribeTerminal, terminalWaiting);
	const frame = React.useSyncExternalStore(subscribeFrames, () => frames > 0);
	return terminal || frame;
}
