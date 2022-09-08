import * as React from 'react';
import set from 'lodash/set';
import useAuth from '../use-auth';
import useHttpClient from '../use-http-client';

/**
 *
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useAuth();

	/**
	 *
	 */
	const instanceConfig = React.useMemo(() => {
		const config = {
			baseURL: site?.wc_api_url,
		};

		if (wpCredentials?.wp_nonce) {
			set(config, ['headers', 'X-WP-Nonce'], wpCredentials?.wp_nonce);
		}

		if (wpCredentials?.jwt) {
			set(config, ['headers', 'Authorization'], `Bearer ${wpCredentials?.jwt}`);
		}

		return config;
	}, [site?.wc_api_url, wpCredentials?.jwt, wpCredentials?.wp_nonce]);

	/**
	 *
	 */
	return useHttpClient(instanceConfig);
};
