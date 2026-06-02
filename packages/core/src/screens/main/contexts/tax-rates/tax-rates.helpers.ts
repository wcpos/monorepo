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

/**
 * Check if a given postcode matches any of the patterns in the provided list.
 */
function postcodeMatcher(postcode: string, patterns: string[]): boolean {
	const normalizedPostcode = normalizePostcode(postcode);

	return some(patterns, (pattern) => {
		const matchingPostcodes = getMatchingPostcodes(pattern);
		return matchingPostcodes.some((pc) =>
			pattern.endsWith('*') ? normalizedPostcode.startsWith(pc) : pc === normalizedPostcode
		);
	});
}

function compareTaxRates(rate1: TaxRate, rate2: TaxRate): number {
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

	const postcodeCount1 = rate1.postcodes?.length ?? 0;
	const postcodeCount2 = rate2.postcodes?.length ?? 0;
	if (postcodeCount1 !== postcodeCount2) {
		return postcodeCount1 < postcodeCount2 ? 1 : -1;
	}

	const cityCount1 = rate1.cities?.length ?? 0;
	const cityCount2 = rate2.cities?.length ?? 0;
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
	const filteredTaxRatesByClass = map(taxRatesByClass, (taxRatesInClass) => {
		const sortedTaxRates = [...taxRatesInClass].sort(compareTaxRates);
		const cityUpperCase = city.toUpperCase();
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
