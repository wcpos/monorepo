import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import useAppState from '../use-app-state';

interface LoginFormProps {
	onClose: () => void;
}

const LoginForm = ({ onClose }: LoginFormProps) => {
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site, wpCredentials } = useAppState();

	const handleLogin = async () => {
		if (site && site.wpApiUrl) {
			const result = await http.post(`${site.wpApiUrl}wcpos/v1/jwt/authorize`, {
				username,
				password,
			});
			// set wp credientials
			// @ts-ignore
			const success = await wpCredentials?.atomicPatch(result.data);
			if (success) {
				onClose();
			}
		}
	};

	return (
		<Dialog
			title="Login"
			open
			onClose={onClose}
			primaryAction={{ label: 'Login', action: handleLogin }}
		>
			<Dialog.Section>
				<TextInput
					label="Username"
					placeholder="username"
					value={username}
					onChange={setUsername}
				/>
				<TextInput
					label="Password"
					placeholder="password"
					value={password}
					onChange={setPassword}
				/>
			</Dialog.Section>
		</Dialog>
	);
};

export default LoginForm;
