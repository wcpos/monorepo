import * as React from 'react';

import type { PayloadChanges } from '@wcpos/query/mutations';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';

import type { CurrentOrderRecord } from '../contexts/current-order';

/** Keep field resolvers inside the queued write so the adapter can rerun them on retries. */
export function useOrderFieldsWrite() {
	const { localPatch } = useLocalMutation();
	const writeOrderFields = React.useCallback(
		async (order: CurrentOrderRecord, changes: PayloadChanges): Promise<boolean> =>
			!!(await enqueueOrderMutation(order.uuid, () => localPatch({ document: order, changes }))),
		[localPatch]
	);
	return { writeOrderFields };
}
