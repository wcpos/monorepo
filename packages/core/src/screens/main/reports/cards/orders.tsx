import * as React from 'react';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useIncludedStatus, useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { ordersSummary, statusCounts } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Legend, ProportionalBar, StatGrid } from './primitives';

const colors = {
	completed: 'bg-success',
	processing: 'bg-c3',
	'on-hold': 'bg-warning',
	pending: 'bg-c5',
	refunded: 'bg-destructive',
};
export function OrdersCard() {
	const t = useT(),
		{ allOrders, selectedOrders, totals } = useReportsData(),
		included = useIncludedStatus(),
		{ statusMode, setDetail } = useReportsScope();
	const { storeId } = useReportsPeriod(),
		{ store, money, number, quantity, percent } = useReportFormats(storeId);
	const decimals = store?.price_num_decimals;
	const summary = React.useMemo(
		() => ordersSummary(selectedOrders, totals, decimals),
		[selectedOrders, totals, decimals]
	);
	const status = React.useMemo(
		() => statusCounts(selectedOrders, statusMode),
		[selectedOrders, statusMode]
	);
	if (!store) return <CardSkeleton testID="card-orders" name={t('reports.card_orders')} />;
	const segments = [...status.segments, { status: 'refunded' as const, count: status.refunded }];
	const words = {
		completed: t('common.completed'),
		processing: t('common.processing'),
		'on-hold': t('common.on_hold'),
		pending: t('common.pending'),
		refunded: t('reports.refunded'),
	};
	const needs = [
		[status.needsYou.processing, 'reports.n_processing'],
		[status.needsYou.onHold, 'reports.n_on_hold'],
		[status.needsYou.pending, 'reports.n_pending'],
	] as const;
	const attention = needs
		.filter(([count]) => count > 0)
		.map(([count, key]) => t(key, { count }))
		.join(' · ');
	const stats = [
		['average', 'average_order', money(summary.average)],
		['median', 'median', money(summary.median)],
		['largest', 'largest', summary.largest === null ? '—' : money(summary.largest)],
		['items', 'items_sold', quantity(summary.items)],
		['items-per-order', 'items_per_order', percent(summary.itemsPerOrder)],
		['discounts', 'discounts', money(summary.discounts)],
	];
	return (
		<ReportCard
			onOpen={() => setDetail('orders')}
			testID="card-orders"
			name={t('reports.card_orders')}
			figure={number(summary.count)}
		>
			{summary.count === 0 ? (
				// Nothing counted: either the period has no orders, or every one of them is unticked.
				<Text testID="card-orders-empty">
					{t(
						allOrders.some(included) ? 'reports.all_orders_left_out' : 'reports.no_orders_in_period'
					)}
				</Text>
			) : (
				<>
					<StatGrid
						items={stats.map(([id, label, value]) => ({
							label: t(`reports.${label}`),
							value,
							testID: `card-orders-${id}`,
						}))}
					/>
					<ProportionalBar
						testID="card-orders-bar"
						segments={segments.map((row) => ({
							share: row.count / summary.count,
							className: colors[row.status],
						}))}
					/>
					<Legend
						items={segments.map((row) => ({
							label: words[row.status],
							value: number(row.count),
							swatchClassName: colors[row.status],
							testID: `card-orders-status-${row.status}`,
						}))}
					/>
					<StatusBadge
						testID="card-orders-needs"
						variant={attention ? 'warning' : 'success'}
						label={attention || t('reports.nothing_needs_you')}
					/>
				</>
			)}
		</ReportCard>
	);
}
