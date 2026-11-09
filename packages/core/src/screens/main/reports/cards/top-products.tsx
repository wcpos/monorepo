import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { CardSkeleton, ReportCard } from './card';
import { ShareBar } from './primitives';

export function TopProductsCard() {
	const t = useT(),
		{ figures } = useReportsData();
	const { setDetail } = useReportsScope();
	const { storeId } = useReportsPeriod(),
		{ store, money, quantity, percent } = useReportFormats(storeId);
	// The card is gross: its panel nets the period refunds (ledger 35, 36).
	const rows = figures.products.gross;
	if (!store) return <CardSkeleton testID="card-products" name={t('reports.card_top_products')} />;
	return (
		<ReportCard
			onOpen={() => setDetail('products')}
			testID="card-products"
			name={t('reports.card_top_products')}
			figure={quantity(figures.items)}
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
