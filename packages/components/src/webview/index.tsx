import * as React from 'react';

import isString from 'lodash/isString';
import { WebView as RNWebView, WebViewProps as RNWebViewProps } from 'react-native-webview';

export type WebViewHandle = Omit<RNWebView, 'postMessage'> & {
	postMessage(message: any): void;
};

/**
 * react-native-webview types `onContentSizeChange` without the `contentSize`
 * payload it actually delivers — declare the real shape so the host can size
 * itself to the rendered document.
 */
export interface WebViewContentSizeChangeEvent {
	nativeEvent: { contentSize: { width: number; height: number } };
}

export interface WebViewProps extends Omit<RNWebViewProps, 'onContentSizeChange'> {
	ref?: React.Ref<WebViewHandle>;
	src?: string;
	srcDoc?: string;
	onMessage: (event: { nativeEvent: { data: any } }) => void;
	onContentSizeChange?: (event: WebViewContentSizeChangeEvent) => void;
}

/**
 * WebView component that automatically resizes to fill its parent container
 */
function WebView({ ref, src, srcDoc, onMessage, onContentSizeChange, ...props }: WebViewProps) {
	const localRef = React.useRef<RNWebView>(null);

	React.useImperativeHandle(
		ref,
		() =>
			Object.assign(localRef.current ?? ({} as RNWebView), {
				postMessage(message: any) {
					const eventInit = JSON.stringify({ data: message });
					localRef.current?.injectJavaScript(`
						(function() {
							var eventInit = ${eventInit};
							function dispatchMessage(target) {
								var event;
								try {
									event = new MessageEvent('message', eventInit);
								} catch (error) {
									event = document.createEvent('MessageEvent');
									event.initMessageEvent(
										'message',
										false,
										true,
										eventInit.data,
										eventInit.origin,
										eventInit.lastEventId,
										eventInit.source
									);
								}
								target.dispatchEvent(event);
							}
							dispatchMessage(window);
							dispatchMessage(document);
							return true;
						})();
					`);
				},
			}),
		[]
	);

	// srcDoc (inline HTML) takes priority over src (URI)
	const source = srcDoc != null ? { html: srcDoc } : { uri: src || '' };

	return (
		<RNWebView
			ref={localRef}
			source={source}
			onMessage={(event) => {
				/**
				 * https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#onmessage
				 * data from the webview must be a string, we want to convert this to an object
				 */
				const { nativeEvent } = event;
				let parsedData = nativeEvent.data || '';
				if (parsedData && isString(parsedData)) {
					try {
						parsedData = JSON.parse(parsedData);
						// We can't modify nativeEvent directly, so we pass the parsed data separately
						// The component using this WebView can access parsedData from its onMessage handler
						onMessage?.({ nativeEvent: { ...nativeEvent, data: parsedData } });
					} catch {
						// If it's not valid JSON, just pass the original event
						onMessage?.(event);
					}
				} else {
					// Pass the original event if no parsing was needed
					onMessage?.(event);
				}
			}}
			onError={(error) => {
				console.error('WebView error:', error);
				props.onError?.(error);
			}}
			// react-native-webview types onContentSizeChange without `contentSize`,
			// but it is populated at runtime — the cast bridges the upstream gap.
			onContentSizeChange={onContentSizeChange as unknown as RNWebViewProps['onContentSizeChange']}
			{...props}
		/>
	);
}

export { WebView };

/**
 * Example of how to use the WebView's postMessage method:
 *
 * ```tsx
 * const MyComponent = () => {
 *   const webViewRef = React.useRef<WebViewHandle>(null);
 *
 *   const handleSendMessage = () => {
 *     // Using the augmented postMessage method
 *     webViewRef.current?.postMessage({
 *       type: 'ACTION',
 *       payload: { id: 123, data: 'example' }
 *     });
 *   };
 *
 *   return (
 *     <>
 *       <WebView
 *         ref={webViewRef}
 *         src="https://example.com"
 *         onMessage={(event) => {
 *           console.log('Message from WebView:', event.nativeEvent.data);
 *         }}
 *       />
 *       <Button title="Send Message" onPress={handleSendMessage} />
 *     </>
 *   );
 * };
 * ```
 *
 * Inside your web page (loaded in the WebView), you'll need to set up a listener:
 *
 * ```html
 * <script>
 *   window.addEventListener('message', function(event) {
 *     // Handle message from React Native
 *     console.log('Received message from React Native:', event.data);
 *
 *     // You can send a response back to React Native
 *     window.postMessage(JSON.stringify({ type: 'RESPONSE', success: true }), '*');
 *   });
 * </script>
 */
