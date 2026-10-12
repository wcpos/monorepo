import { tintOf } from './tint-of';

it('takes a number modulo six', () => {
	expect(tintOf(0)).toBe(0);
	expect(tintOf(5)).toBe(5);
	expect(tintOf(6)).toBe(0);
	expect(tintOf(7)).toBe(1);
});

it('keeps a negative number in range', () => {
	expect(tintOf(-1)).toBe(5);
	expect(tintOf(-6)).toBe(0);
});

it('sums a string’s UTF-16 code units modulo six, the same every time', () => {
	// H 72 + o 111 + o 111 + d 100 + i 105 + e 101 = 600; 600 % 6 = 0.
	expect(tintOf('Hoodie')).toBe(0);
	// T 84 + e 101 + e 101 = 286; 286 % 6 = 4.
	expect(tintOf('Tee')).toBe(4);
	expect(tintOf('Tee')).toBe(tintOf('Tee'));
	expect(tintOf('')).toBe(0);
});

it('gives a fractional or non-finite number a tint in range', () => {
	expect(tintOf(7.9)).toBe(1);
	expect(tintOf(Number.NaN)).toBe(0);
});
