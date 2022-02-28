import * as React from 'react';
import axios from 'axios';
import useAppState from '../use-app-state';
import { useErrorResponseHandler } from './use-error-handler';

export const useRestHttpClient = () => {
	const { site, wpCredentials } = useAppState();
	const errorResponseHandler = useErrorResponseHandler();
	const controller = React.useMemo(() => new AbortController(), []);

	/**
	 * Abort the current request on unmount
	 */
	React.useEffect(() => {
		return () => {
			controller.abort();
		};
	}, [controller]);

	/**
	 * memoize the axios instance
	 */
	const client = React.useMemo(() => {
		const headers = {
			'X-WCPOS': '1',
		};
		if (wpCredentials?.wp_nonce) {
			Object.assign(headers, { 'X-WP-Nonce': wpCredentials?.wp_nonce });
		}
		if (wpCredentials?.jwt) {
			Object.assign(headers, { Authorization: `Bearer ${wpCredentials?.jwt}` });
		}

		const instance = axios.create({
			baseURL: site?.wc_api_url,
			headers,
			signal: controller.signal,
		});

		// Add a request interceptor
		instance.interceptors.response.use(
			function (config) {
				// Do something before request is sent
				// config.headers.Authorization = `Bearer ${your_token}`;
				// // OR config.headers.common['Authorization'] = `Bearer ${your_token}`;
				// config.baseURL = 'https://example.io/api/';
				return config;
			},
			function (error) {
				errorResponseHandler(error.response);
				return Promise.reject(error);
			}
		);

		return instance;
	}, [
		controller.signal,
		errorResponseHandler,
		site?.wc_api_url,
		wpCredentials?.jwt,
		wpCredentials?.wp_nonce,
	]);

	/**
	 * register and unregister interceptors
	 */
	React.useEffect(() => {
		const reqId = client.interceptors.request.use((config) => {
			// Do something before request is sent
			return config;
		});

		const resId = client.interceptors.response.use(
			(res) => res,
			(err) => {
				errorResponseHandler(err.response);
				return Promise.reject(err);
			}
		);

		return () => {
			client.interceptors.request.eject(reqId);
			client.interceptors.response.eject(resId);
		};
	}, [client, errorResponseHandler]);

	return client;
};
