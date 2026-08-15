import * as React from 'react';

import { isCancel } from 'axios';
import get from 'lodash/get';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { extractErrorMessage, extractWpErrorCode } from './parse-wp-error';

const httpLogger = getLogger(['wcpos', 'http', 'error']);

type AxiosResponse = import('axios').AxiosResponse;

/**
 *
 */
const useHttpErrorHandler = () => {
	/**
	 * Handle HTTP error responses and show appropriate messages to users
	 *
	 * WordPress/WooCommerce returns errors in this format:
	 * {
	 *   "code": "woocommerce_rest_cannot_view",
	 *   "message": "Sorry, you cannot view this resource.",
	 *   "data": { "status": 401 }
	 * }
	 *
	 * We prioritize showing the server's message to users when available.
	 */
	const errorResponseHandler = React.useCallback((res: AxiosResponse) => {
		if (!res) {
			return;
		}

		const endpoint = res.config?.url || 'unknown';
		const wpErrorCode = extractWpErrorCode(res.data);

		switch (res.status) {
			case 0:
				// SSL certificate error or invalid domain
				httpLogger.error(extractErrorMessage(res.data, 'SSL certificate error'), {
					showToast: true,
					code: ERROR_CODES.TLS_UNTRUSTED,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 400:
				httpLogger.error(extractErrorMessage(res.data, 'Bad request'), {
					showToast: true,
					code: ERROR_CODES.RECORD_INVALID_FIELD,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 401:
				httpLogger.error(extractErrorMessage(res.data, 'Authentication failed'), {
					showToast: true,
					code: ERROR_CODES.SESSION_EXPIRED,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 403:
				httpLogger.error(extractErrorMessage(res.data, 'Access forbidden'), {
					showToast: true,
					code: ERROR_CODES.INSUFFICIENT_ROLE,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 404:
				httpLogger.error(extractErrorMessage(res.data, 'Resource not found'), {
					showToast: true,
					code: ERROR_CODES.REST_ROUTE_MISSING,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 500:
				httpLogger.error(extractErrorMessage(res.data, 'Internal server error'), {
					showToast: true,
					code: ERROR_CODES.STORE_SERVER_ERROR,
					context: {
						endpoint,
						wpErrorCode,
					},
				});
				break;
			case 502:
			case 503:
			case 504:
				httpLogger.error(extractErrorMessage(res.data, `Server unavailable (${res.status})`), {
					showToast: true,
					code: ERROR_CODES.STORE_SERVER_ERROR,
					context: {
						endpoint,
						status: res.status,
						wpErrorCode,
					},
				});
				break;
			default:
				httpLogger.error(extractErrorMessage(res.data, `Unexpected response (${res.status})`), {
					showToast: true,
					code: ERROR_CODES.STORE_SERVER_ERROR,
					context: {
						endpoint,
						status: res.status,
						wpErrorCode,
					},
				});
		}
	}, []);

	/**
	 *
	 */
	const errorHandler = React.useCallback(
		(error: unknown) => {
			const response = get(error, 'response');
			const request = get(error, 'request');
			const config = get(error, 'config') as any;
			const endpoint = config?.url || 'unknown';

			if (response) {
				// client received an error response (5xx, 4xx)
				errorResponseHandler(response);
			} else if (request) {
				// client never received a response, or request never left
				httpLogger.error(`Server unavailable: ${endpoint}`, {
					showToast: true,
					code: ERROR_CODES.SYNC_UNREACHABLE,
					context: { endpoint },
				});
			} else if (isCancel(error)) {
				// handle cancel - no logging needed for cancelled requests
				return;
			} else {
				// anything else - network error, DNS failure, etc.
				const errorMessage = error instanceof Error ? error.message : String(error);
				httpLogger.error(`Network error: ${errorMessage}`, {
					showToast: true,
					code: ERROR_CODES.SYNC_UNREACHABLE,
					context: { endpoint },
				});
			}
		},
		[errorResponseHandler]
	);

	return errorHandler;
};

export { useHttpErrorHandler };
