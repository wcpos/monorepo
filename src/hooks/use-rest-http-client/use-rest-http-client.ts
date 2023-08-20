import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import merge from 'lodash/merge';
import set from 'lodash/set';
import { useObservableState } from 'observable-hooks';

import useHttpClient, { RequestConfig } from '@wcpos/hooks/src/use-http-client';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import { useAppState } from '../../contexts/app-state';

/**
 * TODO - becareful to use useOnlineStatus because it emits a lot of events
 */
export const useRestHttpClient = () => {
	const { site, wpCredentials } = useAppState();
	const baseURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const jwt = useObservableState(wpCredentials.jwt$, wpCredentials.jwt);

	const navigation = useNavigation();

	// React.useEffect(() => {
	// 	console.log('isAuth', isAuth);
	// }, [isAuth]);

	/**
	 * Intercept errors and check for 401
	 */
	const errorHandler = React.useCallback(
		(error) => {
			if (error.response && error.response.status === 401) {
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
	const httpClient = useHttpClient(errorHandler);

	/**
	 *
	 */
	const request = React.useCallback(
		async (reqConfig: RequestConfig = {}) => {
			const shouldUseJwtAsParam = typeof window !== 'undefined' && window.useJwtAsParam === true;
			const defaultConfig = {
				baseURL,
				headers: shouldUseJwtAsParam ? {} : { Authorization: `Bearer ${jwt}` },
			};

			if (shouldUseJwtAsParam) {
				const params = { authorization: `Bearer ${jwt}` };
				defaultConfig.params = merge(params, reqConfig.params);
			}

			const config = merge({}, defaultConfig, reqConfig);

			return httpClient.request(config);
		},
		[baseURL, httpClient, jwt]
	);

	/**
	 *
	 */
	return React.useMemo(
		() => ({
			request,
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
		}),
		[request]
	);
};
