import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';

import { useDocField } from '@wcpos/query';
import { Icon } from '@wcpos/components/icon';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Card } from '@wcpos/components/card';
import { Badge } from '@wcpos/components/badge';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/query/register-session';

import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { useT } from '../../../../contexts/translations';
import { useStoreDay, useViewedStore, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { ClosureStats, closureTotals } from './closure-stats';

import type { SessionSummary } from './session-card';

export function ClosureList({
	rows,
	onSelect,
	unavailableIds,
	storeId,
	sessions = [],
	sessionRows,
	blind,
	scopeDay,
	status,
	footer,
	showEmpty = true,
}: {
	rows: readonly ClosureRow[];
	storeId?: number;
	sessions?: readonly SessionSummary[];
	sessionRows?: React.ReactNode;
	blind?: boolean;
	scopeDay?: string;
	status?: React.ReactNode;
	footer?: React.ReactNode;
	showEmpty?: boolean;
	unavailableIds?: ReadonlySet<string>;
	onSelect?: (row: ClosureRow) => void;
}) {
	const t = useT();
	const viewedStore = useViewedStore(storeId);
	const settings = useDocField(viewedStore, (value) => value);
	const { format } = useCurrencyFormat({
		currency: settings?.currency,
		currencyPosition: settings?.currency_pos,
		decimalScale: settings?.price_num_decimals,
		decimalSeparator: settings?.price_decimal_sep,
		thousandSeparator: settings?.price_thousand_sep,
	});
	const { heading, time } = useStoreDayLabel(storeId);
	// The viewed store's registers, never the bound store's.
	const names = useRegisterNames(storeId);

	const [filter, setFilter] = React.useState('all');
	const { timezone } = useStoreDay(storeId);
	const today = formatDate(new Date(), 'yyyy-MM-dd', zoneOptions(timezone));
	const todayRows = rows.filter((row) => row.business_day === today);
	const result = (variance: number) =>
		variance
			? `${format(Math.abs(variance))} ${variance < 0 ? t('register.short') : t('register.over')}`
			: t('reports.exact');
	const tone = (variance: number) =>
		variance < 0 ? 'text-bad' : variance > 0 ? 'text-ok' : 'text-muted-foreground';
	const dayHeading = (day: string | undefined, dayRows: readonly ClosureRow[]) => {
		const total = closureTotals(dayRows);
		return (
			<View
				testID={`closure-day-${day}`}
				className="bg-table-header flex-row justify-between px-4 py-2"
			>
				<Text>{day ? heading(day) : ''}</Text>
				{!!dayRows.length && (
					<Text className="text-muted-foreground tabular-nums">
						{format(total.counted)} {t('reports.counted').toLocaleLowerCase()} ·{' '}
						<Text className={tone(total.variance)}>{result(total.variance)}</Text>
					</Text>
				)}
			</View>
		);
	};
	const visibleRows = filter === 'open' ? [] : rows;
	const card = (
		<Card>
			<View className="flex-row items-center justify-between border-b px-3 py-2">
				<SegmentedControl
					value={filter}
					onValueChange={setFilter}
					segments={[
						{ value: 'all', label: t('reports.all'), testID: 'closures-filter-all' },
						{ value: 'open', label: t('reports.open'), testID: 'closures-filter-open' },
						{ value: 'closed', label: t('register.closed'), testID: 'closures-filter-closed' },
					]}
				/>
				<Text className="text-muted-foreground">
					{t('reports.n_sessions', { count: rows.length + sessions.length })}
				</Text>
			</View>
			{(sessions.length > 0 || todayRows.length > 0) && dayHeading(today, todayRows)}
			{/* Keep the readers mounted when filtering, so toggling Closed neither drops summaries nor reloads. */}
			<View style={filter === 'closed' ? { display: 'none' } : undefined}>{sessionRows}</View>
			{scopeDay === today && !todayRows.length && sessions.length > 0 && filter !== 'open' && (
				<ListRow size="sm">
					<Text className="text-muted-foreground">{t('reports.no_closures_today')}</Text>
				</ListRow>
			)}
			{status}
			{!rows.length && !sessions.length && showEmpty && (
				<Text testID="closures-empty" className="p-4">
					{t('reports.no_closures')}
				</Text>
			)}

			{visibleRows.map((row, index) => {
				const variance = Number(row.variance.cash ?? 0);
				const badge = !row.synced_rows_at
					? t('register.unsynced')
					: row.corrections_count
						? t('reports.corrected')
						: null;
				return (
					<React.Fragment key={row.id}>
						{row.business_day !== today &&
							(index === 0 || row.business_day !== rows[index - 1]?.business_day) &&
							dayHeading(
								row.business_day,
								rows.filter((r) => r.business_day === row.business_day)
							)}
						<ListRow
							disabled={unavailableIds?.has(row.server_closure_id ?? row.id)}
							onPress={() => onSelect?.(row)}
							testID={`closure-row-${row.id}`}
							// Ruled above, not below: each day's heading opens its rows inside the card.
							className="border-t border-b-0"
							bodyClassName="gap-1"
							trailing={
								<>
									<Text testID={`closure-counted-${row.id}`} className="tabular-nums">
										{format(Number(row.counted.cash ?? 0))}
									</Text>
									<Text
										testID={`closure-result-${row.id}`}
										className={`w-24 text-right tabular-nums ${variance < 0 ? 'text-bad' : variance > 0 ? 'text-ok' : 'text-muted-foreground'}`}
									>
										{result(variance)}
									</Text>
									<Icon name="chevronRight" className="text-muted-foreground" />
								</>
							}
						>
							<Text>
								{t('reports.closure_n', { n: row.server_number ?? row.number })} ·{' '}
								{String(
									row.breakdowns.register_name ||
										names[row.register_id] ||
										row.register_id.slice(0, 8)
								)}
							</Text>
							<Text className="text-muted-foreground">
								{time(row.opened_at)} → {time(row.closed_at)} ·{' '}
								{String(row.breakdowns.closed_by_name || t('register.unknown_cashier'))}
							</Text>
							{unavailableIds?.has(row.server_closure_id ?? row.id) && (
								<Text testID={`closure-unavailable-${row.id}`}>
									{t('reports.unavailable_offline')}
								</Text>
							)}
							{badge && (
								<Badge
									testID={`closure-badge-${row.id}`}
									tinted
									variant="warning"
									size="lg"
									className="self-start"
								>
									<Text>{badge}</Text>
								</Badge>
							)}
						</ListRow>
					</React.Fragment>
				);
			})}
			{footer}
		</Card>
	);
	return (
		<>
			<ClosureStats rows={rows} sessions={sessions} blind={blind} storeId={storeId} />
			{card}
		</>
	);
}
