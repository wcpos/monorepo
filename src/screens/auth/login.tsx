import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Box from '@wcpos/common/src/components/box';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import Modal, { useModal } from '@wcpos/common/src/components/modal';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;

interface LoginProps {
	site: SiteDocument;
}

const LoginBase = ({ site }: LoginProps, ref) => {
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { ref: modalRef, open, close } = useModal();

	const handleLogin = async () => {
		if (site && site.wpApiUrl) {
			const result = await http.post(`${site.wpApiUrl}wcpos/v1/jwt/authorize`, {
				username,
				password,
			});
			// set wp credientials
			// @ts-ignore
			const wpUser = await site.addOrUpdateWpCredentials(result.data);
			// if (wpUser.jwt) {
			// 	setVisible(false);
			// }
		}
	};

	React.useImperativeHandle(ref, () => ({ open }));

	return (
		<Modal
			title="Login"
			ref={modalRef}
			primaryAction={{ label: 'Login', action: handleLogin }}
			secondaryActions={[{ label: 'Cancel', action: close }]}
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

const Login = React.forwardRef(LoginBase);
export default Login;
