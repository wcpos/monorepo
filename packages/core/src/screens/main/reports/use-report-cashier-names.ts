import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs';

import { observeLocalRecordsById, useQueryRuntime } from '@wcpos/query';
import { parseRemoteId } from '@wcpos/query/query-state';

import { useT } from '../../../contexts/translations';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { useReportsFilterScope } from './scope';

/**
 * The names Reports shows for these cashier ids, resolved as the Orders page does
 * (`useCashierLabel`): the local customer record, then the site's logged-in users, then
 * "Cashier #{id}". A cashier who never logged in on this device is still named. Not ready until
 * both lookups have answered, so a print or CSV never carries a number for a name still loading.
 */
export function useReportCashierNames(keys: string[]) {
	const runtime = useQueryRuntime();
	const { names: directory, namesReady } = useReportsFilterScope();
	const { format } = useCustomerNameFormat();
	const t = useT();
	const ids = keys.map(parseRemoteId).filter((id) => id !== undefined);
	const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
	const source = React.useMemo(
		() =>
			observeLocalRecordsById(
				runtime.engine,
				'customers',
				key ? key.split(',').map(Number) : []
			).pipe(map((rows) => ({ key, engine: runtime.engine, rows }))),
		[runtime.engine, runtime.locale, key]
	);
	const customers = useObservableState(source);
	// An answer counts only for the ids and the engine it was asked of.
	const ready = namesReady.cashier && customers?.key === key && customers.engine === runtime.engine;
	const raws = [...new Set(keys)].sort().join(',');
	// One object per answer: the Data context hands it to every reader.
	return React.useMemo(() => {
		const names = { ...directory.cashier };
		for (const { payload } of customers?.rows ?? []) {
			if (payload.id != null) names[payload.id] = format(payload);
		}
		for (const raw of raws ? raws.split(',') : []) {
			const id = parseRemoteId(raw);
			if (id !== undefined) names[raw] = names[id] || t('common.cashier_number', { id });
		}
		return { names, ready };
	}, [directory.cashier, customers, raws, ready, format, t]);
}
