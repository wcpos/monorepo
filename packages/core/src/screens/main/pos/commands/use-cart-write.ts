import * as React from 'react';

import { settleCartWrite } from './settle-cart-write';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCartConfigForOrder } from '../hooks/use-cart-config';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

/** Same-slot write: callers already hold the per-order queue, including coupon writers. */
export function useCartWrite() {
	const { localPatch } = useLocalMutation();
	const configForOrder = useCartConfigForOrder();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const write = React.useCallback(
		(input: { document: CurrentOrderRecord; data: object }) =>
			settleCartWrite(input, { localPatch, configForOrder, serverOwnsMoney }),
		[localPatch, configForOrder, serverOwnsMoney]
	);
	return { localPatch: write };
}
