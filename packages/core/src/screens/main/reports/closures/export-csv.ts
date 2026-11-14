import type { ClosureRow } from '@wcpos/query/register-session';
import { fromMinor } from '@wcpos/order-math';

import { closureResult, resultWord } from '../../../../services/register-session/closure-result';
import { settledRow } from '../../../../services/register-session/settled-figures';

export function csvCell(value: unknown) {
	const text = String(value ?? '');
	return `"${(/^(?:[\t\r\n]|[\s\x00-\x1f\x7f-\x9f]*[=+\-@])/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

export function exportCsv(
	shown: readonly ClosureRow[],
	t: (key: string) => string,
	names: Record<string, string> = {},
	storeName = ''
) {
	// Each row's SETTLED figures, as the list shows them.
	const rows = shown.map(settledRow);
	const tenders = [
		...new Set(
			rows.flatMap((row) => [
				...Object.keys(row.expected),
				...Object.keys(row.counted),
				...Object.keys(row.variance),
			])
		),
	];

	const header = [
		t('reports.csv_business_day'),
		t('reports.csv_closure'),
		t('reports.csv_register'),
		t('reports.csv_store'),
		t('reports.csv_opened'),
		t('reports.csv_closed'),
		t('reports.csv_closer'),
	];
	header.push(
		...tenders.flatMap((method) => [
			`${t('reports.document.expected')} (${method})`,
			`${t('register.counted')} (${method})`,
			`${t('register.variance')} (${method})`,
		]),
		t('reports.csv_status')
	);
	return [
		header,
		...rows.map((row) => [
			row.business_day,
			row.server_number ?? row.number,
			row.breakdowns.register_name || names[row.register_id] || row.register_id.slice(0, 8),
			row.breakdowns.store_name || storeName || row.store_id,
			row.opened_at,
			row.closed_at,
			row.breakdowns.closed_by_name || t('register.unknown_cashier'),
			...tenders.flatMap((method) => {
				const expected = row.expected[method];
				const counted = row.counted[method] ?? (expected === undefined ? '' : '0');
				// The result the closures list shows, at the stored four decimals.
				const result = closureResult({ recorded: row }, 4, method);
				return [
					expected ?? '',
					counted,
					result ? `${fromMinor(Math.abs(result.minor), 4)} ${resultWord(result.kind, t)}` : '',
				];
			}),
			!row.synced_rows_at
				? t('register.unsynced')
				: row.corrections_count
					? t('reports.corrected')
					: '',
		]),
	]
		.map((row) => row.map(csvCell).join(','))
		.join('\r\n');
}
