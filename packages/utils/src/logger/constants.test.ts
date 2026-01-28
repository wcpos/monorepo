import { ERROR_CODE_DOCS_BASE_URL, getErrorCodeDocURL } from './constants';

describe('logger/constants', () => {
	describe('ERROR_CODE_DOCS_BASE_URL', () => {
		it('should be a valid URL', () => {
			expect(ERROR_CODE_DOCS_BASE_URL).toBe('https://docs.wcpos.com/error-codes');
		});
	});

	describe('getErrorCodeDocURL', () => {
		it('should return the correct URL for an error code', () => {
			const url = getErrorCodeDocURL('API01001');
			expect(url).toBe('https://docs.wcpos.com/error-codes/API01001');
		});

		it('should handle different error code formats', () => {
			expect(getErrorCodeDocURL('DB01001')).toBe('https://docs.wcpos.com/error-codes/DB01001');
			expect(getErrorCodeDocURL('PY01001')).toBe('https://docs.wcpos.com/error-codes/PY01001');
			expect(getErrorCodeDocURL('SY01001')).toBe('https://docs.wcpos.com/error-codes/SY01001');
		});

		it('should handle empty string', () => {
			const url = getErrorCodeDocURL('');
			expect(url).toBe('https://docs.wcpos.com/error-codes/');
		});

		it('should handle special characters in error code', () => {
			const url = getErrorCodeDocURL('TEST-CODE_123');
			expect(url).toBe('https://docs.wcpos.com/error-codes/TEST-CODE_123');
		});
	});
});
