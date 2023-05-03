import filter from 'lodash/filter';
import includes from 'lodash/includes';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import replace from 'lodash/replace';
import some from 'lodash/some';
import uniq from 'lodash/uniq';

type TaxRate = import('@wcpos/database').TaxRateDocument;

/**
 * Normalize a given postcode by removing spaces and converting it to uppercase.
 */
function normalizePostcode(postcode: string): string {
	return replace(postcode, /\s+/g, '').toUpperCase();
}

/**
 * Generate an array of wildcard postcodes based on the given postcode.
 */
function getWildcardPostcodes(postcode: string): string[] {
	const wildcards = [];
	const lastCharIndex = postcode.length - 1;

	for (let i = lastCharIndex; i >= 0; i--) {
		if (postcode[i] !== '*') {
			const wildcardPostcode = postcode.slice(0, i) + '*';
			wildcards.push(wildcardPostcode);
		}
	}

	return uniq([postcode, ...wildcards]);
}

/**
 * Check if a given postcode matches any of the postcodes in the provided list,
 * accounting for wildcard postcodes and postcode ranges.
 */
function postcodeLocationMatcher(postcode: string, postcodes: string[]): boolean {
	const normalizedPostcode = normalizePostcode(postcode);
	const wildcardPostcodes = getWildcardPostcodes(normalizedPostcode);

	return some(postcodes, (range) => {
		const [min, max] = map(range.split('...'), normalizePostcode);
		return (
			includes(wildcardPostcodes, min) ||
			(normalizedPostcode >= min && normalizedPostcode <= (max || min))
		);
	});
}

/**
 * Filter tax rates based on the provided country, state, postcode, and city.
 */
export function filterTaxRates(
	taxRates: TaxRate[],
	country: string,
	state: string,
	postcode: string,
	city: string = ''
): TaxRate[] {
	return filter(taxRates, (rate) => {
		// we don't need to match country and state because it's done in the query
		// const countryMatch = rate.country === country;
		// const stateMatch = rate.state === state || rate.state === '';
		const postcodeMatch =
			isEmpty(rate.postcodes) || postcodeLocationMatcher(postcode, rate.postcodes);
		const cityMatch = isEmpty(rate.cities) || includes(rate.cities, city);

		return postcodeMatch && cityMatch;
	});
}

/**
 * Filter tax rates based on the provided country, state, postcode, and city.
 * Prioritizes more specific matches (postcode, city) over broader matches (state).
 */
// export function filterTaxRates(
// 	taxRates: TaxRate[],
// 	country: string,
// 	state: string,
// 	postcode: string,
// 	city: string = ''
// ): TaxRate[] {
// 	const rates = filter(taxRates, (rate) => {
// 		const countryMatch = rate.country === country;
// 		const stateMatch = rate.state === state || rate.state === '';
// 		const postcodeMatch =
// 			isEmpty(rate.postcodes) || postcodeLocationMatcher(postcode, rate.postcodes);
// 		const cityMatch = isEmpty(rate.cities) || includes(rate.cities, city);

// 		return countryMatch && stateMatch && postcodeMatch && cityMatch;
// 	});

// 	const hasPostcodeSpecificRate = some(rates, (rate) => !isEmpty(rate.postcodes));
// 	const hasCitySpecificRate = some(rates, (rate) => !isEmpty(rate.cities));

// 	if (hasPostcodeSpecificRate || hasCitySpecificRate) {
// 		return filter(rates, (rate) => {
// 			const postcodeMatch = hasPostcodeSpecificRate ? !isEmpty(rate.postcodes) : true;
// 			const cityMatch = hasCitySpecificRate ? !isEmpty(rate.cities) : true;
// 			return postcodeMatch && cityMatch;
// 		});
// 	}

// 	return rates;
// }
