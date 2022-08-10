import * as React from 'react';
import axios from 'axios';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import useAuth from '../use-auth';
import { useErrorResponseHandler } from './use-error-handler';
import useOnlineStatus from '../use-online-status';

export const useRestHttpClient = () => {
	const { site, wpCredentials } = useAuth();
	const errorResponseHandler = useErrorResponseHandler();
	const controller = React.useMemo(() => new AbortController(), []);
	const { isInternetReachable } = useOnlineStatus();

	/**
	 * memoize the axios instance
	 */
	const client = React.useMemo(
		() =>
			axios.create({
				baseURL: site?.wc_api_url,
				signal: controller.signal,
			}),
		[controller.signal, site?.wc_api_url]
	);

	/**
	 * Abort the current request on unmount
	 */
	React.useEffect(() => {
		return () => {
			controller.abort();
		};
	}, [controller]);

	/**
	 * register and unregister interceptors
	 */
	React.useEffect(() => {
		const reqId = client.interceptors.request.use((config) => {
			config.headers = config.headers || {};
			config.headers['X-WCPOS'] = '1';
			if (wpCredentials?.wp_nonce) {
				config.headers['X-WP-Nonce'] = wpCredentials?.wp_nonce;
			}
			if (wpCredentials?.jwt) {
				config.headers.Authorization = `Bearer ${wpCredentials?.jwt}`;
			}

			if (isInternetReachable === false) {
				// prevent requests when there is no internet connection
				return false;
			}

			return config;
		});

		const resId = client.interceptors.response.use(
			(res) => res,
			(err) => {
				console.error(err);
				errorResponseHandler(err.response);
				return Promise.reject(err);
			}
		);

		return () => {
			client.interceptors.request.eject(reqId);
			client.interceptors.response.eject(resId);
		};
	}, [
		client,
		errorResponseHandler,
		isInternetReachable,
		wpCredentials?.jwt,
		wpCredentials?.wp_nonce,
	]);

	useWhyDidYouUpdate('HTTP Client', [
		client,
		site,
		wpCredentials,
		errorResponseHandler,
		controller,
	]);

	return client;
};
