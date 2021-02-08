import * as React from 'react';
import { View } from 'react-native';
import Text from '../text';
import Button from '../button';

import Modal from '.';

export default {
	title: 'Components/Modal2',
};

export const basicUsage = () => {
	const [visible, setVisible] = React.useState(false);

	const onOpen = () => {
		setVisible(true);
	};
	const onClose = () => {
		setVisible(false);
	};

	return (
		<View>
			<Button title="Show Modal" onPress={onOpen} />
			<Modal visible={visible}>
				<View style={{ paddingVertical: 20 }}>
					<Text style={{ textAlign: 'center' }}>Content...</Text>
					<Text style={{ textAlign: 'center' }}>Content...</Text>
				</View>
				<Button title="Close Modal" onPress={onClose} />
			</Modal>
		</View>
	);
};
