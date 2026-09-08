import * as React from 'react';

import { Platform } from '@wcpos/utils/platform';

import { useTheme } from '../../../../contexts/theme';
import { useCurrentOrder } from '../contexts/current-order';
import { useCheckoutMode, useOrderCheckoutStage, useTenderMethod } from './checkout-mode';
import { posBasePath, posPathFor } from './pos-url';

export function usePosUrlMirror() {
	const { currentOrderRecord: record } = useCurrentOrder();
	const { selectedReceiptOrder } = useCheckoutMode();
	const stage = useOrderCheckoutStage(record);
	const methodId = useTenderMethod(record.uuid);
	const { screenSize } = useTheme();
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
		if (!Platform.isWeb || (screenSize === 'sm' && stage === 'checkout')) return;
		const frame = requestAnimationFrame(() => {
			// Compare path AND query: expo-router's own write may leave `?orderId=` behind.
			if (window.location.pathname + window.location.search !== path) {
				window.history.replaceState(null, '', path);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [path, screenSize, stage]);
}

export function PosUrlMirror() {
	usePosUrlMirror();
	return null;
}
