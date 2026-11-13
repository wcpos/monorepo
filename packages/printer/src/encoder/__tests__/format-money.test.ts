import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatMoney } from '../format-money';

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
		const expected = uncachedFormatMoney(...args);
		expect(formatMoney(...args)).toBe(expected);
		expect(formatMoney(...args)).toBe(expected);
	});

	// Revert: construct a new Intl.NumberFormat on every call again.
	it('builds no new formatter for a repeat call, the code fallback included', () => {
		formatMoney(10, 'CHF', 'fr-CH', 2);
		formatMoney(10, 'EUR', 'en-IE', 2, asciiOnly);
		const expected = uncachedFormatMoney(12.5, 'CHF', 'fr-CH', 2);
		const spy = vi.spyOn(Intl, 'NumberFormat');
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
});
