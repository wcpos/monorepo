import { useT } from '../../../../contexts/translations';
import { useQueryState } from '../../../../query';
import { useReportsScope } from '../context';

/** The cashier the report is scoped to: the chip's choice, or Everyone; never the session cashier. */
export function useReportCashier() {
	const t = useT();
	const value = useQueryState<'orders'>().filters.cashier;
	const { cashierName } = useReportsScope();
	return value === undefined
		? { name: t('reports.everyone'), id: '' as const }
		: { name: cashierName ?? String(value), id: String(value) };
}
