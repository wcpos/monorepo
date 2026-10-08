import {
	extractErrorMessage,
	extractWpErrorCode,
	isWpErrorResponse,
	mapToInternalCode,
	parseWpError,
	readWpFatalDetail,
	WpErrorResponse,
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
				expect(mapToInternalCode('rest_forbidden')).toBe('AUTH201');
				expect(mapToInternalCode('rest_cannot_view')).toBe('AUTH201');
				expect(mapToInternalCode('rest_login_required')).toBe('AUTH101');
				expect(mapToInternalCode('rest_no_route')).toBe('AUTH311');
				expect(mapToInternalCode('rest_invalid_param')).toBe('SYNC211');
			});

			it('should map WooCommerce REST API errors', () => {
				expect(mapToInternalCode('woocommerce_rest_authentication_error')).toBe('AUTH101');
				expect(mapToInternalCode('woocommerce_rest_cannot_view')).toBe('AUTH201');
				expect(mapToInternalCode('woocommerce_rest_cannot_create')).toBe('AUTH201');
				expect(mapToInternalCode('woocommerce_rest_invalid_id')).toBe('SYNC211');
			});

			it('should map the protocol-gate upgrade refusal', () => {
				expect(mapToInternalCode('wcpos_update_required')).toBe('SYNC341');
			});

			it('should map JWT Auth errors', () => {
				expect(mapToInternalCode('jwt_auth_failed')).toBe('AUTH101');
				expect(mapToInternalCode('jwt_auth_invalid_token')).toBe('AUTH101');
				expect(mapToInternalCode('jwt_auth_expired_token')).toBe('AUTH101');
				expect(mapToInternalCode('jwt_auth_no_auth_header')).toBe('AUTH101');
			});
		});

		describe('HTTP status fallbacks', () => {
			it('should fallback to HTTP status mapping when no direct mapping', () => {
				expect(mapToInternalCode('unknown_error', 400)).toBe('SYNC211');
				expect(mapToInternalCode('unknown_error', 401)).toBe('AUTH101');
				expect(mapToInternalCode('unknown_error', 403)).toBe('AUTH201');
				expect(mapToInternalCode('unknown_error', 404)).toBe('AUTH311');
				expect(mapToInternalCode('unknown_error', 429)).toBe('SYNC141');
			});

			it('should map 5xx errors to the store-server code, never a client code', () => {
				// The store WAS reached and its server failed — that is the site's fault,
				// not the POS's, and it carries a different safe action.
				expect(mapToInternalCode('unknown_error', 500)).toBe('SYNC131');
				expect(mapToInternalCode('unknown_error', 502)).toBe('SYNC131');
				expect(mapToInternalCode('unknown_error', 503)).toBe('SYNC131');
				expect(mapToInternalCode('unknown_error', 504)).toBe('SYNC131');
			});

			it('should return the catch-all for unknown codes without HTTP status', () => {
				expect(mapToInternalCode('unknown_error')).toBe('CLIENT999');
				expect(mapToInternalCode('another_unknown')).toBe('CLIENT999');
			});

			it('should return the catch-all for unmapped HTTP status', () => {
				expect(mapToInternalCode('unknown_error', 200)).toBe('CLIENT999');
				expect(mapToInternalCode('unknown_error', 302)).toBe('CLIENT999');
			});
		});

		describe('edge cases', () => {
			it('should handle null server code', () => {
				expect(mapToInternalCode(null)).toBeNull();
				expect(mapToInternalCode(null, 401)).toBe('AUTH101');
			});

			it('should handle undefined server code', () => {
				expect(mapToInternalCode(undefined)).toBeNull();
				expect(mapToInternalCode(undefined, 403)).toBe('AUTH201');
			});

			it('should prefer direct mapping over HTTP status', () => {
				// Even with a 404 status, the direct mapping should be used
				expect(mapToInternalCode('rest_forbidden', 404)).toBe('AUTH201');
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
			expect(result.code).toBe('AUTH201');
			expect(result.serverCode).toBe('woocommerce_rest_cannot_view');
			expect(result.status).toBe(401);
			expect(result.isWpError).toBe(true);
			expect(result.triage).toBeUndefined();
		});

		it('preserves an unmapped server code and marks its catch-all for triage', () => {
			const result = parseWpError(
				{
					code: 'merchant_plugin_unknown_error',
					message: 'Unexpected response',
					data: { status: 503 },
				},
				fallback
			);

			expect(result).toMatchObject({
				code: 'SYNC131',
				serverCode: 'merchant_plugin_unknown_error',
				status: 503,
				triage: true,
			});
		});

		it('replaces an unsafe server code before exposing it to consumers', () => {
			const result = parseWpError(
				{
					code: 'bad code<script>',
					message: 'Unexpected response',
					data: { status: 400 },
				},
				fallback
			);

			expect(result.serverCode).toBe('invalid_server_code');
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
			expect(extractErrorMessage({ error_description: 'OAuth error' }, fallback)).toBe(
				'OAuth error'
			);
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

	// WordPress wraps a PHP fatal in `internal_server_error` whose `message` is the
	// localized "critical error" boilerplate; the error itself — the sentence that
	// names the cause — is `data.error` ({ type, message, file, line }), present
	// only when the site exposes error details (#2439, plugin #2157).
	describe('WordPress fatal detail', () => {
		const fatalBody = {
			code: 'internal_server_error',
			message: '<p>Er heeft zich een kritieke fout voorgedaan op deze site.</p>',
			data: {
				status: 500,
				error: {
					type: 1,
					message:
						'Allowed memory size of 134217728 bytes exhausted (tried to allocate 16384 bytes)',
					file: '/srv/www/wp-includes/class-wpdb.php',
					line: 2324,
				},
			},
		};
		const fatalSentence =
			'Allowed memory size of 134217728 bytes exhausted (tried to allocate 16384 bytes) in wp-includes/class-wpdb.php:2324';

		it('prefers the PHP error over the critical-error boilerplate, keeping code and status', () => {
			const parsed = parseWpError(fatalBody, 'fallback');

			expect(parsed.message).toBe(fatalSentence);
			expect(parsed.serverCode).toBe('internal_server_error');
			expect(parsed.status).toBe(500);
			expect(parsed.code).toBe('SYNC131');
		});

		it('keeps the boilerplate, stripped of its HTML, when the site hides error details', () => {
			const parsed = parseWpError(
				{
					...fatalBody,
					message:
						'<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/documentation/article/faq-troubleshooting/">Learn more about troubleshooting WordPress.</a></p>',
					data: { status: 500 },
				},
				'fallback'
			);

			expect(parsed.message).toBe(
				'There has been a critical error on this website. Learn more about troubleshooting WordPress.'
			);
		});

		it('keeps a lone `<` as text and stays linear on a run of them', () => {
			const run = '<'.repeat(5_000);
			expect(
				parseWpError({ code: 'x', message: `Stock <b>fell</b> below 3 ${run}` }, 'fallback').message
			).toBe(`Stock fell below 3 ${run}`);
		});

		it('leaves entities for the renderer and falls back when the message is only markup', () => {
			expect(
				parseWpError({ code: 'x', message: 'D&eacute;sol&eacute;.' }, 'fallback').message
			).toBe('D&eacute;sol&eacute;.');
			expect(parseWpError({ code: 'x', message: '<p></p>' }, 'fallback').message).toBe('fallback');
		});

		it('surfaces the sentence through extractErrorMessage', () => {
			expect(extractErrorMessage(fatalBody, 'fallback')).toBe(fatalSentence);
		});

		it('reads an object `error` on a non-WP body, which the string case never matched', () => {
			expect(
				extractErrorMessage({ error: { type: 1, message: 'Out of memory' } }, 'fallback')
			).toBe('Out of memory');
		});

		it('leaves a 4xx body’s own `data.error` object alone — the top-level message was written for the cashier', () => {
			const parsed = parseWpError(
				{
					code: 'rest_invalid_param',
					message: 'Invalid parameter(s): billing',
					data: { status: 400, error: { message: 'gateway: card_declined', file: 'x.php' } },
				},
				'fallback'
			);

			expect(parsed.message).toBe('Invalid parameter(s): billing');
		});

		it('keeps the location within the ledger’s 200-character cap: first line only, budgeted, host path dropped', () => {
			const detail = readWpFatalDetail({
				error: {
					message: `Uncaught Exception: ${'x'.repeat(300)}\nStack trace:\n#0 boom()`,
					file: '/home/u1/domains/shop.example/public_html/wp-content/plugins/acme/includes/class-acme-sync.php',
					line: 412,
				},
			});

			expect(detail).toMatch(
				/^Uncaught Exception: x+… in wp-content\/plugins\/acme\/includes\/class-acme-sync\.php:412$/
			);
			expect(detail!.length).toBeLessThanOrEqual(200);
			expect(detail).not.toContain('Stack trace');
			expect(
				readWpFatalDetail({ error: { message: 'Boom', file: '/opt/app/boot.php', line: 3 } })
			).toBe('Boom in boot.php:3');
		});

		it('reads the detail without a file as the bare message, and ignores an empty one', () => {
			expect(readWpFatalDetail({ error: { message: 'Out of memory' } })).toBe('Out of memory');
			expect(
				readWpFatalDetail({ error: { message: '   ', file: 'x.php', line: 1 } })
			).toBeUndefined();
			expect(readWpFatalDetail({ error: 'a string, as some plugins send' })).toBeUndefined();
			expect(readWpFatalDetail(null)).toBeUndefined();
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

	describe('server-fault mapping', () => {
		it('maps a 5xx to the store-server code, not a client code', () => {
			// Regression: a store 500 previously mapped to CLIENT999 "WCPOS encountered
			// an unexpected error", blaming the POS for the site's own fault.
			const parsed = parseWpError(
				{ message: 'Internal Server Error', data: { status: 500 } },
				'fallback'
			);

			expect(parsed.code).toBe('SYNC131');
			expect(parsed.code).not.toBe('CLIENT999');
		});

		it('keeps 503 on the store-server code too', () => {
			expect(parseWpError({ message: 'nope', data: { status: 503 } }, 'fallback').code).toBe(
				'SYNC131'
			);
		});
	});
});
