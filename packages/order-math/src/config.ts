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
	return Object.freeze({
		...input,
		rates: freezeRates(input.rates),
		allRates: freezeRates(input.allRates),
	}) as CartConfig;
}
