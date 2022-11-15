import * as React from 'react';

import set from 'lodash/set';

import useHttpClient from '@wcpos/hooks/src/use-http-client';

import useAuth from '../../contexts/auth';

/**
 *
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useAuth();
	const httpClient = useHttpClient();

	/**
	 *
	 */
	const http = React.useMemo(() => {
		const config = {
			baseURL: site?.wc_api_url,
		};

		if (wpCredentials?.wp_nonce) {
			set(config, ['headers', 'X-WP-Nonce'], wpCredentials?.wp_nonce);
		}

		if (wpCredentials?.jwt) {
			set(config, ['headers', 'Authorization'], `Bearer ${wpCredentials?.jwt}`);
		}

		const instance = httpClient.create(config);

		return instance;
	}, [httpClient, site?.wc_api_url, wpCredentials?.jwt, wpCredentials?.wp_nonce]);

	/**
	 *
	 */
	return http;
};
