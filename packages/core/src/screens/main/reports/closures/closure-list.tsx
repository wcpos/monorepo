import * as React from 'react';
import { Pressable, View } from 'react-native';

import { format as formatDate, parseISO, subDays } from 'date-fns';

import { useDocField } from '@wcpos/query';
import { Badge } from '@wcpos/components/badge';
import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/database';

import { useLocalDate } from '../../../../hooks/use-local-date';
import { useT } from '../../../../contexts/translations';
import { inZone, useStoreDay, useViewedStore, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

export function ClosureList({
	rows,
	onSelect,
	unavailableIds,
	storeId,
}: {
	rows: readonly ClosureRow[];
	storeId?: number;
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
	const { timezone } = useStoreDay(storeId);
	const names = useRegisterNames();
	const { formatDate: displayDate } = useLocalDate();
	const today = formatDate(new Date(), 'yyyy-MM-dd', zoneOptions(timezone));
	const yesterday = formatDate(subDays(inZone(timezone, new Date()), 1), 'yyyy-MM-dd');
	const heading = (day: string) =>
		day === today
			? t('common.today')
			: day === yesterday
				? t('common.yesterday')
				: displayDate(parseISO(day), 'EEEE, d MMM yyyy');
	const time = (value: string) => formatDate(new Date(value), 'HH:mm', zoneOptions(timezone));
	return (
		<View className="bg-card rounded-md border">
			{!rows.length && (
				<Text testID="closures-empty" className="p-4">
					{t('reports.no_closures')}
				</Text>
			)}
			{rows.map((row, index) => {
				const variance = Number(row.variance.cash ?? 0);
				const badge = !row.synced_rows_at
					? t('register.unsynced')
					: row.corrections_count
						? t('reports.corrected')
						: null;
				return (
					<React.Fragment key={row.id}>
						{row.business_day !== rows[index - 1]?.business_day && (
							<Text
								testID={`closure-day-${row.business_day}`}
								className="bg-table-header px-4 py-2"
							>
								{row.business_day ? heading(row.business_day) : ''}
							</Text>
						)}
						<Pressable
							disabled={unavailableIds?.has(row.server_closure_id ?? row.id)}
							onPress={() => onSelect?.(row)}
							accessibilityRole="button"
							testID={`closure-row-${row.id}`}
							className={`active:bg-muted min-h-14 flex-row items-center gap-3 border-t p-3 ${unavailableIds?.has(row.server_closure_id ?? row.id) ? 'opacity-50' : ''}`}
						>
							<View className="min-w-0 flex-1 gap-1">
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
										variant="muted"
										size="lg"
										className="self-start"
									>
										<Text>{badge}</Text>
									</Badge>
								)}
							</View>
							<Text testID={`closure-counted-${row.id}`} className="tabular-nums">
								{format(Number(row.counted.cash ?? 0))}
							</Text>
							<Text
								testID={`closure-result-${row.id}`}
								className={`w-24 text-right tabular-nums ${variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : 'text-muted-foreground'}`}
							>
								{variance
									? `${format(Math.abs(variance))} ${t(variance < 0 ? 'register.short' : 'register.over')}`
									: t('reports.exact')}
							</Text>
						</Pressable>
					</React.Fragment>
				);
			})}
		</View>
	);
}
