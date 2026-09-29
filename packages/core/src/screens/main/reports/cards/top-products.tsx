import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { topProducts } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { ShareBar } from './primitives';

export function TopProductsCard() {
	const t = useT(),
		{ selectedOrders, totals } = useReportsData();
	useReportsScope();
	const { storeId } = useReportsPeriod(),
		{ store, money, quantity, percent } = useReportFormats(storeId);
	const decimals = store?.price_num_decimals;
	const rows = React.useMemo(
		() => topProducts(selectedOrders, totals, decimals),
		[selectedOrders, totals, decimals]
	);
	if (!store) return <CardSkeleton testID="card-products" name={t('reports.card_top_products')} />;
	return (
		<ReportCard
			testID="card-products"
			name={t('reports.card_top_products')}
			figure={quantity(totals.totalItemsSold)}
		>
			{rows.length ? (
				rows.slice(0, 4).map((row, index) => (
					<ShareBar
						key={row.key}
						testID={`card-products-row-${index}`}
						label={row.name || t('common.unknown')}
						value={money(row.amount)}
						share={row.share}
						note={t('reports.share_sold', {
							percent: percent(row.share * 100),
							count: row.quantity,
							quantity: quantity(row.quantity),
						})}
					/>
				))
			) : (
				<Text testID="card-products-empty">{t('reports.no_sales_in_period')}</Text>
			)}
		</ReportCard>
	);
}
