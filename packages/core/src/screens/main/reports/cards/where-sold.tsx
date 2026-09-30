import * as React from 'react';

import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useQueryState } from '../../../../query';
import {
	useRegisterNames,
	useRegisterNamesReady,
} from '../../../../services/register/use-register-names';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { useReportFormats } from '../use-report-formats';
import { channels, registers } from './aggregate';
import { CardSkeleton, ReportCard } from './card';
import { Donut } from './donut';

export function WhereSoldCard() {
	const { setDetail } = useReportsScope();
	const t = useT(),
		{ selectedOrders, totals } = useReportsData(),
		{ storeId } = useReportsPeriod();
	const { store, money, moneyWhole, number, percent } = useReportFormats(storeId);
	const names = useRegisterNames(storeId),
		ready = useRegisterNamesReady(storeId);
	const register = useQueryState<'orders'>().filters.register;
	const [view, setView] = React.useState('channels');
	const canChoose = register === undefined && totals.registerArray.length > 1;
	const byRegister = canChoose && view === 'registers';
	const rows = React.useMemo(
		() => (byRegister ? registers(selectedOrders, totals) : channels(selectedOrders, totals)),
		[byRegister, selectedOrders, totals]
	);
	const channelLabel = (key: string) => t(key === 'store' ? 'reports.in_store' : 'common.online');
	// The two rows no register stamped: the site's online orders, and POS orders with no register.
	const registerLabel = (key: string) =>
		key === 'online'
			? t('common.online')
			: key === 'unregistered'
				? t('reports.no_register_row')
				: names[key] || t('common.unknown');
	// The centre counts registers (or channels); the remainder rows are not registers.
	const registerCount = byRegister
		? rows.filter((row) => row.key !== 'online' && row.key !== 'unregistered').length
		: rows.length;
	if (!store) return <CardSkeleton testID="card-where-sold" name={t('reports.card_where_sold')} />;
	return (
		<ReportCard
			onOpen={() => setDetail(view === 'registers' && canChoose ? 'registers' : 'channels')}
			testID="card-where-sold"
			name={t('reports.card_where_sold')}
			figure={money(totals.total)}
			head={
				canChoose && (
					<SegmentedControl
						testID="card-where-sold-view"
						value={view}
						onValueChange={setView}
						segments={[
							{ value: 'channels', label: t('reports.channels') },
							{ value: 'registers', label: t('reports.registers') },
						]}
					/>
				)
			}
		>
			{!rows.length ? (
				<Text testID="card-where-sold-empty">{t('reports.no_sales_in_period')}</Text>
			) : byRegister && !ready ? (
				rows.map((row) => <Skeleton key={row.key} shape="line" className="w-full" />)
			) : (
				<Donut
					testID="card-where-sold-donut"
					centre={{
						figure: moneyWhole(Math.round(totals.total)),
						label: t(byRegister ? 'reports.n_registers' : 'reports.n_channels', {
							count: registerCount,
							n: number(registerCount),
						}),
					}}
					parts={rows.map((row) => ({
						key: row.key,
						label: byRegister ? registerLabel(row.key) : channelLabel(row.key),
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
