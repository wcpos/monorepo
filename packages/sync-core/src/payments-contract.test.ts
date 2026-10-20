import { describe, expect, it } from 'vitest';

import { parsePaymentsContract } from './payments-contract';

// The parser lives here (query reads the store's contract through it); order-math only re-exports.
describe('payments contract parser', () => {
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
});
