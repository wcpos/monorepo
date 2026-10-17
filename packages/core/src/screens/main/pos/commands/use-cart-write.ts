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
	const configRef = React.useRef(configForOrder);
	// Queued writes read the latest committed config, not their enqueue-time closure.
	React.useLayoutEffect(() => {
		configRef.current = configForOrder;
	});
	const write = React.useCallback(
		(input: { document: CurrentOrderRecord; data: object }) =>
			settleCartWrite(input, {
				localPatch,
				configForOrder: (order) => configRef.current(order),
				serverOwnsMoney,
			}),
		[localPatch, serverOwnsMoney]
	);
	// Birth writes use the same settlement/ownership guard before inserting their resident.
	const settleIntent = React.useCallback(
		(document: CurrentOrderRecord, data: object) =>
			settleCartWrite(
				{ document, data },
				{
					localPatch: ({ changes }) => changes(document.getLatest().payload),
					// The birth runs after its dispatch hooks settle: read the config current then.
					configForOrder: (order) => configRef.current(order),
					serverOwnsMoney,
				}
			),
		[serverOwnsMoney]
	);
	return { localPatch: write, settleIntent };
}
