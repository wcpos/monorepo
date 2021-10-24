import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import http from '@wcpos/common/src/lib/http';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

interface LoginFormProps {
	onClose: () => void;
	// site?: import('@wcpos/common/src/database').SiteDocument
	siteID?: string;
}

const LoginForm = ({ onClose, siteID }: LoginFormProps) => {
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const { userDB, site, wpCredentials } = useAppState();

	const handleLogin = async () => {
		let _site = site;
		let success;

		if (siteID) {
			// @ts-ignore
			_site = await userDB.sites.findOne(siteID).exec();
		}

		const { data } = (await http.post(`${_site.wcApiAuthUrl}/authorize`, {
			username,
			password,
		})) as Record<string, any>;

		if (wpCredentials) {
			success = await wpCredentials.atomicPatch(data);
		} else {
			success = await _site.addWpCredentials(data);
		}

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
