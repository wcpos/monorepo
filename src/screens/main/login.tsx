import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';

import { WebView } from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

interface LoginProps {
	loginUrl: string;
	wpCredentials: import('@wcpos/database').WPCredentialsDocument;
}

/**
 *
 */
const Login = ({ loginUrl, wpCredentials }: LoginProps) => {
	const navigation = useNavigation();

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
		<WebView
			src={loginUrl}
			style={{ height: '500px' }}
			onMessage={(event) => {
				const action = get(event, 'data.action');
				const payload = get(event, 'data.payload');
				if (action === 'wcpos-wp-credentials') {
					handleLogin(payload);
				}
			}}
		/>
	);
};

export default Login;
