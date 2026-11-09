import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { CardSkeleton, ReportCard } from './card';
import { Legend, ProportionalBar, StatGrid } from './primitives';

export function RefundsCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ figures, periodRefunds } = useReportsData();
	const { storeId } = useReportsPeriod(),
		{ store, money, percent, quantity } = useReportFormats(storeId);
	const summary = figures.refunds;
	if (!store || !periodRefunds)
		return <CardSkeleton testID="card-refunds" name={t('reports.card_refunds')} />;
	return (
		<ReportCard
			onOpen={() => setDetail('refunds')}
			testID="card-refunds"
			name={t('reports.card_refunds')}
			figure={money(summary.refunded)}
		>
			<StatGrid
				items={[
					{
						label: t('reports.refunded'),
						value: money(summary.refunded),
						testID: 'card-refunds-refunded',
					},
					{
						label: t('common.orders'),
						value: t('reports.n_of_m', {
							n: quantity(summary.ordersWithRefunds),
							m: quantity(summary.orders),
						}),
						testID: 'card-refunds-orders',
					},
					{
						label: t('reports.kept'),
						value:
							summary.keptShare === null
								? '—'
								: t('reports.percent', { value: percent(summary.keptShare * 100) }),
						testID: 'card-refunds-kept',
					},
				]}
			/>
			<ProportionalBar
				testID="card-refunds-bar"
				segments={[
					{ share: summary.keptShare ?? 0, className: 'bg-c1' },
					{
						share: figures.gross ? summary.refunded / figures.gross : 0,
						className: 'bg-bad',
					},
				]}
			/>
			<Legend
				items={[
					{ label: t('reports.kept'), value: money(summary.kept), swatchClassName: 'bg-c1' },
					{
						label: t('reports.refunded'),
						value: money(summary.refunded),
						swatchClassName: 'bg-bad',
					},
				]}
			/>
			{summary.ordersWithRefunds === 0 && (
				<Text testID="card-refunds-none">{t('reports.none_in_period')}</Text>
			)}
		</ReportCard>
	);
}
