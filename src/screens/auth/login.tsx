import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';

import {
	Modal,
	ModalContent,
	ModalHeader,
	ModalTitle,
	ModalBody,
} from '@wcpos/components/src/modal';
import { WebView } from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

/**
 *
 */
const Login = ({ route }) => {
	const { siteID } = route.params;
	const { user, userDB } = useAppState();
	const sites = useObservableSuspense(user.populateResource('sites'));
	const navigation = useNavigation();
	const site = sites.find((s) => s.uuid === siteID);
	const t = useT();

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
					await wpCredentials.incrementalPatch({ jwt });
					// check if site has this wp_credentials
					const siteHasWPCredentials = site.wp_credentials.find((id) => id === uuid);
					if (!siteHasWPCredentials) {
						await site
							.getLatest()
							.incrementalPatch({ wp_credentials: [...site.wp_credentials, uuid] });
					}
				} else {
					await userDB.wp_credentials.insert(payload);
					await site
						.getLatest()
						.incrementalPatch({ wp_credentials: [...site.wp_credentials, uuid] });
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

	return (
		<Modal>
			<ModalContent>
				<ModalHeader>
					<ModalTitle>{t('Login', { _tags: 'core' })}</ModalTitle>
				</ModalHeader>
				<ModalBody>
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
				</ModalBody>
			</ModalContent>
		</Modal>
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
