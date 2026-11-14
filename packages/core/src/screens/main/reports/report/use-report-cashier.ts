import { useDocField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useReportsDirectories, useReportsFilterScope } from '../scope';

/**
 * The cashier the report is scoped to, resolved from the query's `cashier` filter against the
 * credentials directory (whoever set the filter: the chip or a cashier cell); Everyone with no
 * filter. Never the session cashier.
 */
export function useReportCashier() {
	const t = useT();
	const value = useReportsFilterScope().cashierId;
	// Undefined until the directory has emitted: a name cannot be resolved before then.
	const { cashiers } = useReportsDirectories();
	const match = value === undefined ? undefined : cashiers?.find((row) => String(row.id) === value);
	// The name is read live from the document: the directory does not re-emit on a rename.
	const displayName = useDocField(match, (row) => row.display_name);
	if (value === undefined) return { name: t('reports.everyone'), id: '' as const, ready: true };
	return { name: displayName ?? value, id: value, ready: !!cashiers };
}
