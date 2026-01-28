import {
	isWpErrorResponse,
	mapToInternalCode,
	parseWpError,
	extractErrorMessage,
	extractWpErrorCode,
	WpErrorResponse,
	ParsedWpError,
} from './parse-wp-error';

describe('parse-wp-error', () => {
	describe('isWpErrorResponse', () => {
		it('should return true for valid WP error with code and message', () => {
			const error: WpErrorResponse = {
				code: 'woocommerce_rest_cannot_view',
				message: 'Sorry, you cannot view this resource.',
				data: { status: 401 },
			};
			expect(isWpErrorResponse(error)).toBe(true);
		});

		it('should return true for error with only code', () => {
			expect(isWpErrorResponse({ code: 'some_error' })).toBe(true);
		});

		it('should return true for error with only message', () => {
			expect(isWpErrorResponse({ message: 'Some error' })).toBe(true);
		});

		it('should return false for null', () => {
			expect(isWpErrorResponse(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isWpErrorResponse(undefined)).toBe(false);
		});

		it('should return false for primitive values', () => {
			expect(isWpErrorResponse('string')).toBe(false);
			expect(isWpErrorResponse(123)).toBe(false);
			expect(isWpErrorResponse(true)).toBe(false);
		});

		it('should return false for empty object', () => {
			expect(isWpErrorResponse({})).toBe(false);
		});

		it('should return false for object with non-string code/message', () => {
			expect(isWpErrorResponse({ code: 123 })).toBe(false);
			expect(isWpErrorResponse({ message: 123 })).toBe(false);
		});
	});

	describe('mapToInternalCode', () => {
		describe('direct mappings', () => {
			it('should map WordPress REST API errors', () => {
				expect(mapToInternalCode('rest_forbidden')).toBe('API02005');
				expect(mapToInternalCode('rest_cannot_view')).toBe('API02004');
				expect(mapToInternalCode('rest_login_required')).toBe('API02010');
				expect(mapToInternalCode('rest_no_route')).toBe('API04006');
				expect(mapToInternalCode('rest_invalid_param')).toBe('API03003');
			});

			it('should map WooCommerce REST API errors', () => {
				expect(mapToInternalCode('woocommerce_rest_authentication_error')).toBe('API02001');
				expect(mapToInternalCode('woocommerce_rest_cannot_view')).toBe('API02004');
				expect(mapToInternalCode('woocommerce_rest_cannot_create')).toBe('API02005');
				expect(mapToInternalCode('woocommerce_rest_invalid_id')).toBe('API03003');
			});

			it('should map JWT Auth errors', () => {
				expect(mapToInternalCode('jwt_auth_failed')).toBe('API02001');
				expect(mapToInternalCode('jwt_auth_invalid_token')).toBe('API02003');
				expect(mapToInternalCode('jwt_auth_expired_token')).toBe('API02002');
				expect(mapToInternalCode('jwt_auth_no_auth_header')).toBe('API02010');
			});
		});

		describe('HTTP status fallbacks', () => {
			it('should fallback to HTTP status mapping when no direct mapping', () => {
				expect(mapToInternalCode('unknown_error', 400)).toBe('API03001');
				expect(mapToInternalCode('unknown_error', 401)).toBe('API02010');
				expect(mapToInternalCode('unknown_error', 403)).toBe('API02005');
				expect(mapToInternalCode('unknown_error', 404)).toBe('API04006');
				expect(mapToInternalCode('unknown_error', 429)).toBe('API03005');
			});

			it('should map 5xx errors to service unavailable', () => {
				expect(mapToInternalCode('unknown_error', 500)).toBe('SY02002');
				expect(mapToInternalCode('unknown_error', 502)).toBe('SY02002');
				expect(mapToInternalCode('unknown_error', 503)).toBe('SY02002');
				expect(mapToInternalCode('unknown_error', 504)).toBe('SY02002');
			});

			it('should return null for unknown codes without HTTP status', () => {
				expect(mapToInternalCode('unknown_error')).toBeNull();
				expect(mapToInternalCode('another_unknown')).toBeNull();
			});

			it('should return null for unmapped HTTP status', () => {
				expect(mapToInternalCode('unknown_error', 200)).toBeNull();
				expect(mapToInternalCode('unknown_error', 302)).toBeNull();
			});
		});

		describe('edge cases', () => {
			it('should handle null server code', () => {
				expect(mapToInternalCode(null)).toBeNull();
				expect(mapToInternalCode(null, 401)).toBe('API02010');
			});

			it('should handle undefined server code', () => {
				expect(mapToInternalCode(undefined)).toBeNull();
				expect(mapToInternalCode(undefined, 403)).toBe('API02005');
			});

			it('should prefer direct mapping over HTTP status', () => {
				// Even with a 404 status, the direct mapping should be used
				expect(mapToInternalCode('rest_forbidden', 404)).toBe('API02005');
			});
		});
	});

	describe('parseWpError', () => {
		const fallback = 'An error occurred';

		it('should parse a full WP error response', () => {
			const error: WpErrorResponse = {
				code: 'woocommerce_rest_cannot_view',
				message: 'Sorry, you cannot view this resource.',
				data: { status: 401 },
			};

			const result = parseWpError(error, fallback);

			expect(result.message).toBe('Sorry, you cannot view this resource.');
			expect(result.code).toBe('API02004');
			expect(result.serverCode).toBe('woocommerce_rest_cannot_view');
			expect(result.status).toBe(401);
			expect(result.isWpError).toBe(true);
		});

		it('should handle error with only message', () => {
			const error = { message: 'Custom error message' };
			const result = parseWpError(error, fallback);

			expect(result.message).toBe('Custom error message');
			expect(result.code).toBeNull();
			expect(result.serverCode).toBeNull();
			expect(result.isWpError).toBe(true);
		});

		it('should handle string error', () => {
			const result = parseWpError('Simple string error', fallback);

			expect(result.message).toBe('Simple string error');
			expect(result.code).toBeNull();
			expect(result.isWpError).toBe(false);
		});

		it('should use fallback for non-WP error objects', () => {
			const result = parseWpError({ foo: 'bar' }, fallback);

			expect(result.message).toBe(fallback);
			expect(result.isWpError).toBe(false);
		});

		it('should use fallback for null', () => {
			const result = parseWpError(null, fallback);

			expect(result.message).toBe(fallback);
			expect(result.isWpError).toBe(false);
		});

		it('should use fallback for undefined', () => {
			const result = parseWpError(undefined, fallback);

			expect(result.message).toBe(fallback);
			expect(result.isWpError).toBe(false);
		});

		it('should use fallback for empty string', () => {
			const result = parseWpError('   ', fallback);

			expect(result.message).toBe(fallback);
		});
	});

	describe('extractErrorMessage', () => {
		const fallback = 'Something went wrong';

		it('should extract message from WP error', () => {
			const error = {
				code: 'test_error',
				message: 'WP error message',
			};
			expect(extractErrorMessage(error, fallback)).toBe('WP error message');
		});

		it('should extract message from generic error object', () => {
			expect(extractErrorMessage({ message: 'Generic message' }, fallback)).toBe('Generic message');
			expect(extractErrorMessage({ error: 'Error field' }, fallback)).toBe('Error field');
			expect(extractErrorMessage({ error_description: 'OAuth error' }, fallback)).toBe('OAuth error');
		});

		it('should extract first validation error', () => {
			const validationError = {
				errors: {
					email: ['Invalid email format'],
					password: ['Password too short'],
				},
			};
			expect(extractErrorMessage(validationError, fallback)).toBe('Invalid email format');
		});

		it('should handle errors object with string values', () => {
			const error = {
				errors: {
					field: 'Field error string',
				},
			};
			expect(extractErrorMessage(error, fallback)).toBe('Field error string');
		});

		it('should return fallback for empty/null values', () => {
			expect(extractErrorMessage(null, fallback)).toBe(fallback);
			expect(extractErrorMessage(undefined, fallback)).toBe(fallback);
			expect(extractErrorMessage({}, fallback)).toBe(fallback);
		});

		it('should return fallback for objects without known error fields', () => {
			expect(extractErrorMessage({ foo: 'bar' }, fallback)).toBe(fallback);
			expect(extractErrorMessage({ data: { nested: 'value' } }, fallback)).toBe(fallback);
		});
	});

	describe('extractWpErrorCode', () => {
		it('should extract code from WP error', () => {
			expect(extractWpErrorCode({ code: 'woocommerce_rest_error', message: 'Error' })).toBe(
				'woocommerce_rest_error'
			);
		});

		it('should return null for non-WP error', () => {
			expect(extractWpErrorCode({ foo: 'bar' })).toBeNull();
			expect(extractWpErrorCode(null)).toBeNull();
			expect(extractWpErrorCode('string')).toBeNull();
		});

		it('should return null for WP error without code', () => {
			expect(extractWpErrorCode({ message: 'Error without code' })).toBeNull();
		});
	});
});
