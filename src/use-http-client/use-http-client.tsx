import * as React from 'react';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import set from 'lodash/set';
import defaults from 'lodash/defaults';
import http from './http';
import useHttpErrorHandler from './use-http-error-handler';
import useOnlineStatus from '../use-online-status';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * NOTE: this hook makes axios.create unnecessary
 * - axios.create is synchronous for web, but async for electron
 * - axios.create creates more pain than it's worth
 *
 * @TODO - how best to cancel requests
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

	/**
	 *
	 */
	const httpWrapper = React.useMemo(() => {
		let _defaultConfig = {};

		/**
		 * @TODO - merge config with default?
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
			 *
			 */
			const response = await http.request(_config).catch((error) => {
				errorResponseHandler(error.response);
			});

			if (!response) {
				console.log('no response at all');
				throw Error('Network Error');
			}

			/**
			 * A response should only return is status is ok
			 */
			return response;
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
			post(url: string, data: any, config: AxiosRequestConfig = {}) {
				/**
				 * @TODO - 'Content-Type': 'multipart/form-data'
				 */
				return request({
					...config,
					method: 'POST',
					url,
					data,
				});
			},

			put(url: string, data: any, config: AxiosRequestConfig = {}) {
				/**
				 * @TODO - 'Content-Type': 'multipart/form-data'
				 */
				return request({
					...config,
					method: 'PUT',
					url,
					data,
				});
			},

			/**
			 *
			 */
			patch(url: string, data: any, config: AxiosRequestConfig = {}) {
				/**
				 * @TODO - 'Content-Type': 'multipart/form-data'
				 */
				return request({
					...config,
					method: 'PATCH',
					url,
					data,
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
