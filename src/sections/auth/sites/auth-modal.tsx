import React from 'react';
import WebView from '../../../components/webview';

type MessageEvent = import('react-native-webview').WebViewMessageEvent;

const AuthModal = ({ site, user }) => {
	const handleMessage = event => {
		const data = JSON.parse(event?.data);
		console.log(data);
		// if (data.source === 'wcpos') {
		// 	user.updateFromJSON(data.payload);
		// }
	};

	return <WebView src={site.wc_api_auth_url} onMessage={handleMessage} />;
};

export default AuthModal;
