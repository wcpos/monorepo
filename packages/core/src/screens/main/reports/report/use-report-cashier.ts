import { useT } from '../../../../contexts/translations';
import { useReportsData } from '../context';
import { useReportsFilterScope } from '../scope';

/**
 * The cashier the report is scoped to, from the query's `cashier` filter (whoever set it: the chip
 * or a cashier cell), named as every other Reports surface names a cashier; Everyone with no
 * filter. Never the session cashier.
 */
export function useReportCashier() {
	const t = useT();
	const value = useReportsFilterScope().cashierId;
	const { cashierNames } = useReportsData();
	if (value === undefined) return { name: t('reports.everyone'), id: '' as const, ready: true };
	return { name: cashierNames.names[value] ?? value, id: value, ready: cashierNames.ready };
}
