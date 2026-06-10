import { createCartConfig } from './config';

const valid = {
	rates: [],
	allRates: [],
	calcTaxes: true,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: '',
	calcDiscountsSequentially: false,
};

test('freezes and brands a valid config', () => {
	const config = createCartConfig(valid);
	expect(Object.isFrozen(config)).toBe(true);
	expect(config.dp).toBe(2);
});
test('throws on non-integer or negative dp', () => {
	expect(() => createCartConfig({ ...valid, dp: 2.5 })).toThrow(TypeError);
	expect(() => createCartConfig({ ...valid, dp: -1 })).toThrow(TypeError);
});
test('throws when a field is missing', () => {
	const { calcTaxes: _omit, ...partial } = valid;
	expect(() => createCartConfig(partial as never)).toThrow(TypeError);
});
