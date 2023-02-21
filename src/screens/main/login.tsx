import * as React from 'react';
import type { TextInput as RNTextInput } from 'react-native';

import { useNavigation } from '@react-navigation/native';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../contexts/local-data';
import { t } from '../../lib/translations';

const Login = () => {
	const { site, wpCredentials } = useLocalData();
	const usernameRef = React.useRef<RNTextInput>(null);
	const passwordRef = React.useRef<RNTextInput>(null);
	const { onPrimaryAction } = useModal();
	const http = useHttpClient();
	const navigation = useNavigation();

	/**
	 * TODO: It might be better to do a JWT refresh instead of login?
	 */
	onPrimaryAction(async () => {
		try {
			const { data } = await http.get(`${site?.wc_api_auth_url}/authorize`, {
				auth: {
					username: usernameRef.current?.value,
					password: passwordRef.current?.value,
				},
			});
			wpCredentials.patch(data);
		} catch (err) {
			log.error(err);
		}

		navigation.goBack();
	});

	return (
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
	);
};

export default Login;
