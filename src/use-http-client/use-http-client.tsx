import * as React from 'react';
import axios from 'axios';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import set from 'lodash/set';
import { useErrorResponseHandler } from './use-error-handler';
import useOnlineStatus from '../use-online-status';

export const useHttpClient = () => {
	const errorResponseHandler = useErrorResponseHandler();
	const controller = React.useMemo(() => new AbortController(), []);
	const { isInternetReachable } = useOnlineStatus();

	/**
	 * memoize the axios instance
	 */
	const client = React.useMemo(
		() =>
			axios.create({
				signal: controller.signal,
			}),
		[controller.signal]
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
			if (isInternetReachable === false) {
				// prevent requests when there is no internet connection
				return false;
			}

			if (config.method !== 'head') {
				set(config, ['headers', 'X-WCPOS'], '1');
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
	}, [client, controller, errorResponseHandler, isInternetReachable]);

	useWhyDidYouUpdate('HTTP Client', [client, errorResponseHandler, controller]);

	return client;
};
