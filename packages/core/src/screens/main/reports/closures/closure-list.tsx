import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns';

import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

export function ClosureList({ rows }: { rows: readonly ClosureRow[] }) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const { timezone } = useStoreDay();
	const names = useRegisterNames();
	const time = (value: string) => formatDate(new Date(value), 'HH:mm', zoneOptions(timezone));
	return (
		<View className="bg-card rounded-md border">
			{!rows.length && <Text className="p-4">{t('reports.no_closures')}</Text>}
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
								{row.business_day}
							</Text>
						)}
						<View
							testID={`closure-row-${row.id}`}
							className="min-h-14 flex-row items-center gap-3 border-t p-3"
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
								{badge && (
									<Text testID={`closure-badge-${row.id}`} className="text-muted-foreground">
										{badge}
									</Text>
								)}
							</View>
							<Text testID={`closure-counted-${row.id}`} className="tabular-nums">
								{format(Number(row.counted.cash ?? 0))}
							</Text>
							<Text testID={`closure-result-${row.id}`} className="w-24 text-right tabular-nums">
								{variance
									? `${format(Math.abs(variance))} ${t(variance < 0 ? 'register.short' : 'register.over')}`
									: t('reports.exact')}
							</Text>
						</View>
					</React.Fragment>
				);
			})}
		</View>
	);
}
