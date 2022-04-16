import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Modal from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';
import http from '@wcpos/core/src/lib/http';
import useAppState from '@wcpos/hooks/src/use-app-state';

const Login = () => {
	const navigation = useNavigation();
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site, wpCredentials } = useAppState();

	const handleLogin = async () => {
		let success = false;

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
			onClose={() => navigation.goBack()}
			primaryAction={{ label: 'Login', action: handleLogin }}
		>
			<TextInput label="Username" placeholder="username" value={username} onChange={setUsername} />
			<TextInput label="Password" placeholder="password" value={password} onChange={setPassword} />
		</Modal>
	);
};

export default Login;
