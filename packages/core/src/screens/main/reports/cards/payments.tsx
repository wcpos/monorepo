import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { tenders } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';

export function PaymentsCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ selectedOrders, totals } = useReportsData(),
		{ storeId } = useReportsPeriod();
	const { store, money, moneyWhole, number, percent } = useReportFormats(storeId),
		decimals = store?.price_num_decimals;
	const rows = React.useMemo(
		() => tenders(selectedOrders, totals, decimals),
		[selectedOrders, totals, decimals]
	);
	if (!store) return <CardSkeleton testID="card-payments" name={t('reports.card_payments')} />;
	const labels: Record<string, string> = {
		cash: t('common.cash'),
		unpaid: t('reports.unpaid'),
		unknown: t('common.unknown'),
	};
	return (
		<ReportCard
			onOpen={() => setDetail('payments')}
			testID="card-payments"
			name={t('reports.card_payments')}
			figure={money(totals.total)}
		>
			{rows.length ? (
				<Donut
					testID="card-payments-donut"
					centre={{
						figure: moneyWhole(Math.round(totals.total)),
						label: t('reports.n_ways', { count: rows.length, n: number(rows.length) }),
					}}
					parts={rows.map((row) => ({
						key: row.key,
						label: row.label || labels[row.key] || t('common.unknown'),
						value: row.amount,
						valueText: money(row.amount),
						shareText: t('reports.percent', { value: percent(row.share * 100) }),
						note: t('reports.n_orders_note', { count: row.orders, n: number(row.orders) }),
					}))}
				/>
			) : (
				<Text testID="card-payments-empty">{t('reports.no_payments_in_period')}</Text>
			)}
		</ReportCard>
	);
}
