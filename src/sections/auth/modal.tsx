import React from 'react';
import get from 'lodash/get';
import { WebView } from 'react-native-webview';

type MessageEvent = import('react-native-webview').WebViewMessageEvent;

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Modal = ({ navigation }: Props) => {
	const site = navigation.getParam('site');
	const user = navigation.getParam('user');

	const handleMessage = (event: MessageEvent) => {
		const data = JSON.parse(get(event, ['nativeEvent', 'data']));
		console.log(data);
		if (data.source === 'wcpos') {
			user.updateFromJSON(data.payload);
			if (user.isAuthenticated()) {
				navigation.navigate('Auth');
			}
		}
	};

	return <WebView source={{ uri: site.wcAuthUrl }} onMessage={handleMessage} />;
};

export default Modal;
