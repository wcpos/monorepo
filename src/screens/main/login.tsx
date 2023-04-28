import * as React from 'react';
import type { TextInput as RNTextInput } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../contexts/local-data';
import { t } from '../../lib/translations';

/**
 * TODO: It might be better to do a JWT refresh instead of login?
 */
const Login = () => {
	const { site, wpCredentials } = useLocalData();
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { setPrimaryAction } = useModal();
	const http = useHttpClient();
	const navigation = useNavigation();

	/**
	 *
	 */
	const handleLogin = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => ({
				...prev,
				loading: true,
			}));
			const { data } = await http.get(`${site?.wc_api_auth_url}/authorize`, {
				auth: {
					username,
					password,
				},
			});
			await wpCredentials.patch(data);
			navigation.goBack();
		} catch (err) {
			log.error(err);
		} finally {
			setPrimaryAction((prev) => ({
				...prev,
				loading: false,
			}));
		}
	}, [
		setPrimaryAction,
		http,
		site?.wc_api_auth_url,
		username,
		password,
		wpCredentials,
		navigation,
	]);

	/**
	 *
	 */
	React.useEffect(() => {
		setPrimaryAction((prev) => ({
			...prev,
			action: handleLogin,
			disabled: isEmpty(username) || isEmpty(password),
		}));
	}, [handleLogin, password, setPrimaryAction, username]);

	/**
	 *
	 */
	return (
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
	);
};

export default Login;
