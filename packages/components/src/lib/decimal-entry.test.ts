import { typeDecimal } from './decimal-entry';

/** Each character is a key: `.` the decimal key, `<` backspace. */
const type = (keys: string, places = 2, whole?: number) =>
	[...keys].reduce(
		(buffer, char) =>
			typeDecimal(
				buffer,
				char === '.' ? 'decimal' : char === '<' ? 'backspace' : char,
				places,
				whole
			),
		''
	);

describe('typeDecimal', () => {
	it.each([
		// keys, places, whole, buffer
		['45', 2, undefined, '45'],
		['05', 2, undefined, '5'], // a lone 0 only starts a fraction
		['00', 2, undefined, '0'],
		['0.5', 2, undefined, '0.5'],
		['.5', 2, undefined, '0.5'], // a leading 0 before the point
		['1.5.', 2, undefined, '1.5'], // the point once
		['3.205', 2, undefined, '3.20'], // the fraction stops at the places
		['3.205', 3, undefined, '3.205'],
		['1.5', 0, undefined, '15'], // no places: no point
		['12345', 2, 4, '1234'], // the whole part stops at `whole`
		['1234.56', 2, 4, '1234.56'], // a fraction may follow a full whole part
		['123456789012', 2, undefined, '123456789012'], // no cap unless given
		['12<', 2, undefined, '1'],
		['1.<<', 2, undefined, ''],
		['<', 2, undefined, ''],
	])('%s at %d places, %s whole digits, is %s', (keys, places, whole, buffer) => {
		expect(type(keys, places, whole)).toBe(buffer);
	});

	it('ignores a key that is not a digit, the point or backspace', () => {
		expect(typeDecimal('12', 'clear', 2)).toBe('12');
	});
});
