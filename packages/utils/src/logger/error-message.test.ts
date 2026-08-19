import { getErrorMessage } from './error-message';

describe('getErrorMessage', () => {
	it('extracts the message from an Error', () => {
		expect(getErrorMessage(new Error('boom'))).toBe('boom');
	});

	it.each([
		['a string', 'failure', 'failure'],
		['a number', 42, '42'],
		['undefined', undefined, 'undefined'],
		['a plain object', { reason: 'failure' }, '[object Object]'],
	])('converts %s with String', (_label, error, expected) => {
		expect(getErrorMessage(error)).toBe(expected);
	});
});
