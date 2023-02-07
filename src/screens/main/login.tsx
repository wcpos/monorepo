import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';

import Backdrop from '@wcpos/components/src/backdrop';
import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import TextInput from '@wcpos/components/src/textinput';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useAuth from '../../contexts/auth';
import { t } from '../../lib/translations';

const Login = () => {
	// const siteID = get(route, ['params', 'siteID']);
	// const navigation = useNavigation();
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	// const { site: _site, wpCredentials, userDB } = useAuth();
	// const http = useHttpClient();

	// const handleLogin = async () => {
	// 	let success = false;
	// 	let site = _site;

	// 	if (!site) {
	// 		// get site from siteID
	// 		site = await userDB.sites
	// 			.findOne({ selector: { localID: siteID } })
	// 			.exec()
	// 			.catch((error) => {
	// 				log.error(error);
	// 			});
	// 	}

	// 	if (!site) {
	// 		log.error('Site not found');
	// 		return;
	// 	}

	// 	/** @TODO - use generic http with error handling */
	// 	const response = await http
	// 		.get(`${site?.wc_api_auth_url}/authorize`, {
	// 			auth: {
	// 				username,
	// 				password,
	// 			},
	// 		})
	// 		.catch((err) => {
	// 			log.error(err);
	// 		});

	// 	if (response) {
	// 		if (wpCredentials) {
	// 			success = await wpCredentials.atomicPatch(response.data);
	// 		} else {
	// 			success = await site?.addWpCredentials(response.data);
	// 		}
	// 	}

	// 	if (success) {
	// 		navigation.goBack();
	// 	}
	// };

	return (
		<Box space="medium">
			<TextInput
				label={t('Username', { _tags: 'core' })}
				placeholder="username"
				value={username}
				onChange={setUsername}
				type="username"
			/>
			<TextInput
				label={t('Password', { _tags: 'core' })}
				placeholder="password"
				value={password}
				onChange={setPassword}
				type="password"
			/>
		</Box>
	);
};

export default Login;
