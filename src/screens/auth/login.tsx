import * as React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import { useNavigation } from '@react-navigation/native';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../contexts/local-data';
import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';
import { t } from '../../lib/translations';

const Login = ({ route }) => {
	const { siteID } = route.params;
	const navigation = useNavigation();
	const usernameRef = React.useRef<RNTextInput>(null);
	const passwordRef = React.useRef<RNTextInput>(null);
	const { userDB } = useLocalData();
	const http = useHttpClient();
	useModalRefreshFix();

	const handleLogin = React.useCallback(async () => {
		try {
			const site = await userDB.sites.findOne(siteID).exec();
			const { data } = await http.get(`${site?.wc_api_auth_url}/authorize`, {
				auth: {
					username: usernameRef.current?.value,
					password: passwordRef.current?.value,
				},
			});
			const parsedData = userDB.wp_credentials.parseRestResponse(data);
			site.update({ $push: { wp_credentials: parsedData } });
		} catch (err) {
			log.error(err);
		}

		navigation.goBack();
	}, [http, navigation, siteID, userDB.sites, userDB.wp_credentials]);

	return (
		<Modal
			opened
			onClose={() => navigation.goBack()}
			title={t('Login', { _tags: 'core' })}
			primaryAction={{ label: t('Login', { _tags: 'core' }), action: handleLogin }}
			secondaryActions={[
				{ label: t('Cancel', { _tags: 'core' }), action: () => navigation.goBack() },
			]}
		>
			<Box space="medium">
				<TextInputWithLabel
					ref={usernameRef}
					label={t('Username', { _tags: 'core' })}
					// placeholder="username"
					type="username"
				/>
				<TextInputWithLabel
					ref={passwordRef}
					label={t('Password', { _tags: 'core' })}
					// placeholder="password"
					type="password"
				/>
			</Box>
		</Modal>
	);
};

export default Login;
