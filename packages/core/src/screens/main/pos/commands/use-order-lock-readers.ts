import * as React from 'react';

import { getCheckoutModeSnapshot, getOrderSaveState } from '../checkout/checkout-mode';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';

import type { OrderLockReaders } from './paid-balance-boundary';

const inCheckout = (uuid: string) => getCheckoutModeSnapshot().checkoutOrders.has(uuid);

/** The order locks as a command reads them, at write time; a rendered row subscribes instead. */
export function useOrderLockReaders(): OrderLockReaders {
	const serverOwnsMoney = useServerOwnsMoneyReader();
	return React.useMemo(
		() => ({ serverOwnsMoney, orderSaveState: getOrderSaveState, inCheckout }),
		[serverOwnsMoney]
	);
}
