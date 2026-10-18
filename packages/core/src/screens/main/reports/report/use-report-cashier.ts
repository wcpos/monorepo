import * as React from 'react';

import { filter } from 'rxjs';
import { useObservableState } from 'observable-hooks';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useQueryState } from '../../../../query';

/**
 * The cashier the report is scoped to, resolved from the query's `cashier` filter against the
 * credentials directory (whoever set the filter: the chip or a cashier cell); Everyone with no
 * filter. Never the session cashier.
 */
export function useReportCashier() {
	const t = useT();
	const value = useQueryState<'orders'>().filters.cashier;
	const { site } = useStoreSession();
	const source = React.useMemo(
		() => observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ)),
		[site]
	);
	// Undefined until the directory has emitted: a name cannot be resolved before then.
	const cashiers = useObservableState(source);
	const match =
		value === undefined ? undefined : cashiers?.find((row) => String(row.id) === String(value));
	// The name is read live from the document: the directory does not re-emit on a rename.
	const displayName = useDocField(match, (row) => row.display_name);
	if (value === undefined) return { name: t('reports.everyone'), id: '' as const, ready: true };
	return { name: displayName ?? String(value), id: String(value), ready: !!cashiers };
}
