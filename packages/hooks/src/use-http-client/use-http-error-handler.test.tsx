import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useHttpErrorHandler } from './use-http-error-handler';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		success: jest.fn(),
	})),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		SSL_CERTIFICATE_ERROR: 'SSL_CERTIFICATE_ERROR',
		INVALID_REQUEST_FORMAT: 'INVALID_REQUEST_FORMAT',
		INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
		INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
		PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
		CONNECTION_REFUSED: 'CONNECTION_REFUSED',
		CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
		UNEXPECTED_RESPONSE_CODE: 'UNEXPECTED_RESPONSE_CODE',
		NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
		REQUEST_QUEUE_FULL: 'REQUEST_QUEUE_FULL',
	},
}));

jest.mock('./parse-wp-error', () => ({
	extractErrorMessage: jest.fn((_data: any, fallback: string) => fallback),
	extractWpErrorCode: jest.fn(() => undefined),
}));

jest.mock('axios', () => ({
	isCancel: jest.fn(() => false),
}));

// Get the mock logger instance that was created when the module loaded
const mockLogger = (getLogger as jest.Mock).mock.results[0].value;
const mockError = mockLogger.error as jest.Mock;

describe('useHttpErrorHandler', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	function getHandler() {
		const { result } = renderHook(() => useHttpErrorHandler());
		return result.current;
	}

	it('should return a function', () => {
		const handler = getHandler();
		expect(typeof handler).toBe('function');
	});

	describe('errorResponseHandler (response errors)', () => {
		// helper to build an error with response
		function makeResponseError(status: number, url = '/test') {
			return {
				response: { status, data: {}, config: { url } },
				config: { url },
			};
		}

		it('should handle status 0 (SSL error)', () => {
			const handler = getHandler();
			handler(makeResponseError(0));
			expect(mockError).toHaveBeenCalledWith(
				'SSL certificate error',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'SSL_CERTIFICATE_ERROR' }),
				})
			);
		});

		it('should handle status 400', () => {
			const handler = getHandler();
			handler(makeResponseError(400));
			expect(mockError).toHaveBeenCalledWith(
				'Bad request',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'INVALID_REQUEST_FORMAT' }),
				})
			);
		});

		it('should handle status 401', () => {
			const handler = getHandler();
			handler(makeResponseError(401));
			expect(mockError).toHaveBeenCalledWith(
				'Authentication failed',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'INVALID_CREDENTIALS' }),
				})
			);
		});

		it('should handle status 403', () => {
			const handler = getHandler();
			handler(makeResponseError(403));
			expect(mockError).toHaveBeenCalledWith(
				'Access forbidden',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'INSUFFICIENT_PERMISSIONS' }),
				})
			);
		});

		it('should handle status 404', () => {
			const handler = getHandler();
			handler(makeResponseError(404));
			expect(mockError).toHaveBeenCalledWith(
				'Resource not found',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'PLUGIN_NOT_FOUND' }),
				})
			);
		});

		it('should handle status 500', () => {
			const handler = getHandler();
			handler(makeResponseError(500));
			expect(mockError).toHaveBeenCalledWith(
				'Internal server error',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({ errorCode: 'CONNECTION_REFUSED' }),
				})
			);
		});

		it.each([502, 503, 504])('should handle status %i (server unavailable)', (status) => {
			const handler = getHandler();
			handler(makeResponseError(status));
			expect(mockError).toHaveBeenCalledWith(
				`Server unavailable (${status})`,
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({
						errorCode: 'CONNECTION_TIMEOUT',
						status,
					}),
				})
			);
		});

		it('should handle unknown status codes via default case', () => {
			const handler = getHandler();
			handler(makeResponseError(418));
			expect(mockError).toHaveBeenCalledWith(
				'Unexpected response (418)',
				expect.objectContaining({
					showToast: true,
					context: expect.objectContaining({
						errorCode: 'UNEXPECTED_RESPONSE_CODE',
						status: 418,
					}),
				})
			);
		});

		it('should pass endpoint and wpErrorCode in context', () => {
			const handler = getHandler();
			handler(makeResponseError(400, '/wp-json/wc/v3/products'));
			expect(mockError).toHaveBeenCalledWith(
				'Bad request',
				expect.objectContaining({
					context: expect.objectContaining({
						endpoint: '/wp-json/wc/v3/products',
						wpErrorCode: undefined,
					}),
				})
			);
		});

		it('should use "unknown" when response config has no url', () => {
			const handler = getHandler();
			handler({
				response: { status: 400, data: {}, config: {} },
				config: {},
			});
			expect(mockError).toHaveBeenCalledWith(
				'Bad request',
				expect.objectContaining({
					context: expect.objectContaining({
						endpoint: 'unknown',
					}),
				})
			);
		});
	});

	it('should handle null response (guard clause)', () => {
		const handler = getHandler();
		// error.response is null/falsy, so errorResponseHandler is NOT called.
		// No request property, isCancel returns false, so falls through to generic error.
		handler({ response: null, config: { url: '/test' } });
		expect(mockError).toHaveBeenCalledWith(
			expect.stringContaining('Network error'),
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ errorCode: 'NETWORK_UNREACHABLE' }),
			})
		);
	});

	it('should handle request-only errors (no response received)', () => {
		const handler = getHandler();
		handler({ request: {}, config: { url: '/test-endpoint' } });
		expect(mockError).toHaveBeenCalledWith(
			'Server unavailable: /test-endpoint',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ errorCode: 'CONNECTION_REFUSED' }),
			})
		);
	});

	it('should silently handle cancelled requests', () => {
		const { isCancel } = require('axios');
		(isCancel as jest.Mock).mockReturnValueOnce(true);

		const handler = getHandler();
		handler({ message: 'cancelled' });
		expect(mockError).not.toHaveBeenCalled();
	});

	it('should handle generic Error objects', () => {
		const handler = getHandler();
		handler(new Error('DNS lookup failed'));
		expect(mockError).toHaveBeenCalledWith(
			'Network error: DNS lookup failed',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ errorCode: 'NETWORK_UNREACHABLE' }),
			})
		);
	});

	it('should handle non-Error objects', () => {
		const handler = getHandler();
		handler('some string error');
		expect(mockError).toHaveBeenCalledWith(
			'Network error: some string error',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ errorCode: 'NETWORK_UNREACHABLE' }),
			})
		);
	});

	it('should use "unknown" as endpoint when config is missing', () => {
		const handler = getHandler();
		handler(new Error('Something failed'));
		expect(mockError).toHaveBeenCalledWith(
			'Network error: Something failed',
			expect.objectContaining({
				context: expect.objectContaining({
					endpoint: 'unknown',
				}),
			})
		);
	});
});
