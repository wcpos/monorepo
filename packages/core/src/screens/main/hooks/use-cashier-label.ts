import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { EngineRecord } from '@wcpos/query';

import { useEngineRecordByWooId } from './use-engine-document';
import { parseRemoteId } from '../../../utils/parse-remote-id';
import { useCustomerNameFormat } from './use-customer-name-format';

export { parseRemoteId } from '../../../utils/parse-remote-id';

interface CashierLabel {
	id: number | undefined;
	label: string;
	record: EngineRecord<'customers'> | undefined;
}

/**
 * Resolve a cashier id to a display label.
 *
 * Cashiers currently live in the customers collection. Keeping this lookup behind a hook lets us
 * move to a dedicated cashiers collection later without changing order UI components.
 */
export function useCashierLabel(value: unknown): CashierLabel {
	const id = parseRemoteId(value);
	const { format } = useCustomerNameFormat();
	const resource = useEngineRecordByWooId('customers', id ?? 0);
	const record$ = React.useMemo(
		() => resource.valueRef$$.pipe(map((value) => value?.current)),
		[resource]
	);
	const record = useObservableState(record$, undefined);

	if (id === undefined) {
		return { id, label: '', record: undefined };
	}

	if (record) {
		return { id, label: format(record.payload), record };
	}

	return { id, label: format({ id }), record: undefined };
}
