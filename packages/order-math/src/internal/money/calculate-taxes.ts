import forEach from 'lodash/forEach';
import reverse from 'lodash/reverse';
import sumBy from 'lodash/sumBy';
import toNumber from 'lodash/toNumber';

import { getRoundingPrecision, roundHalfUp } from './precision';
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
 *
 * @param dp - Price decimal places (wc_get_price_decimals), default 2
 */
export function calculateTaxes({
	amount,
	rates,
	amountIncludesTax,
	dp = 2,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean; order: number; [key: string]: any }[];
	amountIncludesTax: boolean;
	dp?: number;
}) {
	// Sort rates matching WC_Tax::sort_rates_callback():
	// 1. tax_rate_priority (ascending) — mapped to `order`
	// 2. tax_rate_country: non-empty first
	// 3. tax_rate_state: non-empty first
	// 4. tax_rate_id (ascending) — mapped to `id`
	const sortedRates = [...rates].sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		const aCountry = (a as any).country || '';
		const bCountry = (b as any).country || '';
		if ((aCountry !== '') !== (bCountry !== '')) return aCountry !== '' ? -1 : 1;
		const aState = (a as any).state || '';
		const bState = (b as any).state || '';
		if ((aState !== '') !== (bState !== '')) return aState !== '' ? -1 : 1;
		return a.id - b.id;
	});
	const roundingPrecision = getRoundingPrecision(dp);

	const taxes = amountIncludesTax
		? calcInclusiveTax({ amount, rates: sortedRates })
		: calcExclusiveTax({ amount, rates: sortedRates });

	/**
	 * WooCommerce rounds each itemized tax to the rounding precision (default 6dp).
	 * This matches WC_Tax::round() which uses wc_get_rounding_precision().
	 */
	const roundedItemizedTaxes = taxes.map((tax) => ({
		id: tax.id,
		total: roundHalfUp(tax.total, roundingPrecision),
	}));

	/**
	 * Sum the rounded itemized taxes so that itemized taxes always sum to the total.
	 */
	const total = sumTaxes({ taxes: roundedItemizedTaxes });

	return {
		total: roundHalfUp(total, roundingPrecision),
		taxes: roundedItemizedTaxes,
	};
}
