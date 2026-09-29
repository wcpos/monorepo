import * as React from 'react';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod } from '../context';
import { useReportFormats } from '../use-report-formats';
import { taxesByRate } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Legend, ProportionalBar, StatGrid } from './primitives';

const colors = ['bg-c1', 'bg-c2', 'bg-c3', 'bg-c4', 'bg-c5'];
export function TaxesCard() {
	const t = useT(),
		{ selectedOrders, totals } = useReportsData();
	const { storeId } = useReportsPeriod(),
		{ store, money } = useReportFormats(storeId);
	const decimals = store?.price_num_decimals;
	const summary = React.useMemo(
		() => taxesByRate(selectedOrders, totals, decimals),
		[selectedOrders, totals, decimals]
	);
	if (!store) return <CardSkeleton testID="card-taxes" name={t('reports.card_taxes')} />;
	return (
		<ReportCard testID="card-taxes" name={t('reports.card_taxes')} figure={money(summary.tax)}>
			<ProportionalBar
				testID="card-taxes-bar"
				segments={summary.rows.map((row, index) => ({
					share: row.share,
					className: colors[Math.min(index, 4)],
				}))}
			/>
			{summary.tax !== 0 && (
				<Legend
					items={summary.rows.map((row, index) => ({
						label: row.label,
						value: money(row.tax),
						swatchClassName: colors[Math.min(index, 4)],
						note: row.net === null ? undefined : t('reports.on_net', { amount: money(row.net) }),
					}))}
				/>
			)}
			<StatGrid
				items={(['net', 'tax', 'gross'] as const).map((key) => ({
					label: t(key === 'tax' ? 'common.tax' : `reports.document.${key}`),
					value: money(summary[key]),
					testID: `card-taxes-${key}`,
				}))}
			/>
		</ReportCard>
	);
}
