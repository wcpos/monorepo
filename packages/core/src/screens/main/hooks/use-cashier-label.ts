import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter } from 'rxjs';
import { map } from 'rxjs/operators';

import type { EngineRecord } from '@wcpos/query';
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';
import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
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
 * A staff user who is not a customer is named from the site's logged-in users instead of an id.
 * A cashier found in neither reads "Cashier #{id}" (`common.cashier_number`), not a customer's "ID: {id}".
 */
export function useCashierLabel(value: unknown): CashierLabel {
	const id = parseRemoteId(value);
	const { format } = useCustomerNameFormat();
	const t = useT();
	const { site } = useStoreSession();
	const resource = useEngineRecordByWooId('customers', id ?? 0);
	const record$ = React.useMemo(
		() => resource.valueRef$$.pipe(map((value) => value?.current)),
		[resource]
	);
	const record = useObservableState(record$, undefined);
	const credentials$ = React.useMemo(
		() => observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ)),
		[site]
	);
	const credentials = useObservableState(credentials$, undefined);

	if (id === undefined) {
		return { id, label: '', record: undefined };
	}

	if (record) {
		return { id, label: format(record.payload), record };
	}

	const staffName = credentials?.find((row) => row.id === id)?.display_name;
	if (staffName) {
		return { id, label: staffName, record: undefined };
	}

	return { id, label: t('common.cashier_number', { id }), record: undefined };
}
