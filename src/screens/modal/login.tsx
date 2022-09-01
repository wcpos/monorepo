import * as React from 'react';
import { useNavigation, StackActions } from '@react-navigation/native';
import Modal from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';
import Box from '@wcpos/components/src/box';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import useAuth from '@wcpos/hooks/src/use-auth';
import get from 'lodash/get';

const Login = ({ route }) => {
	const siteID = get(route, ['params', 'siteID']);
	const navigation = useNavigation();
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site: _site, wpCredentials, userDB } = useAuth();
	const http = useHttpClient();

	const handleLogin = async () => {
		let success = false;
		let site = _site;

		if (!site) {
			// get site from siteID
			site = await userDB.sites
				.findOne({ selector: { localID: siteID } })
				.exec()
				.catch((error) => {
					debugger;
				});
		}

		if (!site) {
			debugger;
			return;
		}

		/** @TODO - use generic http with error handling */
		const { data } = await http
			.post(`${site?.wc_api_auth_url}/authorize`, {
				username,
				password,
			})
			.catch((err) => {
				debugger;
			});

		if (wpCredentials) {
			success = await wpCredentials.atomicPatch(data);
		} else {
			success = await site?.addWpCredentials(data);
		}

		if (success) {
			navigation.goBack();
		}
	};

	return (
		<Modal
			alwaysOpen
			title="Login"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
			primaryAction={{ label: 'Login', action: handleLogin }}
			secondaryActions={[{ label: 'Cancel', action: () => navigation.goBack() }]}
		>
			<Box space="medium">
				<TextInput
					label="Username"
					placeholder="username"
					value={username}
					onChange={setUsername}
					type="username"
				/>
				<TextInput
					label="Password"
					placeholder="password"
					value={password}
					onChange={setPassword}
					type="password"
				/>
			</Box>
		</Modal>
	);
};

export default Login;
