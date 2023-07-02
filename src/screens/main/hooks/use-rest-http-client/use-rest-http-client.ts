import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import set from 'lodash/set';
import { useObservableState } from 'observable-hooks';

import useHttpClient from '@wcpos/hooks/src/use-http-client';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import useLocalData from '../../../../contexts/local-data';

/**
 *
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useLocalData();
	const httpClient = useHttpClient();
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
	 *
	 */
	const responseModifier = React.useCallback((response) => {
		console.log(response);
		return response;
	}, []);

	/**
	 *
	 */
	const errorModifier = React.useCallback(
		(error) => {
			if (error.response && error.response.status === 401) {
				setIsAuth(false);
				navigation.navigate('Login');
			}
			return Promise.reject(error);
		},
		[navigation]
	);

	/**
	 *
	 */
	const http = React.useMemo(() => {
		const controller = new AbortController();

		const config = {
			baseURL,
			signal: controller.signal,
		};

		if (isInternetReachable === false || !isAuth) {
			controller.abort();
		}

		if (jwt) {
			set(config, ['headers', 'Authorization'], `Bearer ${jwt}`);
		}

		const instance = httpClient.create(config);

		// add interceptors
		instance.axios.interceptors.response.use(responseModifier, errorModifier);

		return instance;
	}, [baseURL, errorModifier, httpClient, isAuth, isInternetReachable, jwt, responseModifier]);

	/**
	 *
	 */
	return http;
};
