import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Modal from '@wcpos/common/src/components/modal4';
import TextInput from '@wcpos/common/src/components/textinput';

const Login = () => {
	const navigation = useNavigation();

	return (
		<Modal alwaysOpen onClose={() => navigation.goBack()}>
			<TextInput label="Username" placeholder="username" />
			<TextInput label="Password" placeholder="password" />
		</Modal>
	);
};

export default Login;
