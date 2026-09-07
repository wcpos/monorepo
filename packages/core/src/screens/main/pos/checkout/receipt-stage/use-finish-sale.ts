import * as React from 'react';

import { useRouter } from 'expo-router';

import { finishReceipt } from '../checkout-mode';
import { useCurrentOrderActions } from '../../contexts/current-order/context';

export function useFinishSale(orderUuid: string, compact: boolean) {
	const { setCurrentOrderID } = useCurrentOrderActions();
	const router = useRouter();
	return React.useCallback(() => {
		finishReceipt(orderUuid);
		setCurrentOrderID('');
		if (compact) router.replace({ pathname: '/cart' });
	}, [orderUuid, compact, setCurrentOrderID, router]);
}
