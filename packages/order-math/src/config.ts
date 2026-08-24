import type { TaxRateInput } from './types';

declare const CART_CONFIG: unique symbol;

export interface CartConfigInput {
	rates: readonly TaxRateInput[];
	allRates: readonly TaxRateInput[];
	calcTaxes: boolean;
	pricesIncludeTax: boolean;
	taxRoundAtSubtotal: boolean;
	dp: number;
	shippingTaxClass: string;
	/**
	 * The store's tax classes in their configured order, standard first — i.e. the
	 * `wc/v3 taxes/classes` list, which is `array_merge([''], WC_Tax::get_tax_class_slugs())`
	 * in the same order. Only read when `shippingTaxClass` is the 'inherit' sentinel,
	 * where it is the candidate order the resolution walks.
	 */
	taxClassSlugs: readonly string[];
	calcDiscountsSequentially: boolean;
}
export interface CartConfig extends Readonly<CartConfigInput> {
	readonly [CART_CONFIG]: true;
}

const BOOLEANS = [
	'calcTaxes',
	'pricesIncludeTax',
	'taxRoundAtSubtotal',
	'calcDiscountsSequentially',
] as const;

const freezeRates = <T extends object>(rates: readonly T[]) =>
	Object.freeze(rates.map((rate) => Object.freeze({ ...rate })));

/** The only function in this package that throws — programmer error at assembly time. */
export function createCartConfig(input: CartConfigInput): CartConfig {
	if (!input || typeof input !== 'object') throw new TypeError('createCartConfig: input required');
	if (!Array.isArray(input.rates) || !Array.isArray(input.allRates))
		throw new TypeError('createCartConfig: rates and allRates must be arrays');
	for (const key of BOOLEANS) {
		if (typeof input[key] !== 'boolean')
			throw new TypeError(`createCartConfig: ${key} must be boolean`);
	}
	if (!Number.isInteger(input.dp) || input.dp < 0)
		throw new TypeError('createCartConfig: dp must be a non-negative integer');
	if (typeof input.shippingTaxClass !== 'string')
		throw new TypeError('createCartConfig: shippingTaxClass must be a string');
	if (!Array.isArray(input.taxClassSlugs))
		throw new TypeError('createCartConfig: taxClassSlugs must be an array');
	return Object.freeze({
		...input,
		rates: freezeRates(input.rates),
		allRates: freezeRates(input.allRates),
		taxClassSlugs: Object.freeze([...input.taxClassSlugs]),
	}) as CartConfig;
}
