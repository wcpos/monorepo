import React from 'react';
import { View, Text, Linking } from 'react-native';
import PageLayout from '../../layout/page';
import Button from '../../components/button';
import Modal from '../../components/modal';

interface Props {}

const Auth: React.FC<Props> = () => {
	const [visible, setVisible] = React.useState(false);

	return (
		<PageLayout>
			<Text>Auth</Text>
			<Button title="Open Modal" onPress={() => setVisible(true)} />
			<Modal visible={visible}>
				<Text
					onPress={() => {
						Linking.openURL('wcpos://products');
					}}
					style={{ padding: 100 }}
				>
					Cancel
				</Text>
			</Modal>
		</PageLayout>
	);
};

export default Auth;
