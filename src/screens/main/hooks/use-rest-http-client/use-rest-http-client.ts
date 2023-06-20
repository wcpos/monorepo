import * as React from 'react';

import set from 'lodash/set';
import { useObservableState } from 'observable-hooks';

import useHttpClient from '@wcpos/hooks/src/use-http-client';

import useLocalData from '../../../../contexts/local-data';

/**
 *
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useLocalData();
	const httpClient = useHttpClient();
	const baseURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const jwt = useObservableState(wpCredentials.jwt$, wpCredentials.jwt);
	const wp_nonce = useObservableState(wpCredentials.wp_nonce$, wpCredentials.wp_nonce);

	/**
	 *
	 */
	const http = React.useMemo(() => {
		const config = {
			baseURL,
		};

		if (wp_nonce) {
			set(config, ['headers', 'X-WP-Nonce'], wp_nonce);
		} else if (jwt) {
			set(config, ['headers', 'Authorization'], `Bearer ${jwt}`);
		}

		const instance = httpClient.create(config);

		/**
		 * HACK - this is going to add a new interceptor every time this hook is called
		 * _interceptorAdded is a dodgy way to prevent this from happening
		 */
		if (
			!instance.axios._interceptorAdded &&
			instance.axios &&
			instance.axios.interceptors &&
			instance.axios.interceptors.response
		) {
			instance.axios._interceptorAdded = true;
			instance.axios.interceptors.response.use(
				(response) => {
					// Any status code that lie within the range of 2xx cause this function to trigger
					// compare the respone headers to the wp_nonce and update if needed
					const new_wp_nonce = response.headers['x-wp-nonce'];
					if (new_wp_nonce && new_wp_nonce !== wp_nonce) {
						wpCredentials.incrementalPatch({ wp_nonce: new_wp_nonce });
					}

					return response;
				},
				(error) => {
					// Any status codes that falls outside the range of 2xx cause this function to trigger
					// Do something with response error
					if (error.response && error.response.status === 401) {
					}
					return Promise.reject(error);
				}
			);
		}

		return instance;
	}, [baseURL, httpClient, jwt, wpCredentials, wp_nonce]);

	/**
	 *
	 */
	return http;
};
