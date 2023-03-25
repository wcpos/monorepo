import flatten from 'lodash/flatten';
import forEach from 'lodash/forEach';
import groupBy from 'lodash/groupBy';
import map from 'lodash/map';
import reverse from 'lodash/reverse';
import round from 'lodash/round';
import sortBy from 'lodash/sortBy';
import sum from 'lodash/sum';
import sumBy from 'lodash/sumBy';

type TaxRateSchema = import('@wcpos/database').TaxRateSchema;
interface Tax {
	id: string;
	total: string;
}
type TaxArray = Tax[];
interface Rate {
	id: string;
	rate: string;
}
type RateArray = Rate[];

/**
 * Round all taxes to precision (4DP) before passing them back. Note, this is not the same rounding
 * as in the cart calculation class which, depending on settings, will round to 2DP when calculating
 * final totals. Also unlike that class, this rounds .5 up for all cases.
 */
function roundedTaxStrings(taxes: TaxArray) {
	const roundedTaxes: TaxArray = [];
	forEach(taxes, (tax) => {
		roundedTaxes.push({ id: tax.id, total: String(round(parseFloat(tax.total), 4)) });
	});
	return roundedTaxes;
}

/**
 * Calculate taxes when price includes tax
 */
function calcInclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: TaxArray = [];
	const compoundRates: RateArray = [];
	const regularRates: RateArray = [];
	let nonCompoundPrice = price;

	// Index array so taxes are output in correct order and see what compound/regular rates we have to calculate.
	forEach(rates, (_rate) => {
		const { id = '0', rate = '0', compound = false } = _rate;

		if (compound) {
			compoundRates.push({ id, rate });
		} else {
			regularRates.push({ id, rate });
		}
	});

	reverse(compoundRates); // Working backwards.

	forEach(compoundRates, (compoundRate) => {
		const { id, rate } = compoundRate;
		const total = nonCompoundPrice - nonCompoundPrice / (1 + parseFloat(rate) / 100);
		taxes.push({ id, total: String(total) });
		nonCompoundPrice -= total;
	});

	// Regular taxes.
	const regularTaxRate =
		1 + sumBy(regularRates, (regularRate) => parseFloat(regularRate.rate) / 100);

	forEach(regularRates, (regularRate) => {
		const { id, rate } = regularRate;
		const theRate = parseFloat(rate) / 100 / regularTaxRate;
		const netPrice = price - theRate * nonCompoundPrice;
		const total = price - netPrice;
		taxes.push({ id, total: String(total) });
	});

	return roundedTaxStrings(taxes);
}

/**
 * Calculate taxes when price excludes tax
 */
function calcExclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: TaxArray = [];

	forEach(rates, (_rate) => {
		const { id = '0', rate = '0', compound = false } = _rate;

		if (!compound) {
			const total = price * (parseFloat(rate) / 100);
			taxes.push({ id, total: String(total) });
		}
	});

	let preCompoundTotal = sumBy(taxes, (tax) => parseFloat(tax.total));

	// Compound taxes.
	forEach(rates, (_rate) => {
		const { id = '0', rate = '0', compound = false } = _rate;

		if (compound) {
			const thePriceIncTax = price + preCompoundTotal;
			const total = thePriceIncTax * (parseFloat(rate) / 100);
			taxes.push({ id, total: String(total) });
			preCompoundTotal = sumBy(taxes, (tax) => parseFloat(tax.total));
		}
	});

	return roundedTaxStrings(taxes);
}

/**
 * Takes a price and an array of tax rates, eg: [{ id: 1, rate: '4.0000', order: 1 }]
 * Returns the calculated array of taxes tax, eg: [{ id: 1, total: 1.2345 }]
 */
export function calcTaxes(price: number, rates: TaxRateSchema[], pricesIncludeTax = false) {
	const sortedRates = sortBy(rates, 'order');

	return pricesIncludeTax
		? calcInclusiveTax(price, sortedRates)
		: calcExclusiveTax(price, sortedRates);
}

/**
 *
 */
export function sumTaxes(taxes: TaxArray, round = true) {
	return sumBy(taxes, (tax) => parseFloat(tax.total));
}

/**
 *
 */
export function sumItemizedTaxes(taxes: TaxArray, round = true) {
	// group taxes by id
	const groupedTaxes = groupBy(flatten(taxes), 'id');
	return map(groupedTaxes, (itemized, id) => ({
		id,
		total: String(sumTaxes(itemized)),
	}));
}
