import filter from 'lodash/filter';
import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';
import includes from 'lodash/includes';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import replace from 'lodash/replace';
import some from 'lodash/some';
import sortBy from 'lodash/sortBy';
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
	postcode: string = '',
	city: string = ''
): TaxRate[] {
	// Group tax rates by class
	const taxRatesByClass = groupBy(taxRates, 'class');

	// Filter tax rates within each class
	const filteredTaxRatesByClass = map(taxRatesByClass, (taxRatesInClass) => {
		// Sort tax rates by priority
		const sortedTaxRates = sortBy(taxRatesInClass, ['priority', 'id']);

		const cityUpperCase = city.toUpperCase();

		return filter(sortedTaxRates, (rate, index) => {
			const postcodeMatch =
				isEmpty(rate.postcodes) || postcodeLocationMatcher(postcode, rate.postcodes);
			const cityMatch =
				isEmpty(rate.cities) ||
				includes(
					map(rate.cities, (city) => city.toUpperCase()),
					cityUpperCase
				);

			// Check if the current tax rate has the same priority as the previous tax rate
			if (index > 0 && sortedTaxRates[index - 1].priority === rate.priority) {
				return false;
			}

			return postcodeMatch && cityMatch;
		});
	});

	// Flatten the array of tax rates
	return flatten(filteredTaxRatesByClass);
}
