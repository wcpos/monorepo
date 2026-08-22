/**
 * narrowSymbol matches the server's wc_price() output, which always prints
 * the bare currency symbol ("42,84 £"). The default 'symbol' display falls
 * back to ISO codes for foreign currencies in many locales (es + GBP →
 * "42,84 GBP"), making client renders disagree with server-rendered PDFs.
 */
export function formatMoney(
	value: number,
	currency: string,
	locale?: string,
	decimals?: number,
	isSymbolEncodable?: (symbol: string) => boolean
): string {
	const normalizedLocale = (locale || 'en-US').trim().replace(/_/g, '-') || 'en-US';
	const fractionDigits =
		typeof decimals === 'number'
			? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
			: {};

	try {
		const formatter = new Intl.NumberFormat(normalizedLocale, {
			style: 'currency',
			currency,
			currencyDisplay: 'narrowSymbol',
			...fractionDigits,
		});
		if (isSymbolEncodable) {
			const currencySymbol = formatter
				.formatToParts(value)
				.find((part) => part.type === 'currency')?.value;
			if (currencySymbol && !isSymbolEncodable(currencySymbol)) {
				return new Intl.NumberFormat(normalizedLocale, {
					style: 'currency',
					currency,
					currencyDisplay: 'code',
					...fractionDigits,
				}).format(value);
			}
		}
		return formatter.format(value);
	} catch {
		try {
			return new Intl.NumberFormat(normalizedLocale, {
				style: 'currency',
				currency,
				...fractionDigits,
			}).format(value);
		} catch {
			const fallbackDecimals = decimals ?? 2;
			return currency
				? `${currency} ${value.toFixed(fallbackDecimals)}`
				: value.toFixed(fallbackDecimals);
		}
	}
}
