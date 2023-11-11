import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import merge from 'lodash/merge';
import { useObservableState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';
import semver from 'semver';

import useHttpClient, { RequestConfig } from '@wcpos/hooks/src/use-http-client';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import { useAppState } from '../../../contexts/app-state';

const errorSubject = new BehaviorSubject(null);

/**
 * TODO - becareful to use useOnlineStatus because it emits a lot of events
 */
export const useRestHttpClient = (endpoint = '') => {
	const { site, wpCredentials, store, initialProps } = useAppState();
	// const wcAPIURL = useObservableState(site.wc_api_url$, site.wc_api_url);
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
				errorSubject.next(error);
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
			const shouldUseJwtAsParam = get(window, ['initialProps', 'site', 'use_jwt_as_param']);
			const version = get(initialProps, 'version', '');
			// if version is 1.4 or greater, use the new api
			let apiURL = site.wc_api_url;
			if (semver.gt(version, '1.3.13')) {
				apiURL = site.wcpos_api_url;

				// sanity check, make sure we have a wcpos_api_url
				if (!apiURL) {
					apiURL = site.wp_api_url + 'wcpos/v1';
					site.incrementalPatch({ wcpos_api_url: apiURL });
				}
			}
			const defaultConfig = {
				baseURL: apiURL + '/' + endpoint,
				headers: shouldUseJwtAsParam ? {} : { Authorization: `Bearer ${jwt}` },
				params: {},
			};

			if (shouldUseJwtAsParam) {
				const params = { authorization: `Bearer ${jwt}` };
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			if (store.id !== 0) {
				const params = { store_id: store.id };
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			const config = merge({}, defaultConfig, reqConfig);

			return httpClient.request(config);
		},
		[endpoint, httpClient, jwt, store.id, site, initialProps]
	);

	/**
	 *
	 */
	return React.useMemo(
		() => ({
			endpoint,
			request,
			get(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'GET', url });
			},
			post(url: string, data: any, config: RequestConfig = {}) {
				return request({ ...config, method: 'POST', url, data });
			},
			put(url: string, data: any, config: RequestConfig = {}) {
				/**
				 * Some servers don't allow PUT requests, so we can use POST instead
				 * and add a _method=PUT query param and header
				 */
				const newConfig = {
					...config,
					headers: { ...config.headers, 'X-HTTP-Method-Override': 'PUT' },
					params: { ...config.params, _method: 'PUT' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			patch(url: string, data: any, config: RequestConfig = {}) {
				/**
				 * Some servers don't allow PUT requests, so we can use POST instead
				 * and add a _method=PUT query param and header
				 */
				const newConfig = {
					...config,
					headers: { ...config.headers, 'X-HTTP-Method-Override': 'PATCH' },
					params: { ...config.params, _method: 'PATCH' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			delete(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'DELETE', url });
			},
			head(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},

			/**
			 * @TODO - this is just an experiment to see if the httpClient should manage it's own error state
			 */
			error$: errorSubject.asObservable(),
		}),
		[endpoint, request]
	);
};
