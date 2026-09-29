import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { categories } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';
import { useLocalProducts } from './use-local-products';

export function CategoriesCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ selectedOrders, totals } = useReportsData(),
		{ storeId } = useReportsPeriod();
	const { store, money, moneyWhole, number, quantity, percent } = useReportFormats(storeId),
		decimals = store?.price_num_decimals;
	const ids = React.useMemo(
		() =>
			selectedOrders.flatMap((order) =>
				(order.line_items ?? []).flatMap((line) =>
					line.product_id == null ? [] : [line.product_id]
				)
			),
		[selectedOrders]
	);
	const products = useLocalProducts(ids);
	const summary = React.useMemo(
		() => categories(selectedOrders, products ?? [], totals, decimals),
		[selectedOrders, products, totals, decimals]
	);
	if (!store || !products)
		return <CardSkeleton testID="card-categories" name={t('reports.card_categories')} />;
	const labels: Record<string, string> = {
		unknown: t('reports.unknown_product'),
		uncategorised: t('reports.uncategorised'),
	};
	return (
		<ReportCard
			onOpen={() => setDetail('categories')}
			testID="card-categories"
			name={t('reports.card_categories')}
			figure={money(totals.total)}
		>
			{summary.parts.length ? (
				<Donut
					testID="card-categories-donut"
					centre={{
						figure: moneyWhole(Math.round(totals.total)),
						label: t('reports.n_categories', {
							count: summary.parts.length,
							n: number(summary.parts.length),
						}),
					}}
					parts={summary.parts.map((row) => ({
						key: row.key,
						label: row.label || labels[row.key] || t('common.unknown'),
						value: row.amount,
						valueText: money(row.amount),
						shareText: t('reports.percent', { value: percent(row.share * 100) }),
						note: t('reports.n_sold', { count: row.quantity, n: quantity(row.quantity) }),
					}))}
				/>
			) : (
				<Text testID="card-categories-empty">{t('reports.no_sales_in_period')}</Text>
			)}
			{summary.unknownLines > 0 && (
				<Text testID="card-categories-unknown" className="text-muted-foreground text-sm">
					{t('reports.lines_without_local_product', {
						n: number(summary.unknownLines),
						m: number(summary.totalLines),
					})}
				</Text>
			)}
		</ReportCard>
	);
}
