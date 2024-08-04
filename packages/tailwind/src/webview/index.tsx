import * as React from 'react';

import isString from 'lodash/isString';
import noop from 'lodash/noop';
import { WebView as RNWebView, WebViewProps as RNWebViewProps } from 'react-native-webview';

type WebViewMessage = import('react-native-webview/lib/WebViewTypes').WebViewMessage;
type WebViewError = import('react-native-webview/lib/WebViewTypes').WebViewError;
type WebViewNavigation = import('react-native-webview/lib/WebViewTypes').WebViewNavigation;

type WebViewProps = {
	src: string;
	title?: string;
	onMessage?: (ev: WebViewMessage) => void;
	onError?: (ev: WebViewError) => void;
	onLoad?: (ev: WebViewNavigation) => void;
} & RNWebViewProps;

/**
 *
 */
const WebViewBase = (
	{ src, title, onMessage = noop, onError = noop, onLoad = noop, ...props }: WebViewProps,
	ref: RNWebView
) => {
	return (
		<RNWebView
			ref={ref}
			source={{ uri: src }}
			onMessage={({ nativeEvent }) => {
				/**
				 * https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#onmessage
				 * data from the webview must be a string, we want to convert this to an object
				 */
				let data = nativeEvent.data;
				if (data && isString(data)) {
					data = JSON.parse(data);
				}
				onMessage({ ...nativeEvent, data });
			}}
			onError={({ nativeEvent }) => {
				onError(nativeEvent);
			}}
			onLoad={({ nativeEvent }) => {
				onLoad(nativeEvent);
			}}
			{...props}
		/>
	);
};

export const WebView = React.forwardRef(WebViewBase);
