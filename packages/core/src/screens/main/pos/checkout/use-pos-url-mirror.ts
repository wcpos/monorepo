import * as React from 'react';

import { useSegments } from 'expo-router';

import { Platform } from '@wcpos/utils/platform';

import { useCurrentOrder } from '../contexts/current-order';
import { useCheckoutMode, useOrderCheckoutStage, useTenderMethod } from './checkout-mode';
import { posBasePath, posPathFor } from './pos-url';

export function usePosUrlMirror() {
	const { currentOrderRecord: record } = useCurrentOrder();
	const { selectedReceiptOrder } = useCheckoutMode();
	const stage = useOrderCheckoutStage(record);
	const methodId = useTenderMethod(record.uuid);
	const segments: string[] = useSegments();
	// The phone checkout sheet and the receipt modal are routes of their own: while one is up
	// it owns the address bar, and a cold load of it must not be rewritten to the cart underneath.
	const routedModal = segments.includes('(modals)');
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
		if (!Platform.isWeb || routedModal) return;
		const frame = requestAnimationFrame(() => {
			// Compare path AND query: expo-router's own write may leave `?orderId=` behind.
			if (window.location.pathname + window.location.search !== path) {
				window.history.replaceState(null, '', path);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [path, routedModal]);
}

export function PosUrlMirror() {
	usePosUrlMirror();
	return null;
}
