import React from 'react';
import { WebView as RNWebView } from 'react-native-webview';

type Props = import('./').Props;

const WebView = ({
	src,
	title,
	onMessage = event => {},
	onError = () => {},
	onLoad = () => {},
}: Props) => {
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
