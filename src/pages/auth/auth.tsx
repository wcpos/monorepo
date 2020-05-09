import React from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import PageLayout from '../../layout/page';
import Button from '../../components/button';
import Modal from '../../components/modal';
import useUser from '../../hooks/use-user';

interface Props {}

const Auth: React.FC<Props> = () => {
	const [visible, setVisible] = React.useState(false);
	const { user, setUser } = useUser();

	return (
		<PageLayout>
			<Text>Auth</Text>
			<Button title="Open Modal" onPress={() => setVisible(true)} />
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
		</PageLayout>
	);
};

export default Auth;
