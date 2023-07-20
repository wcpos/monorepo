import * as React from 'react';

import merge from 'lodash/merge';
import set from 'lodash/set';

import log from '@wcpos/utils/src/logger';

import http from './http';
import useHttpErrorHandler from './use-http-error-handler';
import useOnlineStatus from '../use-online-status';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosError = import('axios').AxiosError;

export type RequestConfig = AxiosRequestConfig;

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * TODO - how best to cancel requests
 * TODO - becareful to use useOnlineStatus because it emits a lot of events
 */
export const useHttpClient = (errorHandler?: (error: unknown) => unknown) => {
	const defaultErrorHandler = useHttpErrorHandler();

	/**
	 *
	 */
	const request = React.useCallback(
		async (reqConfig: AxiosRequestConfig = {}) => {
			const config = { ...reqConfig };

			if (config.method?.toLowerCase() !== 'head') {
				set(config, ['headers', 'X-WCPOS'], 1);
			}

			if (config.method?.toLowerCase() === 'head') {
				set(config, 'decompress', false);
				set(config, ['params', '_method'], 'HEAD');
			}

			if (process.env.NODE_ENV === 'development') {
				set(config, ['params', 'XDEBUG_SESSION'], 'start');
			}

			try {
				const response = await http.request(config);
				return response;
			} catch (error) {
				log.error(error);
				/**
				 * Run custom error handler first, then passthrough to default
				 * This allows us to override the default error handler, eg: detecting 401 and showing login modal
				 */
				let err = error;
				if (typeof errorHandler === 'function') {
					err = errorHandler(err);
				}
				if (err) {
					defaultErrorHandler(err);
				}
			}
		},
		[defaultErrorHandler, errorHandler]
	);

	/**
	 *
	 */
	return React.useMemo(
		() => ({
			request,
			get(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'GET', url });
			},
			post(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'POST', url, data });
			},
			put(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'PUT', url, data });
			},
			patch(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'PATCH', url, data });
			},
			delete(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'DELETE', url });
			},
			head(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},
		}),
		[request]
	);
};
