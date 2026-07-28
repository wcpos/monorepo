import { ERROR_CODES } from './error-codes';
import { CODE_REGISTRY, isRegisteredCode } from './registry';

describe('logger code registry', () => {
	it('contains every legacy error code as deprecated', () => {
		expect(CODE_REGISTRY).toHaveLength(Object.keys(ERROR_CODES).length);
		expect(CODE_REGISTRY).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: ERROR_CODES.CONNECTION_TIMEOUT,
					symbol: 'CONNECTION_TIMEOUT',
					domain: 'client',
					severity: 'error',
					deprecated: true,
				}),
				expect.objectContaining({ code: ERROR_CODES.QUERY_TIMEOUT, domain: 'db' }),
				expect.objectContaining({ code: ERROR_CODES.PAYMENT_TIMEOUT, domain: 'payment' }),
				expect.objectContaining({ code: ERROR_CODES.DISK_FULL, domain: 'client' }),
			])
		);
	});

	it('recognizes only registered codes', () => {
		expect(isRegisteredCode(ERROR_CODES.CONNECTION_TIMEOUT)).toBe(true);
		expect(isRegisteredCode('NEW00001')).toBe(false);
	});
});
