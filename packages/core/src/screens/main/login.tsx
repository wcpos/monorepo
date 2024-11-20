import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';

import {
	Modal,
	ModalContent,
	ModalTitle,
	ModalHeader,
	ModalBody,
} from '@wcpos/components/src/modal';
import { WebView } from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

/**
 *
 */
export const Login = () => {
	const { site, wpCredentials } = useAppState();
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (payload) => {
			const uuid = get(payload, 'uuid');
			const jwt = get(payload, 'jwt');

			try {
				if (wpCredentials.uuid === uuid) {
					await wpCredentials.incrementalPatch({
						jwt,
					});
				}
			} catch (err) {
				log.error(err);
			} finally {
				navigation.goBack();
			}
		},
		[navigation, wpCredentials]
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
