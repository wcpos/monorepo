import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import merge from 'lodash/merge';
import set from 'lodash/set';
import { useObservableState } from 'observable-hooks';

import useHttpClient, { RequestConfig } from '@wcpos/hooks/src/use-http-client';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import useLocalData from '../../../../contexts/local-data';

/**
 *
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useLocalData();
	const baseURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const jwt = useObservableState(wpCredentials.jwt$, wpCredentials.jwt);
	const { isInternetReachable } = useOnlineStatus();
	const [isAuth, setIsAuth] = React.useState(true); // asume true until proven otherwise
	const navigation = useNavigation();

	/**
	 *
	 */
	React.useEffect(() => {
		setIsAuth(true);
	}, [jwt]);

	/**
	 * Intercept errors and check for 401
	 */
	const errorHandler = React.useCallback(
		(error) => {
			if (error.response && error.response.status === 401) {
				setIsAuth(false);
				navigation.navigate('Login');
				return null; // prevent snackbars from showing
			}
			return error;
		},
		[navigation]
	);

	/**
	 *
	 */
	const httpClient = useHttpClient({
		errorHandler,
	});

	/**
	 * AbortController doesn't work on electron
	 */
	const http = React.useMemo(() => {
		const request = async (config = {}) => {
			const _config = merge(
				{},
				{
					baseURL,
					headers: {
						Authorization: `Bearer ${jwt}`,
					},
				},
				config
			);

			return httpClient.request(_config);
		};

		return {
			get(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'GET', url });
			},
			post(url: string, data: any, config: RequestConfig = {}) {
				return request({ ...config, method: 'POST', url, data });
			},
			put(url: string, data: any, config: RequestConfig = {}) {
				return request({ ...config, method: 'PUT', url, data });
			},
			patch(url: string, data: any, config: RequestConfig = {}) {
				return request({ ...config, method: 'PATCH', url, data });
			},
			delete(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'DELETE', url });
			},
			head(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},
		};
	}, [baseURL, httpClient, jwt]);

	/**
	 *
	 */
	return http;
};
