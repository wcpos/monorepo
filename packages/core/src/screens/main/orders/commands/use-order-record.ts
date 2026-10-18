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
	const reopenOrder = React.useCallback(
		async (
			order: EngineRecord<'orders'>,
			data: Pick<OrderPayload, 'status' | 'meta_data'>
		): Promise<boolean> => !!(await localPatch({ document: order, data }))?.document,
		[localPatch]
	);
	return { saveOrderFields, reopenOrder };
}
