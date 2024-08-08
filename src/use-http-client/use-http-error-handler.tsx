import * as React from 'react';

import { isCancel } from 'axios';
import get from 'lodash/get';

import { Toast } from '@wcpos/tailwind/src/toast';
import log from '@wcpos/utils/src/logger';

type AxiosResponse = import('axios').AxiosResponse;
type AxiosError = import('axios').AxiosError;

/**
 *
 */
const useHttpErrorHandler = () => {
	/**
	 *
	 */
	const errorResponseHandler = React.useCallback((res: AxiosResponse) => {
		if (!res) {
			return;
		}

		switch (res.status) {
			case 0:
				/**
				 * This can happen for self-signed certificates, eg: development servers
				 * The solution for web is to go to the site and manually trust the certificate
				 * TODO - what happens on desktop and mobile?
				 *
				 * status = 0
				 */
				Toast.show({
					type: 'error',
					text1: 'Domain is invalid',
					// text2: 'Please check the domain and try again',
				});
				break;
			case 400:
				Toast.show({ type: 'error', text1: res.data.message });
				break;
			case 401:
				if (res.data) {
					/**
					 * TODO - Errors may be better in a global Dialog component, like Snackbar?
					 */
					Toast.show({
						type: 'error',
						text1: `Recieved "${res.data.message}" when trying to access endpoint: ${res.config.url}`,
					});
				}
				break;
			case 403:
				if (res.data) {
					/**
					 * TODO - Errors may be better in a global Dialog component, like Snackbar?
					 */
					Toast.show({
						type: 'error',
						text1: `Recieved "${res.data.message}" when trying to access endpoint: ${res.config.url}`,
					});
				} else {
					Toast.show({
						type: 'error',
						text1: `Recieved "Forbidden" when trying to access endpoint: ${res.config.url}`,
					});
				}
				break;
			case 404:
				if (res.data) {
					Toast.show({
						type: 'error',
						text1: res.data.message,
					});
				}
				log.error('404 error', res);
				break;
			case 500:
				log.error('500 Internal server error', res);
				break;
			default:
				log.error('Unknown error', res);
		}
	}, []);

	/**
	 *
	 */
	const errorHandler = React.useCallback(
		(error: unknown) => {
			const response = get(error, 'response');
			const request = get(error, 'request');

			if (response) {
				// client received an error response (5xx, 4xx)
				errorResponseHandler(response);
			} else if (request) {
				// client never received a response, or request never left
				log.error(request);
				Toast.show({ type: 'error', text1: 'Server is unavailable' });
			} else if (isCancel(error)) {
				// handle cancel
				log.info('Request canceled');
			} else {
				// anything else
				log.error(error);
				Toast.show({ type: 'error', text1: 'Network error' });
			}
		},
		[errorResponseHandler]
	);

	return errorHandler;
};

export default useHttpErrorHandler;
