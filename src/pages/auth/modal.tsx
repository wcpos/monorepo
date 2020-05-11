import React from 'react';
import { Linking, Platform } from 'react-native';
import Modal from '../../components/modal';
import Button from '../../components/button';
import useUser from '../../hooks/use-user';

const AuthModal: React.FC<Props> = ({ visible }) => {
	const { user, setUser } = useUser();

	return (
		<Modal visible={visible}>
			<Button
				onPress={() => {
					if (Platform.OS === 'web') {
						// TODO: capture location changes from webview
						Linking.openURL('https://localhost:3000/auth');
					} else {
						Linking.openURL('wcpos://auth');
					}
				}}
				title="Cancel"
			/>
			<Button
				onPress={() => {
					setUser({ foo: 'bar' });
				}}
				title="Update User"
			/>
			<Button
				onPress={() => {
					setUser({ authenticated: true });
				}}
				title="Login"
			/>
		</Modal>
	);
};

export default AuthModal;
