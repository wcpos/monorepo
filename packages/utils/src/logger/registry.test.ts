import { ERROR_CATALOGUE, ERROR_CODES } from './generated/error-codes.generated';
import { CODE_REGISTRY, isRegisteredCode } from './registry';

describe('logger code registry', () => {
	it('contains every generated error code', () => {
		expect(CODE_REGISTRY).toHaveLength(Object.keys(ERROR_CATALOGUE).length);
		expect(CODE_REGISTRY).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					symbol: 'LOCAL_DB_WRITE_FAILED',
					domain: 'sync',
					severity: 'error',
				}),
				expect.objectContaining({
					code: ERROR_CODES.CREDENTIALS_REJECTED,
					domain: 'auth',
					severity: 'warn',
				}),
			])
		);
		expect(CODE_REGISTRY.every((entry) => !('deprecated' in entry))).toBe(true);
	});

	it('recognizes only registered codes', () => {
		expect(isRegisteredCode(ERROR_CODES.LOCAL_DB_WRITE_FAILED)).toBe(true);
		expect(isRegisteredCode('NEW00001')).toBe(false);
	});
});
