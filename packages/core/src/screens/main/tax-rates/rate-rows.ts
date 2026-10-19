import type { TaxRateData } from '../contexts/tax-rates';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** WooCommerce's default priority: a rate at it says nothing on the phone row's tags line. */
const DEFAULT_PRIORITY = 1;

/**
 * A rate's location field as the table shows it: the codes or patterns as stored, lists joined
 * with ", ", or null where WooCommerce's `*` means any (the cell reads a muted "Any").
 */
export function locationField(value: string | readonly string[] | null | undefined) {
	if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
	return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * The name's second line, only when the booleans say something: "Compound" and "Not on
 * shipping", which replace two columns of a tick on every row. Empty for the defaults.
 */
export function rateTags(rate: TaxRateData, t: Translate): string {
	return [
		rate.compound ? t('tax_rates.compound') : null,
		rate.shipping === false ? t('tax_rates.not_on_shipping') : null,
	]
		.filter(Boolean)
		.join(' · ');
}

/** The phone row's location line: "GB · any state, postcode or city", "US · AL · 12345". */
export function phoneLocation(rate: TaxRateData, t: Translate): string {
	const country = locationField(rate.country) ?? t('tax_rates.any');
	const state = locationField(rate.state);
	const postcodes = locationField(rate.postcodes);
	const cities = locationField(rate.cities);
	if (!state && !postcodes && !cities) return [country, t('tax_rates.any_location')].join(' · ');
	return [country, state ?? t('tax_rates.any_state'), postcodes, cities]
		.filter(Boolean)
		.join(' · ');
}

/** The phone row's third line: the tags, then the priority (no column there) when not the default. */
export function phoneTags(rate: TaxRateData, t: Translate): string {
	const priority = rate.priority ?? DEFAULT_PRIORITY;
	return [
		rateTags(rate, t),
		priority !== DEFAULT_PRIORITY ? t('tax_rates.priority_n', { n: priority }) : null,
	]
		.filter(Boolean)
		.join(' · ');
}

/**
 * The bottom bar's count: the store total across classes. "{count} of {total} synced" only
 * while something vouches for more rates than the device holds.
 */
export function rateCount(count: number, vouched: number | null, t: Translate): string {
	return vouched !== null && count < vouched
		? t('tax_rates.count_synced', {
				synced: count.toLocaleString(),
				total: vouched.toLocaleString(),
			})
		: // `count` picks "1 tax rate" or "6 tax rates"; `n` is what is printed, grouped.
			t('tax_rates.count', { count, n: count.toLocaleString() });
}
