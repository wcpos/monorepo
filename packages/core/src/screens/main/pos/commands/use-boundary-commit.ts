import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { useBoundaryCommitter } from './use-boundary-committer';

import type { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

/** The cashier's boundary commit for a command's order, written through the command's patch. */
export function useBoundaryCommit(write: ReturnType<typeof useLocalMutation>['localPatch']) {
	const commit = useBoundaryCommitter('user');
	return React.useCallback(
		(order: CurrentOrderRecord, queue: OrderMutationContext) =>
			commit({
				order: order as EngineRecord<'orders'>,
				queue,
				// Coupon carts belong to the continuation, including arrivals during guards.
				allowed: (payload) => !payload.coupon_lines?.some((line) => line.code != null),
				write: (changes) => write({ document: order, changes }),
			}),
		[commit, write]
	);
}
