import forEach from 'lodash/forEach';
import reverse from 'lodash/reverse';
import sumBy from 'lodash/sumBy';
import sortBy from 'lodash/sortBy';
import round from 'lodash/round';
import map from 'lodash/map';
import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';

type TaxRateSchema = import('@wcpos/database').TaxRateSchema;
interface Taxes {
	id: number;
	total: string;
}

/**
 * Round taxes and convert total to string
 */
function roundedTaxStrings(taxes: { id: number; total: number }[]) {
	const roundedTaxes: { id: number; total: string }[] = [];
	forEach(taxes, (tax) => {
		roundedTaxes.push({ id: tax.id, total: String(round(tax.total, 4)) });
	});
	return roundedTaxes;
}

/**
 * Calculate taxes when price includes tax
 */
function calcInclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: { id: number; total: number }[] = [];
	const compoundRates: { id: number; rate: string }[] = [];
	const regularRates: { id: number; rate: string }[] = [];
	let nonCompoundPrice = price;

	// Index array so taxes are output in correct order and see what compound/regular rates we have to calculate.
	forEach(rates, (_rate) => {
		const { id = 0, rate = '0', compound = false } = _rate;

		if (compound) {
			compoundRates.push({ id, rate });
		} else {
			regularRates.push({ id, rate });
		}
	});

	reverse(compoundRates); // Working backwards.

	forEach(compoundRates, (compoundRate) => {
		const { id, rate } = compoundRate;
		const total = nonCompoundPrice - nonCompoundPrice / (1 + +rate / 100);
		taxes.push({ id, total });
		nonCompoundPrice -= total;
	});

	// Regular taxes.
	const regularTaxRate = 1 + sumBy(regularRates, (regularRate) => +regularRate.rate / 100);

	forEach(regularRates, (regularRate) => {
		const { id, rate } = regularRate;
		const theRate = +rate / 100 / regularTaxRate;
		const netPrice = price - theRate * nonCompoundPrice;
		const total = price - netPrice;
		taxes.push({ id, total });
	});

	/**
	 * Round all taxes to precision (4DP) before passing them back. Note, this is not the same rounding
	 * as in the cart calculation class which, depending on settings, will round to 2DP when calculating
	 * final totals. Also unlike that class, this rounds .5 up for all cases.
	 */
	// const roundedTaxes = map(taxes, (tax) => {
	// 	tax.total = round(tax.total, 4);
	// 	return tax;
	// });

	return roundedTaxStrings(taxes);
}

/**
 * Calculate taxes when price excludes tax
 */
function calcExclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: { id: number; total: number }[] = [];

	forEach(rates, (_rate) => {
		const { id = 0, rate = '0', compound = false } = _rate;

		if (!compound) {
			const total = price * (+rate / 100);
			taxes.push({ id, total });
		}
	});

	let preCompoundTotal = sumBy(taxes, (tax) => tax.total);

	// Compound taxes.
	forEach(rates, (_rate) => {
		const { id = 0, rate = '0', compound = false } = _rate;

		if (compound) {
			const thePriceIncTax = price + preCompoundTotal;
			const total = thePriceIncTax * (+rate / 100);
			taxes.push({ id, total });
			preCompoundTotal = sumBy(taxes, (tax) => tax.total);
		}
	});

	/**
	 * Round all taxes to precision (4DP) before passing them back. Note, this is not the same rounding
	 * as in the cart calculation class which, depending on settings, will round to 2DP when calculating
	 * final totals. Also unlike that class, this rounds .5 up for all cases.
	 */
	// const roundedTaxes = map(taxes, (tax) => {
	// 	tax.total = round(tax.total, 4);
	// 	return tax;
	// });

	return roundedTaxStrings(taxes);
}

/**
 * Takes a price and an array of tax rates, eg: [{ id: 1, rate: '4.0000', order: 1 }]
 * Returns the calculated array of taxes tax, eg: [{ id: 1, total: 1.2345 }]
 */
export function calcTaxes(price: number, rates: TaxRateSchema[], priceIncludesTax = false) {
	const sortedRates = sortBy(rates, 'order');

	return priceIncludesTax
		? calcInclusiveTax(+price, sortedRates)
		: calcExclusiveTax(+price, sortedRates);
}

/**
 *
 */
export function sumTaxes(taxes: Taxes[]) {
	return sumBy(taxes, (tax) => +tax.total);
}

/**
 *
 */
export function sumItemizedTaxes(taxes: Taxes[]) {
	// group taxes by id
	const groupedTaxes = groupBy(flatten(taxes), 'id');
	return map(groupedTaxes, (itemized, id) => ({
		id: +id,
		total: String(sumTaxes(itemized)),
	}));
}
