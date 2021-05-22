import forEach from 'lodash/forEach';
import reverse from 'lodash/reverse';
import sumBy from 'lodash/sumBy';
import sortBy from 'lodash/sortBy';
import round from 'lodash/round';
import map from 'lodash/map';
import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';

type TaxRateSchema = import('@wcpos/common/src/database').TaxRateSchema;
interface Taxes {
	id: number;
	taxAmount: number;
}

/**
 * Calculate taxes when price includes tax
 */
function calcInclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: { id: number; taxAmount: number }[] = [];
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
		const taxAmount = nonCompoundPrice - nonCompoundPrice / (1 + +rate / 100);
		taxes.push({ id, taxAmount });
		nonCompoundPrice -= taxAmount;
	});

	// Regular taxes.
	const regularTaxRate = 1 + sumBy(regularRates, (regularRate) => +regularRate.rate / 100);

	forEach(regularRates, (regularRate) => {
		const { id, rate } = regularRate;
		const theRate = +rate / 100 / regularTaxRate;
		const netPrice = price - theRate * nonCompoundPrice;
		const taxAmount = price - netPrice;
		taxes.push({ id, taxAmount });
	});

	/**
	 * Round all taxes to precision (4DP) before passing them back. Note, this is not the same rounding
	 * as in the cart calculation class which, depending on settings, will round to 2DP when calculating
	 * final totals. Also unlike that class, this rounds .5 up for all cases.
	 */
	const roundedTaxes = map(taxes, (tax) => {
		tax.taxAmount = round(tax.taxAmount, 4);
		return tax;
	});

	return roundedTaxes;
}

/**
 * Calculate taxes when price excludes tax
 */
function calcExclusiveTax(price: number, rates: TaxRateSchema[]) {
	const taxes: { id: number; taxAmount: number }[] = [];

	forEach(rates, (_rate) => {
		const { id = 0, rate = '0', compound = false } = _rate;

		if (!compound) {
			const taxAmount = price * (+rate / 100);
			taxes.push({ id, taxAmount });
		}
	});

	let preCompoundTotal = sumBy(taxes, (tax) => tax.taxAmount);

	// Compound taxes.
	forEach(rates, (_rate) => {
		const { id = 0, rate = '0', compound = false } = _rate;

		if (compound) {
			const thePriceIncTax = price + preCompoundTotal;
			const taxAmount = thePriceIncTax * (+rate / 100);
			taxes.push({ id, taxAmount });
			preCompoundTotal = sumBy(taxes, (tax) => tax.taxAmount);
		}
	});

	/**
	 * Round all taxes to precision (4DP) before passing them back. Note, this is not the same rounding
	 * as in the cart calculation class which, depending on settings, will round to 2DP when calculating
	 * final totals. Also unlike that class, this rounds .5 up for all cases.
	 */
	const roundedTaxes = map(taxes, (tax) => {
		tax.taxAmount = round(tax.taxAmount, 4);
		return tax;
	});

	return roundedTaxes;
}

/**
 * Takes a price and an array of tax rates, eg: [{ id: 1, rate: '4.0000', order: 1 }]
 * Returns the calculated array of taxes tax, eg: [{ id: 1, taxAmount: 1.2345 }]
 */
export function calcTaxes(price: number, rates: TaxRateSchema[], priceIncludesTax = false) {
	const sortedRates = sortBy(rates, 'order');
	return priceIncludesTax
		? calcInclusiveTax(price, sortedRates)
		: calcExclusiveTax(price, sortedRates);
}

/**
 *
 */
export function sumTaxes(taxes: Taxes[]) {
	return sumBy(taxes, 'taxAmount');
}

/**
 *
 */
export function sumItemizedTaxes(taxes: Taxes[]) {
	// group taxes by id
	const groupedTaxes = groupBy(flatten(taxes), 'id');
	return map(groupedTaxes, (itemized, id) => ({
		id: +id,
		taxAmount: sumTaxes(itemized),
	}));
}
