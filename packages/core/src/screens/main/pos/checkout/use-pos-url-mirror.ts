import * as React from 'react';

import { Platform } from '@wcpos/utils/platform';

import { useCurrentOrder } from '../contexts/current-order';
import { useTillLocation } from '../use-till-location';
import { useCheckoutMode, useOrderCheckoutStage, useTenderMethod } from './checkout-mode';
import { posBasePath, posPathFor } from './pos-url';

export function usePosUrlMirror() {
	const { currentOrderRecord: record } = useCurrentOrder();
	const { selectedReceiptOrder } = useCheckoutMode();
	const stage = useOrderCheckoutStage(record);
	const methodId = useTenderMethod(record.uuid);
	const { inPos, sheet } = useTillLocation();
	// The phone checkout sheet and the receipt modal are routes of their own: while one is up
	// it owns the address bar, and a cold load of it must not be rewritten to the cart underneath.
	// Off the POS the drawer keeps this mounted, and the page on screen owns the address bar.
	const ownsAddressBar = inPos && sheet === null;
	const path =
		posBasePath() +
		posPathFor({
			orderId: 'isNew' in record && record.isNew ? undefined : record.uuid,
			stage,
			methodId,
			receiptOrderId: selectedReceiptOrder,
		});
	// The browser URL mirrors external POS state after router.setParams has settled.
	React.useEffect(() => {
		if (!Platform.isWeb || !ownsAddressBar) return;
		const frame = requestAnimationFrame(() => {
			// Compare path AND query: expo-router's own write may leave `?orderId=` behind.
			if (window.location.pathname + window.location.search !== path) {
				window.history.replaceState(null, '', path);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [path, ownsAddressBar]);
}

export function PosUrlMirror() {
	usePosUrlMirror();
	return null;
}
