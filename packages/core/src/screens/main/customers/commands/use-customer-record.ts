import * as React from 'react';

import type { CustomerPayload, EngineRecord } from '@wcpos/query';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';

export function useCustomerRecord() {
	const { create } = useMutation({ collectionName: 'customers', showSuccessToast: false });
	const { localPatch } = useLocalMutation();
	const createCustomer = React.useCallback(
		(data: Record<string, unknown>): Promise<EngineRecord<'customers'> | undefined> =>
			create({ data }).catch(() => undefined) as Promise<EngineRecord<'customers'> | undefined>,
		[create]
	);
	const saveCustomerFields = React.useCallback(
		async (customer: EngineRecord<'customers'>, data: Partial<CustomerPayload>): Promise<boolean> =>
			!!(await localPatch({ document: customer, data }))?.document,
		[localPatch]
	);
	return { createCustomer, saveCustomerFields };
}
