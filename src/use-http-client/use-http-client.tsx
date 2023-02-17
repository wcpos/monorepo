import * as React from 'react';

import defaults from 'lodash/defaults';
import set from 'lodash/set';

import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import http from './http';
import useHttpErrorHandler from './use-http-error-handler';
import useOnlineStatus from '../use-online-status';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosError = import('axios').AxiosError;

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * NOTE: this hook makes axios.create unnecessary
 * - axios.create is synchronous for web, but async for electron
 * - axios.create creates more pain than it's worth
 *
 * TODO - how best to cancel requests
 */
export const useHttpClient = () => {
	const errorResponseHandler = useHttpErrorHandler();
	const { isInternetReachable } = useOnlineStatus();
	// const controller = React.useMemo(() => new AbortController(), []);

	/**
	 * Abort the current request on unmount
	 */
	// React.useEffect(() => {
	// 	return () => {
	// 		controller.abort();
	// 	};
	// }, [controller]);
	const retryDelay = 10000; // 10 second

	/**
	 *
	 */
	const httpWrapper = React.useMemo(() => {
		let _defaultConfig = {};
		let retryCount = 0;

		/**
		 * TODO - merge config with default?
		 */
		const request = async (config: AxiosRequestConfig = {}) => {
			const _config = defaults(config, _defaultConfig);

			/**
			 * Add X-WCPOS header to every request
			 */
			if (_config.method?.toLowerCase() !== 'head') {
				set(_config, ['headers', 'X-WCPOS'], 1);
			}

			/**
			 * HTTP HEAD Requests
			 *
			 * 1. Set decompress to false
			 * Fix a bug in windows - see https://github.com/axios/axios/issues/1658
			 * I get an "unexpected end of file" error on HEAD requests because body is empty
			 *
			 * 2. Remove Cookie (probably not needed)
			 *
			 * 3. Set query param http_method to HEAD
			 * Some servers convert HEAD requests to GET requests, eg: WPengine
			 * I don't know why, but it causes problems with CORS settings in the PHP plugin
			 */
			if (_config.method?.toLowerCase() === 'head') {
				set(_config, 'decompress', false);
				// set(_config, ['headers', 'Cookie'], undefined);
				/**
				 * WordPress REST API check for:
				 * HTTP_X_HTTP_METHOD_OVERRIDE (header)
				 * _method (get param)
				 * TODO - check if I should use this instead
				 */
				set(_config, ['params', 'wcpos_http_method'], 'head');
			}

			/**
			 * XDEBUG for development
			 */
			if (process.env.NODE_ENV === 'development') {
				set(_config, ['params', 'XDEBUG_SESSION'], 'start');
			}

			/**
			 *
			 */
			try {
				const response = await http.request(_config);
				retryCount = 0;
				return response;
			} catch (error) {
				log.error(error);
				errorResponseHandler(error as AxiosError);
				retryCount++;
				return new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
			}
		};

		/**
		 * API
		 */
		const api = {
			/**
			 *
			 */
			get(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'GET',
					url,
					data: (config || {}).data,
				});
			},

			/**
			 *
			 */
			post(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'POST',
					url,
					data: (config || {}).data,
				});
			},

			put(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'PUT',
					url,
					data: (config || {}).data,
				});
			},

			/**
			 *
			 */
			patch(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'PATCH',
					url,
					data: (config || {}).data,
				});
			},

			/**
			 *
			 */
			del(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'DELETE',
					url,
					data: (config || {}).data,
				});
			},

			/**
			 *
			 */
			head(url: string, config: AxiosRequestConfig = {}) {
				return request({
					...config,
					method: 'HEAD',
					url,
					data: (config || {}).data,
				});
			},
		};

		/**
		 * Exposed API
		 */
		return {
			create: (config: AxiosRequestConfig = {}) => {
				_defaultConfig = config;
				return api;
			},
			...api,
		};
	}, [errorResponseHandler]);

	/**
	 *
	 */
	return httpWrapper;
};
