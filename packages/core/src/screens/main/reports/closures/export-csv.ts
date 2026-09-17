import type { ClosureRow } from '@wcpos/database';

export function exportCsv(
	rows: readonly ClosureRow[],
	t: (key: string) => string,
	names: Record<string, string> = {},
	storeName = ''
) {
	const tenders = [
		...new Set(rows.flatMap((row) => [...Object.keys(row.counted), ...Object.keys(row.variance)])),
	];
	const cell = (value: unknown) => {
		const text = String(value ?? '');
		return `"${(/^(?:[\t\r\n]|[\s\x00-\x1f\x7f-\x9f]*[=+\-@])/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
	};
	const header = ['business_day', 'closure', 'register', 'store', 'opened', 'closed', 'closer'].map(
		(key) => t(`reports.csv_${key}`)
	);
	header.push(
		...tenders.flatMap((method) => [
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
				const value = row.variance[method];
				return [
					row.counted[method] ?? '',
					value === undefined
						? ''
						: `${value.replace(/^-/, '')} ${t(Number(value) < 0 ? 'register.short' : Number(value) > 0 ? 'register.over' : 'reports.exact')}`,
				];
			}),
			!row.synced_rows_at
				? t('register.unsynced')
				: row.corrections_count
					? t('reports.corrected')
					: '',
		]),
	]
		.map((row) => row.map(cell).join(','))
		.join('\r\n');
}
