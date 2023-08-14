import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { from } from 'rxjs';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';
import Suspense from '@wcpos/components/src/suspense';
import WebView from '@wcpos/components/src/webview';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import { useAppStateManager } from '../../contexts/app-state-manager';
import { t } from '../../lib/translations';
import { ModalLayout } from '../components/modal-layout';

/**
 *
 */
const Login = ({ route }) => {
	const { siteID } = route.params;
	const { user, userDB } = useAppStateManager();
	const sites = useObservableSuspense(user.populateResource('sites'));
	const navigation = useNavigation();
	const site = sites.find((s) => s.uuid === siteID);

	if (!site) {
		throw new Error('Site not found');
	}

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (payload) => {
			const uuid = get(payload, 'uuid');
			const jwt = get(payload, 'jwt');

			try {
				const wpCredentials = await userDB.wp_credentials.findOneFix(uuid).exec();

				if (wpCredentials) {
					await wpCredentials.patch({ jwt });
				} else {
					await userDB.wp_credentials.insert(payload);
					await site.patch({ wp_credentials: [uuid] });
				}
			} catch (err) {
				log.error(err);
			} finally {
				// navigate back
				navigation.goBack();
			}
		},
		[navigation, site, userDB.wp_credentials]
	);

	/**
	 *
	 */
	return (
		<ModalLayout title={t('Login', { _tags: 'core' })}>
			<WebView
				src={`${site.home}/wcpos-login`}
				style={{ height: '500px' }}
				onMessage={(event) => {
					const action = get(event, 'data.action');
					const payload = get(event, 'data.payload');
					if (action === 'wcpos-wp-credentials') {
						handleLogin(payload);
					}
				}}
			/>
		</ModalLayout>
	);
};

// const LoginWithProvider = ({ route }) => {
// 	const { siteID } = route.params;
// 	const { userDB } = useLocalData();

// 	const resource = React.useMemo(
// 		() => new ObservableResource(from(userDB.sites.findOneFix(siteID).exec())),
// 		[userDB, siteID]
// 	);

// 	/**
// 	 *
// 	 */
// 	return (
// 		<ModalLayout title={t('Login', { _tags: 'core' })}>
// 			<Suspense>
// 				<Login resource={resource} />
// 			</Suspense>
// 		</ModalLayout>
// 	);
// };

export default Login;
