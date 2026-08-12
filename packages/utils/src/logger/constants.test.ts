import { ERROR_CODE_DOCS_BASE_URL, getErrorCodeDocURL } from './constants';

describe('logger/constants', () => {
	describe('ERROR_CODE_DOCS_BASE_URL', () => {
		it('should be a valid URL', () => {
			expect(ERROR_CODE_DOCS_BASE_URL).toBe('https://docs.wcpos.com/error-codes');
		});
	});

	describe('getErrorCodeDocURL', () => {
		it('should return the correct URL for an error code', () => {
			const url = getErrorCodeDocURL('SYNC101');
			expect(url).toBe('https://docs.wcpos.com/error-codes/SYNC101');
		});

		it('should handle different error code formats', () => {
			expect(getErrorCodeDocURL('SYNC101')).toBe('https://docs.wcpos.com/error-codes/SYNC101');
			expect(getErrorCodeDocURL('PAYMENT201')).toBe(
				'https://docs.wcpos.com/error-codes/PAYMENT201'
			);
			expect(getErrorCodeDocURL('CLIENT999')).toBe('https://docs.wcpos.com/error-codes/CLIENT999');
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
