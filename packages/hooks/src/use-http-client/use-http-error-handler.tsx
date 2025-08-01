import * as React from 'react';

import { isCancel } from 'axios';
import get from 'lodash/get';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

type AxiosResponse = import('axios').AxiosResponse;

/**
 *
 */
const useHttpErrorHandler = () => {
	// Logger is available as 'log'

	/**
	 *
	 */
	const errorResponseHandler = React.useCallback((res: AxiosResponse) => {
		if (!res) {
			return;
		}

		const endpoint = res.config?.url || 'unknown';

		switch (res.status) {
			case 0:
				// SSL certificate error or invalid domain
				log.error(`SSL certificate error: ${endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.SSL_CERTIFICATE_ERROR, endpoint },
				});
				break;
			case 400:
				log.error(`Bad request: ${res.data?.message || endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.INVALID_REQUEST_FORMAT, endpoint },
				});
				break;
			case 401:
				const authMessage = res.data?.message || 'Authentication failed';
				log.error(authMessage, {
					showToast: true,
					context: { errorCode: ERROR_CODES.INVALID_CREDENTIALS, endpoint },
				});
				break;
			case 403:
				const forbiddenMessage = res.data?.message || 'Access forbidden';
				log.error(forbiddenMessage, {
					showToast: true,
					context: { errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS, endpoint },
				});
				break;
			case 404:
				log.error(`Endpoint not found: ${endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.PLUGIN_NOT_FOUND, endpoint },
				});
				break;
			case 500:
				log.error(`Internal server error: ${endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.CONNECTION_REFUSED, endpoint },
				});
				break;
			case 502:
			case 503:
			case 504:
				log.error(`Server unavailable (${res.status}): ${endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.CONNECTION_TIMEOUT, endpoint, status: res.status },
				});
				break;
			default:
				log.error(`Unexpected response (${res.status}): ${endpoint}`, {
					showToast: true,
					context: {
						errorCode: ERROR_CODES.UNEXPECTED_RESPONSE_CODE,
						endpoint,
						status: res.status,
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
				log.error(`Server unavailable: ${endpoint}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.CONNECTION_REFUSED, endpoint },
				});
			} else if (isCancel(error)) {
				// handle cancel - no logging needed for cancelled requests
				return;
			} else {
				// anything else - network error, DNS failure, etc.
				const errorMessage = error instanceof Error ? error.message : String(error);
				log.error(`Network error: ${errorMessage}`, {
					showToast: true,
					context: { errorCode: ERROR_CODES.NETWORK_UNREACHABLE, endpoint },
				});
			}
		},
		[errorResponseHandler]
	);

	return errorHandler;
};

export default useHttpErrorHandler;
