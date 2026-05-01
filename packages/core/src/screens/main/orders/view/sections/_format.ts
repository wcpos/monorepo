export function formatMoney(value: unknown, currencySymbol?: string) {
	const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
	if (!Number.isFinite(num)) return String(value ?? '—');
	const sign = num < 0 ? '−' : '';
	const abs = Math.abs(num).toFixed(2);
	return `${sign}${currencySymbol ?? ''}${abs}`;
}

export function formatDateTime(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(date);
}

export function formatDate(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function formatTime(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
}
