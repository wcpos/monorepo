import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';
import get from 'lodash/get';

import { useDocField } from '@wcpos/query';
import { Icon } from '@wcpos/components/icon';
import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { TONE } from '@wcpos/components/lib/tone';
import { Card } from '@wcpos/components/card';
import { Badge } from '@wcpos/components/badge';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/query/register-session';

import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { useT } from '../../../../contexts/translations';
import { useStoreDay, useViewedStore, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import {
	closureResult,
	resultAmount,
	resultText,
	resultWord,
} from '../../../../services/register-session/closure-result';
import { varianceAmount } from '../../../../services/register-session/count-money';
import { settledRow } from '../../../../services/register-session/settled-figures';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { ClosureStats, closureTotals } from './closure-stats';

import type { SessionSummary } from './session-card';

export type ClosureFilter = 'all' | 'open' | 'closed';

export function ClosureList({
	rows,
	onSelect,
	unavailableIds,
	storeId,
	sessions: allSessions = [],
	sessionRows,
	blind,
	scopeDay,
	scopeFrom,
	scopeTo,
	status,
	footer,
	showEmpty = true,
	partial = false,
	unknown = false,
	filter: controlledFilter,
	onFilterChange,
}: {
	rows: readonly ClosureRow[];
	storeId?: number;
	sessions?: readonly SessionSummary[];
	sessionRows?: React.ReactNode;
	blind?: boolean;
	scopeDay?: string;
	/** The scope's days; open sessions belong to today and count only when the scope spans it. */
	scopeFrom?: string;
	scopeTo?: string;
	status?: React.ReactNode;
	footer?: React.ReactNode;
	showEmpty?: boolean;
	/** More pages of the period remain unloaded (the strip says so). */
	partial?: boolean;
	/** The closures read is unavailable (offline): counts are unknown, not zero. */
	unknown?: boolean;
	/** The All / Open / Closed filter, owned by the room when it must share it (the export). */
	filter?: ClosureFilter;
	onFilterChange?: (filter: ClosureFilter) => void;
	unavailableIds?: ReadonlySet<string>;
	onSelect?: (row: ClosureRow) => void;
}) {
	const t = useT();
	const phone = useIsPhone();
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

	const [localFilter, setLocalFilter] = React.useState<ClosureFilter>('all');
	const filter = controlledFilter ?? localFilter;
	const setFilter = (next: ClosureFilter) => {
		setLocalFilter(next);
		onFilterChange?.(next);
	};
	const { timezone } = useStoreDay(storeId);
	const today = formatDate(new Date(), 'yyyy-MM-dd', zoneOptions(timezone));
	// A historical scope keeps its figures and its list free of today's open tills (Codex, #3048).
	const inPeriod = !scopeFrom || !scopeTo || (scopeFrom <= today && today <= scopeTo);
	const sessions = inPeriod ? allSessions : [];
	const todayRows = rows.filter((row) => row.business_day === today);
	// Closure money is stored at four decimals; the list shows the SETTLED result throughout.
	const dayHeading = (day: string | undefined, dayRows: readonly ClosureRow[]) => {
		const settled = dayRows.map(settledRow);
		const total = closureTotals(settled);
		const result = closureResult({ recorded: settled }, 4);
		return (
			<View
				testID={`closure-day-${day}`}
				className="bg-table-header flex-row justify-between px-4 py-2"
			>
				<Text>{day ? heading(day) : ''}</Text>
				{!!dayRows.length && (
					<Text className="text-muted-foreground tabular-nums">
						{format(total.counted)} {t('reports.counted').toLocaleLowerCase()} ·{' '}
						<Text className={TONE[result.tone].text}>
							{resultText(result, format(resultAmount(result, 4)), t)}
						</Text>
					</Text>
				)}
			</View>
		);
	};
	const visibleRows = filter === 'open' ? [] : rows;
	const card = (
		<Card>
			<View className="flex-row items-center justify-between px-3 py-2">
				<Tabs value={filter} onValueChange={(value) => setFilter(value as ClosureFilter)}>
					<TabsList>
						<TabsTrigger value="all" testID="closures-filter-all">
							<Text>{t('reports.all')}</Text>
						</TabsTrigger>
						<TabsTrigger value="open" testID="closures-filter-open">
							<Text>{t('reports.open')}</Text>
						</TabsTrigger>
						<TabsTrigger value="closed" testID="closures-filter-closed">
							<Text>{t('register.closed')}</Text>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				{!unknown && (
					<Text className="text-muted-foreground">
						{t('reports.n_sessions', { count: rows.length + sessions.length })}
					</Text>
				)}
			</View>
			{!phone && (
				<View testID="closures-head" className="flex-row items-center gap-3 px-4 py-2">
					<Text variant="caption" className="flex-1">
						{t('reports.document.closure')}
					</Text>
					<Text variant="caption" className="w-28 text-right">
						{t('register.expected_label')}
					</Text>
					<Text variant="caption" className="w-28 text-right">
						{t('reports.counted')}
					</Text>
					<Text variant="caption" className="w-28 text-right">
						{t('reports.difference')}
					</Text>
					<Text variant="caption" className="w-20 text-right">
						{t('reports.result')}
					</Text>
					<View className="w-4.5" />
				</View>
			)}
			{(sessions.length > 0 || todayRows.length > 0) && dayHeading(today, todayRows)}
			{/* Keep the readers mounted when filtering, so toggling Closed neither drops summaries nor reloads. */}
			<View style={filter === 'closed' || !inPeriod ? { display: 'none' } : undefined}>
				{sessionRows}
			</View>
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
				// As a sum of one: a row with no cash figure reads Exact.
				const figures = settledRow(row);
				const result = closureResult({ recorded: [figures] }, 4);
				const expected = format(Number(figures.expected.cash ?? 0));
				const counted = format(Number(figures.counted.cash ?? 0));
				const signed = varianceAmount(result.minor, 4, format);
				const toneClass = TONE[result.tone].text;
				const resultBadge = (
					<Badge testID={`closure-result-${row.id}`} tinted size="lg" variant={result.tone}>
						{resultWord(result.kind, t, 'label')}
					</Badge>
				);
				const destination = get(row.breakdowns, 'labels.carried_to_store_name');
				const badge = !row.synced_rows_at
					? t('register.unsynced')
					: row.reason === 'store_switch'
						? destination
							? t('register.carried_to', { store: String(destination) })
							: t('register.carried')
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
							className="border-t border-b-0 px-4"
							bodyClassName="gap-1"
							trailing={
								<View className="flex-row items-center gap-3">
									{!phone && (
										<>
											<Text
												testID={`closure-expected-${row.id}`}
												className="text-muted-foreground w-28 text-right tabular-nums"
											>
												{expected}
											</Text>
											<Text
												testID={`closure-counted-${row.id}`}
												className="w-28 text-right tabular-nums"
											>
												{counted}
											</Text>
											<Text
												testID={`closure-difference-${row.id}`}
												className={cn('w-28 text-right tabular-nums', toneClass)}
											>
												{signed}
											</Text>
											<View className="w-20 items-end">{resultBadge}</View>
										</>
									)}
									<Icon name="chevronRight" className="text-muted-foreground" />
								</View>
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
							{phone && (
								<Text
									testID={`closure-figures-${row.id}`}
									className="text-muted-foreground tabular-nums"
								>
									{t('register.expected_label')} <Text className="text-foreground">{expected}</Text>{' '}
									· {t('reports.counted')} <Text className="text-foreground">{counted}</Text> ·{' '}
									{t('reports.difference')} <Text className={toneClass}>{signed}</Text>
								</Text>
							)}
							{unavailableIds?.has(row.server_closure_id ?? row.id) && (
								<Text testID={`closure-unavailable-${row.id}`}>
									{t('reports.unavailable_offline')}
								</Text>
							)}
							{(phone || badge) && (
								<View className="flex-row gap-2">
									{phone && resultBadge}
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
								</View>
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
			<ClosureStats
				rows={rows}
				sessions={sessions}
				blind={blind}
				storeId={storeId}
				partial={partial}
				unknown={unknown}
			/>
			{card}
		</>
	);
}
