import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import type { WPCredentialsDocument } from '@wcpos/database';

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
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	if (value === undefined) return { name: t('reports.everyone'), id: '' as const };
	const match = cashiers.find((row) => String(row.id) === String(value));
	return { name: match?.display_name ?? String(value), id: String(value) };
}
