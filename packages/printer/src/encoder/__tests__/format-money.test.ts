import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatMoney, resetCurrencyFormatterCache } from '../format-money';

/** The pre-cache formatMoney, verbatim: a new Intl.NumberFormat on every call. */
function uncachedFormatMoney(
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

const asciiOnly = (symbol: string) => /^[\x20-\x7e]+$/.test(symbol);

describe('formatMoney formatter cache', () => {
	afterEach(() => vi.restoreAllMocks());

	// Revert: key the cache on less than locale, currency, display and decimals.
	it.each<[number, string, string | undefined, number | undefined, typeof asciiOnly | undefined]>([
		[42.84, 'GBP', 'es', undefined, undefined],
		[42.84, 'GBP', 'es', 3, undefined],
		[1234.5, 'USD', 'en_US', 2, undefined],
		[1234.5, 'USD', 'en-US', 0, undefined],
		[25, 'JPY', 'ja-JP', undefined, undefined],
		[-7.1, 'EUR', 'de-DE', 2, asciiOnly],
		[-7.1, 'EUR', 'de-DE', 2, undefined],
		[99, 'INR', undefined, undefined, asciiOnly],
		[5, 'DOLLAR', 'en-US', 2, undefined],
		[5, '', ' ', undefined, undefined],
	])('formats %s %s in %s (%s places) as an uncached formatter does', (...args) => {
		// The cache changes nothing; the sign rule below is applied on top of either.
		const expected = uncachedFormatMoney(...args).replace('-', '\u2212');
		expect(formatMoney(...args)).toBe(expected);
		expect(formatMoney(...args)).toBe(expected);
	});

	// Revert: construct a new Intl.NumberFormat on every call again.
	it('builds no new formatter for a repeat call, the code fallback included', () => {
		// The spy replaces Intl.NumberFormat, which starts the cache over, so warm under it.
		const spy = vi.spyOn(Intl, 'NumberFormat');
		formatMoney(10, 'CHF', 'fr-CH', 2);
		formatMoney(10, 'EUR', 'en-IE', 2, asciiOnly);
		const expected = uncachedFormatMoney(12.5, 'CHF', 'fr-CH', 2);
		spy.mockClear();
		expect(formatMoney(12.5, 'CHF', 'fr-CH', 2)).toBe(expected);
		expect(formatMoney(12.5, 'EUR', 'en-IE', 2, asciiOnly)).toMatch(/^EUR\s12\.50$/);
		expect(spy).not.toHaveBeenCalled();
	});

	// Revert: drop the code fallback for a symbol the printer cannot encode.
	it('falls back to the ISO code when the symbol is not encodable', () => {
		expect(formatMoney(3, 'EUR', 'en-US', 2, asciiOnly)).toMatch(/^EUR\s3\.00$/);
		expect(formatMoney(3, 'EUR', 'en-US', 2, () => true)).toBe('€3.00');
	});

	// Revert: cache a construction that threw, so a later call skips the catch path.
	it('takes the catch path on every call for an invalid currency', () => {
		const spy = vi.spyOn(Intl, 'NumberFormat');
		expect(formatMoney(5, 'NOPE!', 'en-US', 2)).toBe('NOPE! 5.00');
		expect(formatMoney(5, 'NOPE!', 'en-US', 2)).toBe('NOPE! 5.00');
		// Each call tries narrowSymbol, then the plain fallback: both throw, both times.
		expect(spy).toHaveBeenCalledTimes(4);
	});

	// Revert: cache the narrowSymbol formatter before its construction has succeeded.
	it('retries narrowSymbol on every call when only it throws', () => {
		const Original = Intl.NumberFormat;
		// A function, not an arrow: the code under test calls it with `new`.
		const spy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (
			locale: string,
			options: Intl.NumberFormatOptions
		) {
			if (options.currencyDisplay === 'narrowSymbol') throw new RangeError('unsupported');
			return new Original(locale, options);
		} as unknown as typeof Intl.NumberFormat);
		expect(formatMoney(8, 'AUD', 'en-AU', 2)).toBe('$8.00');
		expect(formatMoney(8, 'AUD', 'en-AU', 2)).toBe('$8.00');
		const narrow = spy.mock.calls.filter(
			([, options]) => options?.currencyDisplay === 'narrowSymbol'
		);
		expect(narrow).toHaveLength(2);
	});

	// Revert: serve a cached formatter after Intl.NumberFormat changes.
	it('takes the code fallback when Intl.NumberFormat starts throwing after a warm call', () => {
		expect(formatMoney(5, 'EUR', 'en-US', 2)).toBe('€5.00');
		const spy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function () {
			throw new RangeError('Intl currency formatting unavailable');
		} as unknown as typeof Intl.NumberFormat);
		expect(formatMoney(5, 'EUR', 'en-US', 2)).toBe('EUR 5.00');
		spy.mockRestore();
		expect(formatMoney(5, 'EUR', 'en-US', 2)).toBe('€5.00');
	});

	// Revert: make resetCurrencyFormatterCache leave its entries behind.
	it('builds afresh after resetCurrencyFormatterCache, then caches again', () => {
		const spy = vi.spyOn(Intl, 'NumberFormat');
		formatMoney(5, 'EUR', 'en-US', 2);
		resetCurrencyFormatterCache();
		spy.mockClear();
		formatMoney(5, 'EUR', 'en-US', 2);
		formatMoney(5, 'EUR', 'en-US', 2);
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

describe('formatMoney sign', () => {
	// Intl writes an ASCII hyphen for en/de/fr and U+2212 for sv/nb/fi: one minus everywhere.
	it.each([
		['en-GB', 'GBP', '\u2212£5.00'],
		['de-DE', 'EUR', '\u22125,00\u00a0€'],
		['sv-SE', 'SEK', '\u22125,00\u00a0kr'],
	])('writes a true minus for a negative amount in %s', (locale, currency, expected) => {
		const text = formatMoney(-5, currency, locale, 2);
		expect(text).toBe(expected);
		expect(text).not.toContain('-');
	});

	it('keeps the bidi marks of a right-to-left locale around the minus', () => {
		const ascii = new Intl.NumberFormat('he-IL', {
			style: 'currency',
			currency: 'ILS',
			currencyDisplay: 'narrowSymbol',
		}).format(-5);
		expect(formatMoney(-5, 'ILS', 'he-IL', 2)).toBe(ascii.replace('-', '\u2212'));
	});

	it('leaves a positive amount as Intl writes it', () => {
		expect(formatMoney(5, 'GBP', 'en-GB', 2)).toBe('£5.00');
		expect(formatMoney(5, 'SEK', 'sv-SE', 2)).toBe('5,00\u00a0kr');
	});

	// Intl signs a negative zero ("-£0.00"), from -0 or from a negative that rounds away.
	it.each([-0, -0.001, -0.004])('shows %s as zero, with no sign', (value) => {
		expect(formatMoney(value, 'GBP', 'en-GB', 2)).toBe('£0.00');
		expect(formatMoney(value, 'SEK', 'sv-SE', 2)).toBe('0,00\u00a0kr');
	});

	it('writes a true minus in the ISO-code and plain fallbacks', () => {
		expect(formatMoney(-3, 'EUR', 'en-US', 2, asciiOnly)).toMatch(/^\u2212EUR\s3\.00$/);
		expect(formatMoney(-5, 'NOPE!', 'en-US', 2)).toBe('NOPE! \u22125.00');
	});
});
