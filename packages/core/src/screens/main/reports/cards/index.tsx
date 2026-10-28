import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns/format';

import { useIsPhone } from '@wcpos/components/lib/device';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useReportsData, useReportsPeriod } from '../context';
import { periodLabel } from '../date-button';
import { cogsEnabled } from '../margin';
import { LocalProductsContext, useLocalProducts } from './use-local-products';
import { BrandsCard } from './brands';
import { CardSkeleton } from './card';
import { PaymentsCard } from './payments';
import { WhereSoldCard } from './where-sold';
import { CategoriesCard } from './categories';
import { CashiersCard } from './cashiers';
import { OrdersCard } from './orders';
import { TopProductsCard } from './top-products';
import { TaxesCard } from './taxes';
import { RefundsCard } from './refunds';

type T = (t: (key: string) => string) => string;
// Each name is a literal translation call: the string extractor reads no computed key.
const cards: { id: string; name: T; Component: React.ComponentType }[] = [
	{ id: 'card-orders', name: (t) => t('reports.card_orders'), Component: OrdersCard },
	{ id: 'card-payments', name: (t) => t('reports.card_payments'), Component: PaymentsCard },
	{ id: 'card-where-sold', name: (t) => t('reports.card_where_sold'), Component: WhereSoldCard },
	{ id: 'card-products', name: (t) => t('reports.card_top_products'), Component: TopProductsCard },
	{ id: 'card-categories', name: (t) => t('reports.card_categories'), Component: CategoriesCard },
	{ id: 'card-brands', name: (t) => t('reports.card_brands'), Component: BrandsCard },
	{ id: 'card-cashiers', name: (t) => t('reports.card_cashiers'), Component: CashiersCard },
	{ id: 'card-taxes', name: (t) => t('reports.card_taxes'), Component: TaxesCard },
	{ id: 'card-refunds', name: (t) => t('reports.card_refunds'), Component: RefundsCard },
];
// Three cards need about 330 points each for their stat grids plus two gaps; two need 290.
const THREE_COLUMNS_MIN_WIDTH = 1000;
const TWO_COLUMNS_MIN_WIDTH = 600;
export function PeriodSection() {
	const { selectedOrders } = useReportsData();
	const products = useLocalProducts(
		selectedOrders.flatMap((order) =>
			(order.line_items ?? []).flatMap((line) => (line.product_id == null ? [] : [line.product_id]))
		)
	);
	const enabled = cogsEnabled(selectedOrders, products ?? []);
	const visibleCards = cards.filter((card) => card.id !== 'card-brands' || enabled);
	const t = useT(),
		{ roomy } = useTheme(),
		phone = useIsPhone(),
		{ dateRange, storeId, timezone } = useReportsPeriod();
	const { presets } = useStoreDay(storeId),
		{ formatDate } = useLocalDate();
	const scope = {
		from: format(dateRange.start, 'yyyy-MM-dd', zoneOptions(timezone)),
		to: format(dateRange.end, 'yyyy-MM-dd', zoneOptions(timezone)),
	};
	const { text } = periodLabel({ scope, timezone, ranges: presets(), t, formatDate });
	// Columns follow the measured width, not the breakpoint: the app calls a 1024-point tablet
	// `lg`, where three cards cramp their stat grids. Until the first layout, the breakpoint.
	const [width, setWidth] = React.useState<number | null>(null);
	const columns =
		width === null
			? phone
				? 1
				: roomy
					? 3
					: 2
			: width >= THREE_COLUMNS_MIN_WIDTH
				? 3
				: width >= TWO_COLUMNS_MIN_WIDTH
					? 2
					: 1;
	return (
		<LocalProductsContext.Provider value={products}>
			<View
				testID="reports-period-section"
				className="gap-4"
				onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
			>
				<Text testID="reports-period-title" role="heading" className="text-lg font-semibold">
					{text}
				</Text>
				{Array.from({ length: Math.ceil(visibleCards.length / columns) }, (_, row) => (
					<View key={row} className="flex-row gap-4">
						{Array.from({ length: columns }, (_, cell) => {
							const card = visibleCards[row * columns + cell];
							return (
								<View key={cell} className="min-w-0 flex-1">
									{card && (
										<ErrorBoundary>
											<Suspense fallback={<CardSkeleton testID={card.id} name={card.name(t)} />}>
												<card.Component />
											</Suspense>
										</ErrorBoundary>
									)}
								</View>
							);
						})}
					</View>
				))}
			</View>
		</LocalProductsContext.Provider>
	);
}
