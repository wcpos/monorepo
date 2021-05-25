import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import useAppState from '../use-app-state';

// @ts-ignore
export const AuthLoginContext = React.createContext(() => {});
/**
 *
 */
export const AuthLoginProvider: React.FC = ({ children }) => {
	const [visible, setVisible] = React.useState(false);
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { site, wpUser } = useAppState();

	const handleLogin = async () => {
		if (site && site.wpApiUrl) {
			const result = await http.post(`${site.wpApiUrl}wcpos/v1/jwt/authorize`, {
				username,
				password,
			});
			// set wp credientials
			const success = await wpUser?.atomicPatch(result.data);
			if (success) {
				setVisible(false);
			}
		}
	};

	const show = () => {
		setVisible(true);
	};

	return (
		<AuthLoginContext.Provider value={show}>
			{children}{' '}
			<Dialog
				title="Login"
				open={visible}
				onClose={() => setVisible(false)}
				primaryAction={{ label: 'Login', action: handleLogin }}
			>
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
			</Dialog>
		</AuthLoginContext.Provider>
	);
};
