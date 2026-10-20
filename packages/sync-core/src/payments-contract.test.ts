import { describe, expect, it } from 'vitest';

import { parsePaymentsContract, paymentsContractAtLeast } from './payments-contract';

// The helpers live here (sync-engine and order-math both consume them); order-math only re-exports.
describe('payments contract helpers', () => {
	it.each([
		['1.3', { major: 1, minor: 3 }, true],
		['1.10', { major: 1, minor: 10 }, true],
		['2.0', { major: 2, minor: 0 }, true],
		[null, null, false],
		['abc', null, false],
		['1.3beta', null, false],
	] as const)('parses and compares %s', (value, parsed, expected) => {
		expect(parsePaymentsContract(value)).toEqual(parsed);
		expect(paymentsContractAtLeast(value, '1.3')).toBe(expected);
	});

	it('compares numeric minors and rejects malformed floors', () => {
		expect(paymentsContractAtLeast('1.10', '1.9')).toBe(true);
		expect(paymentsContractAtLeast('1.9', '1.10')).toBe(false);
		expect(paymentsContractAtLeast('1.3', 'abc')).toBe(false);
	});
});
