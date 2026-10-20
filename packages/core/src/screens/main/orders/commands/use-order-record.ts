import * as React from 'react';

import type { EngineRecord, OrderPayload } from '@wcpos/query';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

export function useOrderRecord() {
	const { localPatch } = useLocalMutation();
	const saveOrderFields = React.useCallback(
		async (order: EngineRecord<'orders'>, data: Partial<OrderPayload>): Promise<boolean> =>
			!!(await localPatch({ document: order, data }))?.document,
		[localPatch]
	);
	/** Null when the local write failed; otherwise the queued row to follow, if one was queued. */
	const reopenOrder = React.useCallback(
		async (
			order: EngineRecord<'orders'>,
			data: Pick<OrderPayload, 'status' | 'meta_data'>
		): Promise<{ mutationId?: string } | null> => {
			const result = await localPatch({ document: order, data });
			if (!result?.document) return null;
			return { mutationId: result.mutationId };
		},
		[localPatch]
	);
	return { saveOrderFields, reopenOrder };
}
