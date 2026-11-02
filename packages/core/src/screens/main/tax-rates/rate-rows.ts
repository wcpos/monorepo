import { filterTaxRates } from '../contexts/tax-rates/tax-rates.helpers';

import type { TaxLocation, TaxRateData } from '../contexts/tax-rates';

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

type AddressParams = Partial<Record<'applies' | keyof TaxLocation, string | string[]>>;

/**
 * The address the "Tax based on" panel sends on View all (`applies=1` plus its four fields).
 * No `applies` means the panel was opened from somewhere else (Settings, or an order with no
 * address): no marks, the plain count.
 */
export function parseAppliesAddress(params: AddressParams): TaxLocation | null {
	const read = (key: keyof AddressParams) => {
		const value = params[key];
		return (Array.isArray(value) ? value[0] : value) ?? '';
	};
	if (!read('applies')) return null;
	return {
		country: read('country'),
		state: read('state'),
		city: read('city'),
		postcode: read('postcode'),
	};
}

/**
 * The ids of the store's current rates that address matches, by the same matcher the cart and
 * the "Tax based on" panel use, so the marks and the count follow a sync.
 */
export function matchedRateIds(rates: TaxRateData[], address: TaxLocation): ReadonlySet<number> {
	const { country, state, postcode, city } = address;
	return new Set(
		filterTaxRates(rates, country, state, postcode, city)
			.map((rate) => rate.id)
			.filter((id): id is number => typeof id === 'number')
	);
}

/** Whether the address the panel was opened from matched this rate. */
export function isApplied(appliesTo: ReadonlySet<number> | null | undefined, rate: TaxRateData) {
	return rate.id !== undefined && rate.id !== null && (appliesTo?.has(rate.id) ?? false);
}

/** "2 apply to this address (GB)", "none apply to this address", the parenthesis only with a country. */
export function appliesCount(n: number, country: string, t: Translate): string {
	if (n === 0) {
		return country
			? t('tax_rates.count_applies_none', { country })
			: t('tax_rates.count_applies_none_no_country');
	}
	return country
		? t('tax_rates.count_applies', { count: n, n: n.toLocaleString(), country })
		: t('tax_rates.count_applies_no_country', { count: n, n: n.toLocaleString() });
}
