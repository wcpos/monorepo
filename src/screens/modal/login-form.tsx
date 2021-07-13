import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

interface LoginFormProps {
	onClose: () => void;
	site?: import('@wcpos/common/src/database').SiteDocument;
}

const LoginForm = ({ onClose, site }: LoginFormProps) => {
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site: currentSite } = useAppState();

	const handleLogin = async () => {
		const _site = site || currentSite;
		if (_site && _site.wpApiUrl) {
			const result = await http.post(`${_site.wpApiUrl}wcpos/v1/jwt/authorize`, {
				username,
				password,
			});
			// add or update wpUser
			const success = await _site.addOrUpdateWpCredentials(result.data);
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
