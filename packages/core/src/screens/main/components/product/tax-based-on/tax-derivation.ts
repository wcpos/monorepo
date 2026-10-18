import { calculateTaxesForValue } from '@wcpos/order-math/internal';
import type { CartConfig } from '@wcpos/order-math';

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

/** Rounded to the four places WooCommerce stores a rate in; trailing zeros fall away. */
export function roundPercent(value: number): number {
	return Math.round(value * 10000) / 10000;
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
 * The order's own address with none of the four fields is the break at node 2: there is no
 * fallback to the shop base (`orderTaxLocation`). An address that matched nothing breaks at
 * node 3. A missing state that leaves only a country-wide rate is not a failure.
 */
export function derivationFailure(
	location: TaxLocation,
	isOrderAddress: boolean,
	matchedCount: number
): DerivationFailure {
	const empty = !location.country && !location.state && !location.city && !location.postcode;
	if (isOrderAddress && empty) return 'address';
	return matchedCount === 0 ? 'rates' : null;
}

/** "Portland OR 97201, United States (US)": whatever of city, state, postcode and country exists. */
export function postalLine(location: TaxLocation, countryName: string): string {
	const local = [location.city, location.state, location.postcode].filter(Boolean).join(' ');
	return [local, countryName].filter(Boolean).join(', ');
}
