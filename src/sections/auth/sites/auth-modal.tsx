import React from 'react';
import get from 'lodash/get';
import { WebView } from 'react-native-webview';

type MessageEvent = import('react-native-webview').WebViewMessageEvent;

const AuthModal = ({ site, user }) => {
	const handleMessage = (event: MessageEvent) => {
		const data = JSON.parse(get(event, ['nativeEvent', 'data']));
		console.log(data);
		// if (data.source === 'wcpos') {
		// 	user.updateFromJSON(data.payload);
		// }
	};

	return (
		<WebView
			source={{ uri: site.wc_api_auth_url }}
			onMessage={handleMessage}
			onError={syntheticEvent => {
				const { nativeEvent } = syntheticEvent;
				console.error('WebView error: ', nativeEvent);
			}}
		/>
	);
};

export default AuthModal;
