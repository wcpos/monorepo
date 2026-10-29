import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { categories } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';
import { LocalProductsContext } from './use-local-products';
import { useLocalCategories } from './use-local-categories';
import { brands, topLevelOf } from '../margin';

export function CategoriesCard({ group = 'categories' }: { group?: 'categories' | 'brands' }) {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ selectedOrders, totals } = useReportsData(),
		{ storeId } = useReportsPeriod();
	const { store, money, moneyWhole, quantity, percent } = useReportFormats(storeId),
		decimals = store?.price_num_decimals;
	const products = React.useContext(LocalProductsContext);
	const tree = useLocalCategories(
		group === 'categories'
			? (products ?? []).flatMap((product) =>
					(product.categories ?? []).flatMap((category) =>
						category.id == null ? [] : [category.id]
					)
				)
			: []
	);
	const summary = React.useMemo(
		() =>
			group === 'brands'
				? brands(selectedOrders, products ?? [], totals, decimals)
				: categories(selectedOrders, products ?? [], totals, decimals, (product) => {
						const category = product.categories?.[0];
						return category?.id && tree?.has(category.id)
							? topLevelOf(category.id, tree)
							: category;
					}),
		[selectedOrders, products, totals, decimals, group, tree]
	);
	const name = group === 'brands' ? t('reports.card_brands') : t('reports.card_categories');
	if (!store || !products || !tree) return <CardSkeleton testID={`card-${group}`} name={name} />;
	const count = { count: summary.parts.length, n: quantity(summary.parts.length) };
	const labels: Record<string, string> = {
		unknown: t('reports.unknown_product'),
		uncategorised: t('reports.uncategorised'),
		nobrand: t('reports.no_brand'),
	};
	return (
		<ReportCard
			onOpen={() => setDetail(group)}
			testID={`card-${group}`}
			name={name}
			figure={money(totals.total)}
		>
			{summary.parts.length ? (
				<Donut
					testID={`card-${group}-donut`}
					centre={{
						figure: moneyWhole(Math.round(totals.total)),
						label:
							group === 'brands' ? t('reports.n_brands', count) : t('reports.n_categories', count),
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
				<Text testID={`card-${group}-empty`}>{t('reports.no_sales_in_period')}</Text>
			)}
			{group === 'brands' &&
				summary.parts.some((row) => row.key === 'nobrand') &&
				!products.some((product) => product.brands?.length) && (
					<Text testID="card-brands-empty" variant="key">
						{t('reports.no_brands_on_products')}
					</Text>
				)}
			{summary.unknownLines > 0 && (
				<Text testID={`card-${group}-unknown`} variant="key">
					{t('reports.lines_without_local_product', {
						n: quantity(summary.unknownLines),
						m: quantity(summary.totalLines),
					})}
				</Text>
			)}
		</ReportCard>
	);
}
