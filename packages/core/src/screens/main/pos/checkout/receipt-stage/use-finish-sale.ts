import * as React from 'react';

import { useRouter } from 'expo-router';

import { finishReceipt } from '../checkout-mode';
import { returnToTill } from '../till-route';
import { useCurrentOrderActions } from '../../contexts/current-order/context';
import { useTheme } from '../../../../../contexts/theme';

/**
 * Finishing a sale leaves the host it was opened in: the routed checkout `modal` returns to
 * the till at the screen's width (a standalone checkout is a modal on every width); the
 * `columns` cart already is the till.
 */
export function useFinishSale(orderUuid: string, host: 'modal' | 'columns') {
	const { setCurrentOrderID } = useCurrentOrderActions();
	const router = useRouter();
	const compact = useTheme().screenSize === 'sm';
	return React.useCallback(() => {
		finishReceipt(orderUuid);
		setCurrentOrderID('');
		if (host === 'modal') returnToTill(router, compact, 'products');
	}, [orderUuid, host, compact, setCurrentOrderID, router]);
}
