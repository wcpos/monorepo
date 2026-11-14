import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportsDirectories } from '../scope';
import { useReportFormats } from '../use-report-formats';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';

export function CashiersCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ figures } = useReportsData(),
		{ storeId } = useReportsPeriod(),
		directory = useReportsDirectories().cashiers;
	const { store, money, moneyWhole, number, percent } = useReportFormats(storeId);
	const rows = figures.byCashier;
	if (!store || !directory)
		return <CardSkeleton testID="card-cashiers" name={t('reports.card_cashiers')} />;
	return (
		<ReportCard
			onOpen={() => setDetail('cashiers')}
			testID="card-cashiers"
			name={t('reports.card_cashiers')}
			figure={number(rows.length)}
		>
			{rows.length ? (
				<Donut
					testID="card-cashiers-donut"
					centre={{
						figure: moneyWhole(Math.round(figures.gross)),
						label: t('reports.n_cashiers', { count: rows.length, n: number(rows.length) }),
					}}
					parts={rows.map((row) => ({
						key: row.key,
						label:
							directory.find((user) => String(user.id) === row.key)?.display_name ||
							(row.key ? `#${row.key}` : t('common.unknown')),
						value: row.amount,
						valueText: money(row.amount),
						shareText: t('reports.percent', { value: percent(row.share * 100) }),
						note: t('reports.n_orders_note', { count: row.orders, n: number(row.orders) }),
					}))}
				/>
			) : (
				<Text testID="card-cashiers-empty">{t('reports.no_sales_in_period')}</Text>
			)}
		</ReportCard>
	);
}
