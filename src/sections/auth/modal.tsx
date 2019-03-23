import React from 'react';
import { Button, WebView } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Modal = ({ navigation }: Props) => {
	const uri = navigation.getParam('url');
	return (
		<>
			<Button
				title="Go Back"
				onPress={() => {
					navigation.goBack();
				}}
			/>
			<WebView source={{ uri }} />
		</>
	);
};

export default Modal;
