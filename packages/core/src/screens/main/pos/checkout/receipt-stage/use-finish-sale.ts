import * as React from 'react';

import { useRouter } from 'expo-router';

import { useIsPhone } from '@wcpos/components/lib/device';

import { finishReceipt } from '../checkout-mode';
import { returnToTill, type TillTab } from '../till-route';
import { useCurrentOrderActions } from '../../contexts/current-order/context';

/** Where a checkout is shown: the routed checkout modal, or embedded in the columns cart. */
export type CheckoutHost = 'modal' | 'columns';

/**
 * The one exit from a checkout: leaving the host it was opened in. The routed `modal` returns
 * to the till at the screen's width (a standalone checkout is a modal on every width); the
 * `columns` cart already is the till. Width never decides whether to leave.
 */
export function useLeaveCheckoutHost(host: CheckoutHost) {
	const router = useRouter();
	const compact = useIsPhone();
	return React.useCallback(
		(tab: TillTab = 'products') => {
			if (host === 'modal') returnToTill(router, compact, tab);
		},
		[host, router, compact]
	);
}

/** The cashier finishing a sale from its receipt: the receipt clears, then the host is left. */
export function useFinishSale(orderUuid: string, host: CheckoutHost) {
	const { setCurrentOrderID } = useCurrentOrderActions();
	const leaveHost = useLeaveCheckoutHost(host);
	return React.useCallback(() => {
		finishReceipt(orderUuid);
		setCurrentOrderID('');
		leaveHost();
	}, [orderUuid, setCurrentOrderID, leaveHost]);
}
