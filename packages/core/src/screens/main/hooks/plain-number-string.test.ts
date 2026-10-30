import { numericFormatter } from 'react-number-format';

import { plainNumberString } from './plain-number-string';

describe('plainNumberString', () => {
	it.each([
		[0, '0'],
		[1234.5, '1234.5'],
		[-0.5, '-0.5'],
		[111111111111111110000, '111111111111111110000'], // 21 digits: toString is still plain
		[1.1111111111111111e21, '1111111111111111100000'], // 22 digits: toString is "1.1111111111111111e+21"
		[1e21, '1000000000000000000000'],
		[-1.5e22, '-15000000000000000000000'],
		[1e-7, '0.0000001'],
		[1.5e-7, '0.00000015'],
		[1.23456e-10, '0.000000000123456'],
	])('%s is %s', (value, plain) => {
		expect(plainNumberString(value)).toBe(plain);
	});

	it('is what the formatter needs: twenty-two typed 1s never read as 1,11', () => {
		const options = {
			thousandSeparator: '.',
			decimalSeparator: ',',
			decimalScale: 2,
			fixedDecimalScale: true,
		};
		const typed = Number.parseFloat('1'.repeat(22));
		expect(numericFormatter(typed.toString(), options)).toBe('1,11');
		expect(numericFormatter(plainNumberString(typed), options)).toBe(
			'1.111.111.111.111.111.100.000,00'
		);
	});
});
