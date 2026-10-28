import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';
import type { ClosureRow } from '@wcpos/query/register-session';

import { useT } from '../../../../contexts/translations';
import { useViewedStore } from '../../../../hooks/use-store-day';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

import type { SessionSummary } from './session-card';

// Closure money is stored at four decimals; integer sums keep cancelling discrepancies exact.
export function closureTotals(rows: readonly ClosureRow[]) {
	const sum = (value: (row: ClosureRow) => string) =>
		rows.reduce((total, row) => total + toMinor(value(row), 4), 0);
	const opening = sum((row) =>
		String(
			get(row.breakdowns, 'opening_float.counted') ??
				get(row.breakdowns, 'opening_float.expected') ??
				'0'
		)
	);
	const counted = sum((row) => row.counted.cash ?? '0');
	const variance = sum((row) => row.variance.cash ?? '0');
	return {
		opening: Number(fromMinor(opening, 4)),
		activity: Number(fromMinor(sum((row) => row.expected.cash ?? '0') - opening, 4)),
		counted: Number(fromMinor(counted, 4)),
		variance: Number(fromMinor(variance, 4)),
	};
}

export function ClosureStats({
	rows,
	sessions,
	blind,
	storeId,
}: {
	rows: readonly ClosureRow[];
	sessions: readonly SessionSummary[];
	blind?: boolean;
	storeId?: number;
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
	if (blind) return null;
	const totals = closureTotals(rows);
	const floats = sessions.reduce(
		(sum, session) => sum + toMinor(session.expected_float, 4),
		toMinor(totals.opening, 4)
	);
	const signed = (value: number) => `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;
	const short = rows.filter((row) => Number(row.variance.cash ?? 0) < 0).length;
	const over = rows.filter((row) => Number(row.variance.cash ?? 0) > 0).length;
	const exact = rows.length - short - over;
	const results = [
		short ? `${short} ${t('register.short')}` : '',
		over ? `${over} ${t('register.over')}` : '',
		exact ? `${exact} ${t('reports.exact').toLocaleLowerCase()}` : '',
	]
		.filter(Boolean)
		.join(' · ');

	const countNote = rows.length
		? t('reports.stat_counts', { count: rows.length })
		: t('reports.stat_nothing_closed');
	// The rows' own result tokens (closure-list.tsx): short is bad, over is ok, exact is quiet.
	const discrepancyColor =
		totals.variance < 0 ? 'text-bad' : totals.variance > 0 ? 'text-ok' : 'text-muted-foreground';
	// Literal labels: the i18n ratchet refuses a computed key, and the catalogue needs each string.
	const cells = {
		sessions: [
			t('reports.stat_sessions'),
			rows.length + sessions.length,
			t('reports.stat_open_closed', { open: sessions.length, closed: rows.length }),
		],
		cash_at_open: [
			t('reports.stat_cash_at_open'),
			format(Number(fromMinor(floats, 4))),
			t('reports.stat_floats'),
		],
		cash_activity: [
			t('reports.stat_cash_activity'),
			signed(totals.activity),
			t('reports.stat_activity_note'),
		],
		cash_at_close: [
			t('reports.stat_cash_at_close'),
			rows.length ? format(totals.counted) : '—',
			countNote,
		],
		discrepancy: [
			t('reports.stat_discrepancy'),
			totals.variance ? signed(totals.variance) : '—',
			results,
		],
	};
	return (
		<View className={cn('bg-card flex-row rounded-lg border', phone && 'flex-wrap')}>
			{Object.entries(cells).map(([id, [label, value, note]], index) => (
				<View
					key={id}
					className={cn(
						'px-4 py-3',
						phone ? (index === 4 ? 'w-full' : 'w-1/2') : 'flex-1',
						(phone ? index % 2 === 0 && index < 4 : index < 4) && 'border-r',
						phone && index > 1 && 'border-t'
					)}
				>
					<Text variant="key">{label}</Text>
					<Text
						testID={`closure-stat-${id.replaceAll('_', '-')}`}
						className={cn(
							'text-lg font-semibold tabular-nums',
							id === 'discrepancy' && discrepancyColor
						)}
					>
						{value}
					</Text>
					<Text variant="key">{note}</Text>
				</View>
			))}
		</View>
	);
}
