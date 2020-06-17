import React from 'react';
import { WebView as RNWebView } from 'react-native-webview';
import noop from 'lodash/noop';

type WebViewMessage = import('react-native-webview/lib/WebViewTypes').WebViewMessage;
type WebViewError = import('react-native-webview/lib/WebViewTypes').WebViewError;
type WebViewNavigation = import('react-native-webview/lib/WebViewTypes').WebViewNavigation;

type Props = {
	src: string;
	title?: string;
	onMessage?: (ev: WebViewMessage) => void;
	onError?: (ev: WebViewError) => void;
	onLoad?: (ev: WebViewNavigation) => void;
};

const WebView: React.FC<Props> = ({
	src,
	title,
	onMessage = noop,
	onError = noop,
	onLoad = noop,
}) => {
	return (
		<RNWebView
			source={{ uri: src }}
			onMessage={({ nativeEvent }) => {
				onMessage(nativeEvent);
			}}
			onError={({ nativeEvent }) => {
				onError(nativeEvent);
			}}
			onLoad={({ nativeEvent }) => {
				onLoad(nativeEvent);
			}}
		/>
	);
};

export default WebView;
