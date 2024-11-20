import forEach from 'lodash/forEach';
import reverse from 'lodash/reverse';
import round from 'lodash/round';
import sortBy from 'lodash/sortBy';
import sumBy from 'lodash/sumBy';
import toNumber from 'lodash/toNumber';

import { sumTaxes } from './sum-taxes';

/**
 * Calculate taxes when price includes tax
 */
function calcInclusiveTax({
	amount,
	rates,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean }[];
}) {
	const taxes: { id: number; total: number }[] = [];
	const compoundRates: { id: number; rate: number }[] = [];
	const regularRates: { id: number; rate: number }[] = [];
	let nonCompoundAmount = amount;

	// Index array so taxes are output in correct order and see what compound/regular rates we have to calculate.
	forEach(rates, (_rate) => {
		const { id, rate, compound } = _rate;

		if (compound) {
			compoundRates.push({ id, rate: toNumber(rate) });
		} else {
			regularRates.push({ id, rate: toNumber(rate) });
		}
	});

	reverse(compoundRates); // Working backwards.

	forEach(compoundRates, (compoundRate) => {
		const { id, rate } = compoundRate;
		const total = nonCompoundAmount - nonCompoundAmount / (1 + rate / 100);
		taxes.push({ id, total });
		nonCompoundAmount -= total;
	});

	// Regular taxes.
	const regularTaxRate = 1 + sumBy(regularRates, (regularRate) => regularRate.rate / 100);

	forEach(regularRates, (regularRate) => {
		const { id, rate } = regularRate;
		const theRate = rate / 100 / regularTaxRate;
		const netPrice = amount - theRate * nonCompoundAmount;
		const total = amount - netPrice;
		taxes.push({ id, total });
	});

	return taxes;
}

/**
 * Calculate taxes when price excludes tax
 */
function calcExclusiveTax({
	amount,
	rates,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean }[];
}) {
	const taxes: { id: number; total: number }[] = [];

	forEach(rates, (_rate) => {
		const { id, rate, compound } = _rate;

		if (!compound) {
			const total = amount * (toNumber(rate) / 100);
			taxes.push({ id, total });
		}
	});

	let preCompoundTotal = sumTaxes({ taxes });

	// Compound taxes.
	forEach(rates, (_rate) => {
		const { id, rate, compound } = _rate;

		if (compound) {
			const thePriceIncTax = amount + preCompoundTotal;
			const total = thePriceIncTax * (toNumber(rate) / 100);
			taxes.push({ id, total });
			preCompoundTotal = sumTaxes({ taxes });
		}
	});

	return taxes;
}

/**
 * Takes a price and an array of tax rates, eg: [{ id: 1, rate: '4.0000', order: 1 }]
 * Returns the calculated array of taxes tax, eg: [{ id: 1, total: 1.2345 }]
 */
export function calculateTaxes({
	amount,
	rates,
	amountIncludesTax,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean; order: number; [key: string]: any }[];
	amountIncludesTax: boolean;
}) {
	const sortedRates = sortBy(rates, 'order');

	const taxes = amountIncludesTax
		? calcInclusiveTax({ amount, rates: sortedRates })
		: calcExclusiveTax({ amount, rates: sortedRates });

	/**
	 * We round to 6 decimal places to avoid floating point errors.
	 * I believe WooCommerce rounds to 4dp.
	 */
	const roundedItemizedTaxes = taxes.map((tax) => ({
		id: tax.id,
		total: round(tax.total, 6),
	}));

	/**
	 * Should we sum the roundedItemizedTaxes, or sum the original calculation?
	 * - at 6dp the rounding errors are minimal.
	 * - seeing as though we round the itemized taxes, I guess we should sum the rounded taxes.
	 * otherwise the itemized taxes may not sum to the total.
	 */
	const total = sumTaxes({ taxes: roundedItemizedTaxes });

	return {
		total: round(total, 6),
		taxes: roundedItemizedTaxes,
	};
}
