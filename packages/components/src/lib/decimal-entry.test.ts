import { typeDecimal } from './decimal-entry';

/** Each character is a key: `.` the decimal key, `<` backspace. */
const type = (keys: string, places = 2) =>
	[...keys].reduce(
		(buffer, char) =>
			typeDecimal(buffer, char === '.' ? 'decimal' : char === '<' ? 'backspace' : char, places),
		''
	);

describe('typeDecimal', () => {
	it.each([
		// keys, places, buffer
		['45', 2, '45'],
		['05', 2, '5'], // a lone 0 only starts a fraction
		['00', 2, '0'],
		['0.5', 2, '0.5'],
		['.5', 2, '0.5'], // a leading 0 before the point
		['1.5.', 2, '1.5'], // the point once
		['3.205', 2, '3.20'], // the fraction stops at the places
		['3.205', 3, '3.205'],
		['1.5', 0, '15'], // no places: no point
		['123456789012', 2, '123456789012'], // the whole part is never capped
		['12<', 2, '1'],
		['1.<<', 2, ''],
		['<', 2, ''],
	])('%s at %d places is %s', (keys, places, buffer) => {
		expect(type(keys, places)).toBe(buffer);
	});

	it('ignores a key that is not a digit, the point or backspace', () => {
		expect(typeDecimal('12', 'clear', 2)).toBe('12');
	});
});
