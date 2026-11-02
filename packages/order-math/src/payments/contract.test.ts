import { APP_PAYMENTS_CONTRACT, parsePaymentsContract } from '../index';

it.each([
	['1.3', { major: 1, minor: 3 }],
	['1.10', { major: 1, minor: 10 }],
	['2.0', { major: 2, minor: 0 }],
	[null, null],
	['abc', null],
	['1.3beta', null],
] as const)('parses %s', (value, parsed) => {
	expect(parsePaymentsContract(value)).toEqual(parsed);
});
it('the app claims payments contract 1.3', () => {
	expect(APP_PAYMENTS_CONTRACT).toBe('1.3');
});
