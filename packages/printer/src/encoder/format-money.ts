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
 * A negative amount reads with a true minus (U+2212) in every locale: Intl writes one for
 * sv/nb/fi but an ASCII hyphen for en/de/fr. A negative that rounds to zero, which Intl signs
 * ("-£0.00"), reads as zero. Thermal printers fold the minus back to a hyphen.
 */
export function formatMoney(
	value: number,
	currency: string,
	locale?: string,
	decimals?: number,
	isSymbolEncodable?: (symbol: string) => boolean
): string {
	const format = (amount: number) =>
		formatIntlMoney(amount, currency, locale, decimals, isSymbolEncodable);
	if (!(value < 0) && !Object.is(value, -0)) return format(value);
	const zero = format(0);
	const positive = format(-value);
	if (positive === zero) return zero;
	const negative = format(value);
	// The sign is the hyphen whose removal leaves the positive amount, never one in a currency
	// label ("CUSTOM-USD -5.00"); where the locale adds marks with it, the first hyphen.
	const without = (at: number) => negative.slice(0, at) + negative.slice(at + 1);
	const hyphens = [...negative].flatMap((char, at) => (char === '-' ? [at] : []));
	const sign = hyphens.find((at) => without(at) === positive) ?? hyphens[0];
	return sign === undefined
		? negative
		: `${negative.slice(0, sign)}\u2212${negative.slice(sign + 1)}`;
}

/**
 * narrowSymbol matches the server's wc_price() output, which always prints
 * the bare currency symbol ("42,84 £"). The default 'symbol' display falls
 * back to ISO codes for foreign currencies in many locales (es + GBP →
 * "42,84 GBP"), making client renders disagree with server-rendered PDFs.
 */
function formatIntlMoney(
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
