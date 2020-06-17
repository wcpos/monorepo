import React from 'react';
import { WebView as RNWebView } from 'react-native-webview';

type WebViewMessageEvent = import('react-native-webview').WebViewMessageEvent;
type WebViewErrorEvent = import('react-native-webview/lib/WebViewTypes').WebViewErrorEvent;
type WebViewNavigationEvent = import('react-native-webview/lib/WebViewTypes').WebViewNavigationEvent;

type Props = {
	src: string;
	title?: string;
	onMessage?: (event: WebViewMessageEvent) => void;
	onError?: (event: WebViewErrorEvent) => void;
	onLoad?: (event: WebViewNavigationEvent) => void;
};

const WebView: React.FC<Props> = ({ src, title, onMessage, onError, onLoad }) => {
	return (
		<RNWebView source={{ uri: src }} onMessage={onMessage} onError={onError} onLoad={onLoad} />
	);
};

export default WebView;
