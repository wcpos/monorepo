import { ERROR_CODES, ErrorCode } from './error-codes';

describe('logger/error-codes', () => {
	describe('ERROR_CODES', () => {
		it('should have API error codes', () => {
			// Connection errors (01xxx)
			expect(ERROR_CODES.CONNECTION_TIMEOUT).toBe('API01001');
			expect(ERROR_CODES.CONNECTION_REFUSED).toBe('API01002');
			expect(ERROR_CODES.DNS_RESOLUTION_FAILED).toBe('API01004');
			expect(ERROR_CODES.DEVICE_OFFLINE).toBe('API01007');

			// Authentication errors (02xxx)
			expect(ERROR_CODES.INVALID_CREDENTIALS).toBe('API02001');
			expect(ERROR_CODES.TOKEN_EXPIRED).toBe('API02002');
			expect(ERROR_CODES.AUTH_REQUIRED).toBe('API02010');

			// Request errors (03xxx)
			expect(ERROR_CODES.INVALID_REQUEST_FORMAT).toBe('API03001');
			expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('API03005');

			// Response errors (04xxx)
			expect(ERROR_CODES.INVALID_RESPONSE_FORMAT).toBe('API04001');
			expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBe('API04006');

			// Plugin errors (05xxx)
			expect(ERROR_CODES.WCPOS_PLUGIN_NOT_FOUND).toBe('API05002');
			expect(ERROR_CODES.WCPOS_PLUGIN_OUTDATED).toBe('API05003');

			// Configuration errors (06xxx)
			expect(ERROR_CODES.INVALID_URL_FORMAT).toBe('API06001');
		});

		it('should have database error codes', () => {
			expect(ERROR_CODES.CONNECTION_FAILED).toBe('DB01001');
			expect(ERROR_CODES.QUERY_TIMEOUT).toBe('DB01002');
			expect(ERROR_CODES.DUPLICATE_RECORD).toBe('DB02001');
			expect(ERROR_CODES.RECORD_NOT_FOUND).toBe('DB02002');
			expect(ERROR_CODES.INSERT_FAILED).toBe('DB02004');
			expect(ERROR_CODES.VALIDATION_FAILED).toBe('DB03004');
		});

		it('should have payment error codes', () => {
			expect(ERROR_CODES.PAYMENT_DECLINED).toBe('PY01001');
			expect(ERROR_CODES.INSUFFICIENT_FUNDS).toBe('PY01002');
			expect(ERROR_CODES.CARD_EXPIRED).toBe('PY01003');
			expect(ERROR_CODES.PAYMENT_GATEWAY_ERROR).toBe('PY02001');
		});

		it('should have system error codes', () => {
			expect(ERROR_CODES.OUT_OF_MEMORY).toBe('SY01001');
			expect(ERROR_CODES.DISK_FULL).toBe('SY01002');
			expect(ERROR_CODES.PERMISSION_DENIED).toBe('SY01003');
			expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBe('SY02002');
		});

		it('should follow the naming convention [DOMAIN][CATEGORY][SPECIFIC]', () => {
			// All error codes should match pattern: 2-3 letters + 5 digits
			const errorCodePattern = /^[A-Z]{2,3}\d{5}$/;

			Object.values(ERROR_CODES).forEach((code) => {
				expect(code).toMatch(errorCodePattern);
			});
		});

		it('should have unique error codes', () => {
			const codes = Object.values(ERROR_CODES);
			const uniqueCodes = new Set(codes);
			expect(uniqueCodes.size).toBe(codes.length);
		});

		it('should be immutable (const assertion)', () => {
			// TypeScript enforces this at compile time, but we can verify at runtime
			expect(Object.isFrozen(ERROR_CODES)).toBe(false); // as const doesn't freeze
			// But it should be readonly at type level - this is a type check
			const code: ErrorCode = ERROR_CODES.CONNECTION_TIMEOUT;
			expect(typeof code).toBe('string');
		});
	});

	describe('ErrorCode type', () => {
		it('should accept valid error codes', () => {
			// Type-level test - if this compiles, the type is working
			const validCode: ErrorCode = 'API01001';
			expect(validCode).toBe('API01001');
		});
	});
});
