import React from 'react';
import { WebView, Platform } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Modal = ({ navigation }: Props) => {
	const uri = navigation.getParam('url');
	if (Platform.OS === 'web') {
		window.location.href = uri;
		return null;
	} else {
		return <WebView source={{ uri }} />;
	}
};

export default Modal;
