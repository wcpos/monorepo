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
		}

		if (jwt) {
			set(config, ['headers', 'Authorization'], `Bearer ${jwt}`);
		}

		const instance = httpClient.create(config);

		return instance;
	}, [baseURL, httpClient, jwt, wp_nonce]);

	/**
	 *
	 */
	return http;
};
