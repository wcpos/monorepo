import * as React from 'react';

import {
	getTerminalPaymentsService,
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../../../services/terminal-payments';

const emptySnapshot = () => null;
const subscribeEmpty = () => () => {};
export function useTerminalLeg(orderUuid: string) {
	React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	const service = getTerminalPaymentsService();
	const snapshot = React.useSyncExternalStore(
		service?.subscribe ?? subscribeEmpty,
		service?.getSnapshot ?? emptySnapshot,
		emptySnapshot
	);
	return snapshot?.get(orderUuid) ?? null;
}
