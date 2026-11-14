import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';

import { AmountFigure } from '@wcpos/components/amount-figure';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';
import type { ClosureRow } from '@wcpos/query/register-session';

import { useT } from '../../../../contexts/translations';
import { useViewedStore } from '../../../../hooks/use-store-day';
import { closureResult, resultWord } from '../../../../services/register-session/closure-result';
import { varianceAmount } from '../../../../services/register-session/count-money';
import { settledRow } from '../../../../services/register-session/settled-figures';
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
	return {
		opening: Number(fromMinor(opening, 4)),
		activity: Number(fromMinor(sum((row) => row.expected.cash ?? '0') - opening, 4)),
		counted: Number(fromMinor(counted, 4)),
	};
}

export function ClosureStats({
	rows,
	sessions,
	blind,
	storeId,
	partial = false,
	unknown = false,
}: {
	rows: readonly ClosureRow[];
	sessions: readonly SessionSummary[];
	blind?: boolean;
	storeId?: number;
	/** More pages of the period remain unloaded: the figures are a prefix, and say so. */
	partial?: boolean;
	/** The closures read is unavailable (offline): counts are unknown, not zero. */
	unknown?: boolean;
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
	// The stats show the SETTLED results, as the list does.
	const settled = rows.map(settledRow);
	const totals = closureTotals(settled);
	// The cash the cashier counted in, not the float the card suggested (Codex, #3048).
	const floats = sessions.reduce(
		(sum, session) => sum + toMinor(session.counted_float ?? session.expected_float ?? '0', 4),
		toMinor(totals.opening, 4)
	);
	const signed = (value: number) => `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;
	const result = closureResult({ recorded: settled }, 4);
	const kinds = settled.map((row) => closureResult({ recorded: [row] }, 4).kind);
	const results = (['short', 'over', 'exact'] as const)
		.map((kind) => {
			const n = kinds.filter((k) => k === kind).length;
			const word = resultWord(kind, t);
			return n ? `${n} ${kind === 'exact' ? word.toLocaleLowerCase() : word}` : '';
		})
		.filter(Boolean)
		.join(' · ');

	const countNote = rows.length
		? t('reports.stat_counts', { count: rows.length })
		: t('reports.stat_nothing_closed');
	// Literal labels: the i18n ratchet refuses a computed key, and the catalogue needs each string.
	const cells: Record<string, [label: string, value: string | number, note: string]> = {
		discrepancy: [
			t('reports.stat_discrepancy'),
			result.minor ? varianceAmount(result.minor, 4, format) : '—',
			results,
		],
		sessions: [
			t('reports.stat_sessions'),
			rows.length + sessions.length,
			partial
				? t('reports.stat_partial', { count: rows.length })
				: t('reports.stat_open_closed', { open: sessions.length, closed: rows.length }),
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
	};
	// Offline every figure is unknown, not zero: a dash by rule, whatever rows and sessions hold.
	// An empty note, not none, keeps the cells the same height.
	if (unknown) for (const id in cells) cells[id] = [cells[id][0], '—', ''];
	return (
		<View className={cn('border-border flex-row border-b pb-3', phone && 'flex-wrap')}>
			{Object.entries(cells).map(([id, [label, value, note]], index) => (
				<View
					key={id}
					className={cn(
						'px-4 py-3',
						index === 0 && 'pl-0',
						phone ? (index === 0 ? 'w-full' : 'w-1/2') : 'flex-1',
						(phone ? index % 2 === 1 : index < 4) && 'border-r',
						phone && index > 0 && 'border-t'
					)}
				>
					<Text variant="key">{label}</Text>
					{id === 'discrepancy' ? (
						<AmountFigure
							testID="closure-stat-discrepancy"
							size="headline"
							tone={unknown || partial || result.tone === 'muted' ? 'default' : result.tone}
						>
							{value}
						</AmountFigure>
					) : (
						<Text
							testID={`closure-stat-${id.replaceAll('_', '-')}`}
							className="text-lg font-semibold tabular-nums"
						>
							{value}
						</Text>
					)}
					<Text variant="key">{note}</Text>
				</View>
			))}
		</View>
	);
}
