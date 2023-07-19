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

interface HttpClientOptions {
	errorHandler?: (error: unknown) => unknown;
}

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * TODO - how best to cancel requests
 */
export const useHttpClient = (options?: HttpClientOptions) => {
	const defaultErrorHandler = useHttpErrorHandler();
	const { isInternetReachable } = useOnlineStatus();

	const httpWrapper = React.useMemo(() => {
		const instanceConfig = {}; // Set default config here

		const request = async (config: AxiosRequestConfig = {}) => {
			const _config = merge({}, instanceConfig, config);

			if (_config.method?.toLowerCase() !== 'head') {
				set(_config, ['headers', 'X-WCPOS'], 1);
			}

			if (_config.method?.toLowerCase() === 'head') {
				set(_config, 'decompress', false);
				set(_config, ['params', '_method'], 'HEAD');
			}

			if (process.env.NODE_ENV === 'development') {
				set(_config, ['params', 'XDEBUG_SESSION'], 'start');
			}

			try {
				const response = await http.request(_config);
				return response;
			} catch (error) {
				log.error(error);
				/**
				 * Run custom error handler first, then passthrough to default
				 * This allows us to override the default error handler, eg: detecting 401 and showing login modal
				 */
				let err = error;
				if (typeof options?.errorHandler === 'function') {
					err = options.errorHandler(err);
				}
				if (err) {
					defaultErrorHandler(err);
				}
			}
		};

		return {
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
		};
	}, [defaultErrorHandler, options]);

	return httpWrapper;
};
