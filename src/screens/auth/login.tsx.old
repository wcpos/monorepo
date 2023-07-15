import * as React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';

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
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { userDB } = useLocalData();
	const http = useHttpClient();
	useModalRefreshFix();

	/**
	 *
	 */
	const handleLogin = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => ({ ...prev, loading: true }));
			const site = await userDB.sites.findOne(siteID).exec();
			const { data } = await http.get(`${site?.wc_api_auth_url}/authorize`, {
				auth: {
					username,
					password,
				},
			});
			const parsedData = userDB.wp_credentials.parseRestResponse(data);
			await site.update({ $push: { wp_credentials: parsedData } });
			navigation.goBack();
		} catch (err) {
			log.error(err);
		} finally {
			setPrimaryAction((prev) => ({ ...prev, loading: false }));
		}
	}, [http, navigation, password, siteID, userDB.sites, userDB.wp_credentials, username]);

	/**
	 *
	 */
	const [primaryAction, setPrimaryAction] = React.useState({
		label: t('Login', { _tags: 'core' }),
		disabled: true,
	});

	/**
	 *
	 */
	React.useEffect(() => {
		if (!isEmpty(username) && !isEmpty(password)) {
			setPrimaryAction((prev) => ({ ...prev, action: handleLogin, disabled: false }));
		} else {
			setPrimaryAction((prev) => ({ ...prev, disabled: true }));
		}
	}, [username, password, handleLogin]);

	/**
	 *
	 */
	return (
		<Modal
			opened
			onClose={() => navigation.goBack()}
			title={t('Login', { _tags: 'core' })}
			primaryAction={primaryAction}
			secondaryActions={[
				{ label: t('Cancel', { _tags: 'core' }), action: () => navigation.goBack() },
			]}
		>
			<Box space="medium">
				<TextInputWithLabel
					value={username}
					label={t('Username', { _tags: 'core' })}
					// placeholder="username"
					onChangeText={setUsername}
					type="username"
				/>
				<TextInputWithLabel
					value={password}
					label={t('Password', { _tags: 'core' })}
					// placeholder="password"
					onChangeText={setPassword}
					type="password"
				/>
			</Box>
		</Modal>
	);
};

export default Login;
