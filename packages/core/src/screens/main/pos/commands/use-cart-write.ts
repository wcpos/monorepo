import * as React from 'react';

import { useBoundaryCommit } from './use-boundary-commit';
import { settleCartWrite } from './settle-cart-write';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCartConfigReader } from '../hooks/use-cart-config';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';

import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { CurrentOrderRecord } from '../contexts/current-order/context';

/** Same-slot write: callers already hold the per-order queue, including coupon writers. */
export function useCartWrite() {
	const { localPatch } = useLocalMutation();
	const commitAtBoundary = useBoundaryCommit(localPatch);
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const write = React.useCallback(
		(input: { document: CurrentOrderRecord; data: object; queue: OrderMutationContext }) =>
			settleCartWrite(input, {
				localPatch,
				commitAtBoundary,
				configForOrder,
				serverOwnsMoney,
			}),
		[localPatch, configForOrder, serverOwnsMoney, commitAtBoundary]
	);
	// Birth writes use the same settlement/ownership guard before inserting their resident.
	const settleIntent = React.useCallback(
		(document: CurrentOrderRecord, data: object) =>
			settleCartWrite(
				{ document, data },
				{
					localPatch: ({ changes }) => changes(document.getLatest().payload),
					// The birth runs after its dispatch hooks settle: read the config current then.
					configForOrder,
					serverOwnsMoney,
				}
			),
		[configForOrder, serverOwnsMoney]
	);
	return { localPatch: write, settleIntent };
}
