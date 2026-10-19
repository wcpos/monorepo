import { decode } from 'html-entities';

import { calculateTaxesForValue } from '@wcpos/order-math/internal';
import type { CartConfig } from '@wcpos/order-math';

import { roundPercent } from '../../../hooks/round-percent';
import {
	normalizePostcode,
	postcodePatternMatches,
} from '../../../contexts/tax-rates/tax-rates.helpers';

import type { TaxLocation, TaxRateData } from '../../../contexts/tax-rates';

/** The narrowest field a matched rate is pinned to that the address satisfied. */
export type RateWhy =
	| { field: 'postcode'; pattern: string }
	| { field: 'city' }
	| { field: 'state' }
	| { field: 'country'; country: string }
	/** A worldwide rate (no country): it matches every address. */
	| { field: 'anywhere' };

/** Where the chain breaks: no address to match, or an address the store has no rate for. */
export type DerivationFailure = 'address' | 'rates' | null;

export interface ClassLedger {
	slug: string;
	name: string;
	/** The class's effective percentage, off the cart engine (compound and priority honoured). */
	percent: number;
	rates: { rate: TaxRateData; why: RateWhy }[];
}

/** Reads the why off the rate's own fields; `rate` is one `filterTaxRates` already matched. */
export function rateWhy(rate: TaxRateData, location: TaxLocation): RateWhy {
	const postcode = normalizePostcode(location.postcode ?? '');
	const pattern = (rate.postcodes ?? []).find((p) => postcodePatternMatches(postcode, p));
	if (pattern) return { field: 'postcode', pattern };
	if ((rate.cities ?? []).length > 0) return { field: 'city' };
	if (rate.state) return { field: 'state' };
	return rate.country ? { field: 'country', country: rate.country } : { field: 'anywhere' };
}

/**
 * The matched rates by class, in the store's class order (`extraData.taxClasses`, standard
 * first), each with its percentage as the cart computes it on 100. A class the store's list
 * does not name goes last, under its slug.
 */
export function classLedgers(
	rates: TaxRateData[],
	taxClasses: readonly { slug: string; name: string }[],
	location: TaxLocation,
	config: CartConfig
): ClassLedger[] {
	const order = taxClasses.map((taxClass) => taxClass.slug);
	const slugs = [...new Set(rates.map((rate) => rate.class || 'standard'))].sort((a, b) => {
		const ai = order.indexOf(a);
		const bi = order.indexOf(b);
		return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
	});
	return slugs.map((slug) => ({
		slug,
		name: taxClasses.find((taxClass) => taxClass.slug === slug)?.name || slug,
		percent: roundPercent(
			calculateTaxesForValue(
				{ amount: 100, taxStatus: 'taxable', taxClass: slug, amountIncludesTax: false },
				config
			).total
		),
		rates: rates
			.filter((rate) => (rate.class || 'standard') === slug)
			.map((rate) => ({ rate, why: rateWhy(rate, location) })),
	}));
}

/**
 * Anything matched is no failure (a missing state that leaves only a country-wide rate, an
 * empty address that a worldwide rate still covers). Otherwise the order's own address with
 * none of the four fields is the break at node 2: there is no fallback to the shop base
 * (`orderTaxLocation`). Any other address that matched nothing breaks at node 3.
 */
export function derivationFailure(
	location: TaxLocation,
	isOrderAddress: boolean,
	matchedCount: number
): DerivationFailure {
	// Whatever matched is what the engine applies: a worldwide rate matches even an empty address.
	if (matchedCount > 0) return null;
	const empty = !location.country && !location.state && !location.city && !location.postcode;
	return isOrderAddress && empty ? 'address' : 'rates';
}

/**
 * Why nothing matched, as strongly as the store's rates allow: no country to name; rates for
 * the country that do not reach this address (a California rate, an Oregon order); or no rate
 * for the country at all.
 */
export type NoRateCause = 'no-country' | 'not-covered' | 'no-rate-for-country';

export function noRateCause(allRates: TaxRateData[], location: TaxLocation): NoRateCause {
	const country = (location.country ?? '').toUpperCase();
	if (!country) return 'no-country';
	// A worldwide rate (no country) covers every country: one that filterTaxRates dropped for its
	// city or postcode is still a rate for this country that misses this address.
	return allRates.some((rate) => !rate.country || rate.country.toUpperCase() === country)
		? 'not-covered'
		: 'no-rate-for-country';
}

/**
 * The country's name for the postal line and the failure copy. An order may store the code in
 * any case (`us`, `Gb`), as `filterTaxRates` tolerates; `countries.json` carries WooCommerce's
 * HTML-encoded names (`Cura&ccedil;ao`). Falls back to the code as stored.
 */
export function countryDisplayName(
	countries: readonly { code: string; name: string }[],
	code: string
): string {
	const upper = (code ?? '').toUpperCase();
	const name = countries.find((country) => country.code === upper)?.name;
	return name ? decode(name) : code;
}

/** "Portland OR 97201, United States (US)": whatever of city, state, postcode and country exists. */
export function postalLine(location: TaxLocation, countryName: string): string {
	const local = [location.city, location.state, location.postcode].filter(Boolean).join(' ');
	return [local, countryName].filter(Boolean).join(', ');
}
