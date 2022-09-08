import * as React from 'react';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import set from 'lodash/set';
import http from './http';
import useHttpErrorHandler from './use-http-error-handler';
import useOnlineStatus from '../use-online-status';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosInstance = import('axios').AxiosInstance;

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * @TODO - how best to cancel requests
 */
export const useHttpClient = (options: AxiosRequestConfig = {}) => {
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
		// signal: controller.signal,
		const instance = http.create(options) as AxiosInstance;

		/**
		 *
		 */
		const request = async (config: AxiosRequestConfig = {}) => {
			/**
			 * Add X-WCPOS header to every request
			 */
			if (config.method?.toLowerCase() !== 'head') {
				set(config, ['headers', 'X-WCPOS'], 1);
			}

			/**
			 *
			 */
			const response = await instance.request(config).catch((error) => {
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

		return {
			get: (url: string, config: AxiosRequestConfig = {}) => {
				return request({
					...config,
					method: 'GET',
					url,
					data: (config || {}).data,
				});
			},

			post: (url: string, data: any, config: AxiosRequestConfig = {}) => {
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

			put: (url: string, data: any, config: AxiosRequestConfig = {}) => {
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

			patch: (url: string, data: any, config: AxiosRequestConfig = {}) => {
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

			delete: (url: string, config: AxiosRequestConfig = {}) => {
				return request({
					...config,
					method: 'DELETE',
					url,
					data: (config || {}).data,
				});
			},

			head: (url: string, config: AxiosRequestConfig = {}) => {
				return request({
					...config,
					method: 'HEAD',
					url,
					data: (config || {}).data,
				});
			},
		};
	}, [errorResponseHandler, options]);

	/**
	 *
	 */
	return httpWrapper;
};
