import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import useSite from '@wcpos/common/src/hooks/use-site';
import useWpCredentials from '@wcpos/common/src/hooks/use-wp-credentials';

interface LoginFormProps {
	onClose: () => void;
	// site?: import('@wcpos/common/src/database').SiteDocument;
}

const LoginForm = ({ onClose }: LoginFormProps) => {
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site } = useSite();
	const { wpCredentials } = useWpCredentials();

	const handleLogin = async () => {
		const result = await http.post(`${site.wcApiAuthUrl}/authorize`, {
			username,
			password,
		});
		// @ts-ignore
		const success = await wpCredentials.atomicPatch(result.data);
		if (success) {
			onClose();
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
