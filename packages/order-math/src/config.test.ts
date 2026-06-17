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
test('clones and freezes tax rate collections', () => {
	const input = {
		...valid,
		rates: [{ id: 1, rate: '10' }],
		allRates: [{ id: 1, rate: '10' }],
	};
	const config = createCartConfig(input);
	input.rates[0].rate = '20';
	input.allRates.push({ id: 2, rate: '5' });

	expect(config.rates[0].rate).toBe('10');
	expect(config.allRates).toHaveLength(1);
	expect(Object.isFrozen(config.rates)).toBe(true);
	expect(Object.isFrozen(config.rates[0])).toBe(true);
	expect(Object.isFrozen(config.allRates)).toBe(true);
	expect(Object.isFrozen(config.allRates[0])).toBe(true);
});
test('throws on non-integer or negative dp', () => {
	expect(() => createCartConfig({ ...valid, dp: 2.5 })).toThrow(TypeError);
	expect(() => createCartConfig({ ...valid, dp: -1 })).toThrow(TypeError);
});
test('throws when a field is missing', () => {
	const { calcTaxes: _omit, ...partial } = valid;
	expect(() => createCartConfig(partial as never)).toThrow(TypeError);
});
