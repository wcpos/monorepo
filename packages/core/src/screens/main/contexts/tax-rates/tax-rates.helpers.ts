import filter from 'lodash/filter';
import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';
import includes from 'lodash/includes';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import replace from 'lodash/replace';
import some from 'lodash/some';
type TaxRate = import('@wcpos/database').TaxRateDocument;

/**
 * Normalize a given postcode by removing spaces and converting it to uppercase.
 */
function normalizePostcode(postcode: string): string {
	return replace(postcode, /\s+/g, '').toUpperCase();
}

/**
 * Generate an array of possible postcodes based on a given wildcard or range pattern.
 */
function getMatchingPostcodes(pattern: string): string[] {
	if (pattern.includes('...')) {
		const [start, end] = pattern.split('...').map(normalizePostcode);
		let current = parseInt(start, 10);
		const last = parseInt(end, 10);
		const matches = [];

		while (current <= last) {
			matches.push(current.toString());
			current++;
		}

		return matches;
	} else if (pattern.endsWith('*')) {
		// For wildcard patterns, return the pattern for comparison in `includes` check.
		return [pattern.slice(0, -1)];
	} else {
		// Handle exact match
		return [normalizePostcode(pattern)];
	}
}

function postcodePatternMatches(normalizedPostcode: string, pattern: string): boolean {
	const matchingPostcodes = getMatchingPostcodes(pattern);
	return matchingPostcodes.some((pc) =>
		pattern.endsWith('*') ? normalizedPostcode.startsWith(pc) : pc === normalizedPostcode
	);
}

/**
 * Check if a given postcode matches any of the patterns in the provided list.
 */
function postcodeMatcher(postcode: string, patterns: string[]): boolean {
	const normalizedPostcode = normalizePostcode(postcode);

	return some(patterns, (pattern) => postcodePatternMatches(normalizedPostcode, pattern));
}

/**
 * WooCommerce compares specificity by the number of location rows that MATCHED the
 * customer's address (`COUNT(locations.location_id)` under the query criteria in
 * `WC_Tax::get_matched_tax_rates`), not by how many postcodes/cities a rate lists.
 */
type MatchedLocationCounts = { postcodes: number; cities: number };

/** Mirrors `WC_Tax::sort_rates_callback`: priority, then location specificity, then id. */
function compareTaxRates(
	rate1: TaxRate,
	rate2: TaxRate,
	matchedCounts: Map<TaxRate, MatchedLocationCounts>
): number {
	const priority1 = rate1.priority ?? 0;
	const priority2 = rate2.priority ?? 0;
	if (priority1 !== priority2) {
		return priority1 < priority2 ? -1 : 1;
	}

	const country1 = rate1.country ?? '';
	const country2 = rate2.country ?? '';
	if (country1 !== country2) {
		if (country1 === '') {
			return 1;
		}
		if (country2 === '') {
			return -1;
		}
		return country1 > country2 ? 1 : -1;
	}

	const state1 = rate1.state ?? '';
	const state2 = rate2.state ?? '';
	if (state1 !== state2) {
		if (state1 === '') {
			return 1;
		}
		if (state2 === '') {
			return -1;
		}
		return state1 > state2 ? 1 : -1;
	}

	const postcodeCount1 = matchedCounts.get(rate1)?.postcodes ?? 0;
	const postcodeCount2 = matchedCounts.get(rate2)?.postcodes ?? 0;
	if (postcodeCount1 !== postcodeCount2) {
		return postcodeCount1 < postcodeCount2 ? 1 : -1;
	}

	const cityCount1 = matchedCounts.get(rate1)?.cities ?? 0;
	const cityCount2 = matchedCounts.get(rate2)?.cities ?? 0;
	if (cityCount1 !== cityCount2) {
		return cityCount1 < cityCount2 ? 1 : -1;
	}

	const id1 = rate1.id ?? 0;
	const id2 = rate2.id ?? 0;

	if (id1 === id2) {
		return 0;
	}

	return id1 < id2 ? -1 : 1;
}

/**
 * Filter tax rates based on the provided country, state, postcode, and city.
 */
export function filterTaxRates(
	taxRates: TaxRate[],
	country: string = '',
	state: string = '',
	postcode: string = '',
	city: string = ''
): TaxRate[] {
	const taxRatesByClass = groupBy(taxRates, 'class');
	const normalizedPostcode = normalizePostcode(postcode);
	const filteredTaxRatesByClass = map(taxRatesByClass, (taxRatesInClass) => {
		const cityUpperCase = city.toUpperCase();
		const matchedCounts = new Map<TaxRate, MatchedLocationCounts>(
			taxRatesInClass.map((rate) => [
				rate,
				{
					postcodes: (rate.postcodes ?? []).filter((pattern) =>
						postcodePatternMatches(normalizedPostcode, pattern)
					).length,
					cities: (rate.cities ?? []).filter((c) => c.toUpperCase() === cityUpperCase).length,
				},
			])
		);
		const sortedTaxRates = [...taxRatesInClass].sort((rate1, rate2) =>
			compareTaxRates(rate1, rate2, matchedCounts)
		);
		let foundMatchAtCurrentPriority = false;

		return filter(sortedTaxRates, (rate, index) => {
			const countryMatch =
				isEmpty(rate.country) || (rate.country ?? '').toUpperCase() === country.toUpperCase();
			const stateMatch =
				isEmpty(rate.state) || (rate.state ?? '').toUpperCase() === state.toUpperCase();
			const postcodeMatch =
				isEmpty(rate.postcodes) || postcodeMatcher(postcode, rate.postcodes ?? []);
			const cityMatch =
				isEmpty(rate.cities) ||
				includes(
					map(rate.cities, (city) => city.toUpperCase()),
					cityUpperCase
				);

			const isMatch = countryMatch && stateMatch && postcodeMatch && cityMatch;
			const isNewPriority = index === 0 || sortedTaxRates[index - 1].priority !== rate.priority;

			if (isNewPriority) {
				foundMatchAtCurrentPriority = false;
			}

			if (isMatch && !foundMatchAtCurrentPriority) {
				foundMatchAtCurrentPriority = true;
				return true;
			}

			return false;
		});
	});

	return flatten(filteredTaxRatesByClass);
}
