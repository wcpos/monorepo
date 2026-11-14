import * as React from 'react';

import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { POS_SOURCE, useReportsFilterScope } from '../scope';
import { useReportFormats } from '../use-report-formats';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';

export function WhereSoldCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ figures } = useReportsData(),
		{ storeId } = useReportsPeriod();
	const { store, money, moneyWhole, number, percent } = useReportFormats(storeId);
	const {
		allStores,
		registerId: register,
		store: storeFilter,
		names,
		namesReady,
	} = useReportsFilterScope();
	const [view, setView] = React.useState('channels');
	const canChoose = allStores || (register === undefined && figures.registersStamped.length > 1);
	const byStore = allStores && view === 'stores';
	const byRegister = !allStores && canChoose && view === 'registers';
	const activeView = byStore ? 'stores' : byRegister ? 'registers' : 'channels';
	const rows = byStore ? figures.byStore : byRegister ? figures.byRegister : figures.byChannel;
	const channelLabel = (key: string) =>
		key === 'store' ? t('reports.in_store') : t('common.online');
	// The two rows no register stamped: the site's online orders, and POS orders with no register.
	const registerLabel = (key: string) =>
		key === 'online'
			? t('common.online')
			: key === 'unregistered'
				? t('reports.no_register_row')
				: names.register[key] || t('common.unknown');
	const storeLabel = (key: string) =>
		key === 'online'
			? t('common.online')
			: key === 'unassigned'
				? t('reports.no_store_row')
				: names.store[key] || t('common.unknown');
	// The centre counts stores and registers (or channels); the remainder rows are not registers.
	const registerCount =
		byRegister || byStore
			? rows.filter(
					(row) => row.key !== 'online' && row.key !== 'unregistered' && row.key !== 'unassigned'
				).length
			: rows.length;
	if (!store) return <CardSkeleton testID="card-where-sold" name={t('reports.card_where_sold')} />;
	return (
		<ReportCard
			onOpen={() => setDetail(activeView)}
			testID="card-where-sold"
			name={t('reports.card_where_sold')}
			figure={money(figures.gross)}
			head={
				canChoose && (
					<SegmentedControl
						testID="card-where-sold-view"
						hug
						value={activeView}
						onValueChange={setView}
						segments={[
							{ value: 'channels', label: t('reports.channels') },
							allStores
								? { value: 'stores', label: t('reports.stores') }
								: { value: 'registers', label: t('reports.registers') },
						]}
					/>
				)
			}
		>
			{!rows.length ? (
				<Text testID="card-where-sold-empty">{t('reports.no_sales_in_period')}</Text>
			) : (byRegister && !namesReady.register) ||
			  (storeFilter === POS_SOURCE && !namesReady.store) ? (
				rows.map((row) => <Skeleton key={row.key} shape="line" className="w-full" />)
			) : (
				<Donut
					testID="card-where-sold-donut"
					centre={{
						figure: moneyWhole(Math.round(figures.gross)),
						label: byStore
							? t('reports.n_stores', { count: registerCount, n: number(registerCount) })
							: byRegister
								? t('reports.n_registers', {
										count: registerCount,
										n: number(registerCount),
									})
								: t('reports.n_channels', {
										count: registerCount,
										n: number(registerCount),
									}),
					}}
					parts={rows.map((row) => ({
						key: row.key,
						label: byStore
							? storeLabel(row.key)
							: byRegister
								? registerLabel(row.key)
								: channelLabel(row.key),
						value: row.amount,
						valueText: money(row.amount),
						shareText: t('reports.percent', { value: percent(row.share * 100) }),
						note: t('reports.n_orders_note', { count: row.orders, n: number(row.orders) }),
					}))}
				/>
			)}
		</ReportCard>
	);
}
