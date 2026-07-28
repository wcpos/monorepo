import { ERROR_CATALOGUE } from './generated/error-codes.generated';
import { mapExceptionToCode } from './map-exception';

describe('mapExceptionToCode', () => {
	it.each([
		['JavaScript heap out of memory', 'CLIENT201'],
		['Renderer crashed with ACCESS_VIOLATION', 'CLIENT211'],
		['wcpos:// root load rejected during app start', 'CLIENT101'],
	])('recognizes audited client failures: %s', (message, expectedCode) => {
		expect(mapExceptionToCode(new Error(message)).code).toBe(expectedCode);
	});

	it('uses the CLIENT catch-all and keeps raw exception text out of the merchant summary', () => {
		const rawMessage = 'merchant-private raw exception text';
		const result = mapExceptionToCode(new TypeError(rawMessage));

		expect(result.code).toBe('CLIENT999');
		expect(result.context).toMatchObject({ name: 'TypeError', message: rawMessage });
		expect(ERROR_CATALOGUE[result.code].summary).not.toContain(rawMessage);
	});
});
