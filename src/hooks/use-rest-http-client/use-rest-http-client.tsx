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
		// @TODO - move this to useEffect below?
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

		return instance;
	}, [controller.signal, site?.wc_api_url, wpCredentials?.jwt, wpCredentials?.wp_nonce]);

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
