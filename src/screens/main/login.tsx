import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';

import WebView from '@wcpos/components/src/webview';

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
			if (wpCredentials.uuid === uuid) {
				console.log(jwt);
				await wpCredentials.incrementalPatch({
					jwt,
				});
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
