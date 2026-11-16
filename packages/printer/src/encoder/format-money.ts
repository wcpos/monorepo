// Hermes builds Intl formatters slowly and a receipt formats every amount. A till prints one
// locale and currency, so 64 is ample; overflow just starts over.
const MAX_CACHED_FORMATTERS = 64;
const currencyFormatters = new Map<string, Intl.NumberFormat>();
let currencyFormattersBuiltBy: typeof Intl.NumberFormat | undefined;

// Tests use this to start from an empty cache.
export function resetCurrencyFormatterCache() {
	currencyFormatters.clear();
}

/**
 * Keyed on the locale and every option: currency, display and the decimals' fraction digits.
 * A construction that throws is never cached, so the caller's fallback runs on every call.
 * Entries belong to the Intl.NumberFormat that built them; when the runtime's changes, start over.
 */
function currencyFormatter(locale: string, options: Intl.NumberFormatOptions) {
	if (Intl.NumberFormat !== currencyFormattersBuiltBy) {
		currencyFormatters.clear();
		currencyFormattersBuiltBy = Intl.NumberFormat;
	}
	const key = JSON.stringify([locale, options]);
	let formatter = currencyFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, options);
		if (currencyFormatters.size >= MAX_CACHED_FORMATTERS) currencyFormatters.clear();
		currencyFormatters.set(key, formatter);
	}
	return formatter;
}

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
		const formatter = currencyFormatter(normalizedLocale, {
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
				return currencyFormatter(normalizedLocale, {
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
