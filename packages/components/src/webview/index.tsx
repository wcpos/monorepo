import * as React from 'react';

import { useAugmentedRef } from '@rn-primitives/hooks';
import isString from 'lodash/isString';
import { WebView as RNWebView, WebViewProps as RNWebViewProps } from 'react-native-webview';

export interface WebViewProps extends RNWebViewProps {
	ref: React.RefObject<RNWebView>;
	src: string;
	onMessage: (event: { nativeEvent: { data: any } }) => void;
}

/**
 * WebView component that automatically resizes to fill its parent container
 */
function WebView({ ref, src, onMessage, ...props }: WebViewProps) {
	/**
	 * Add a postMessage function to the ref
	 */
	const augmentedRef = useAugmentedRef({
		ref,
		methods: {
			postMessage(message) {
				// Inject JavaScript that calls window.postMessage with the message
				augmentedRef.current.injectJavaScript(`
					(function() {
						window.postMessage(${JSON.stringify(message)}, '*');
						return true;
					})();
				`);
			},
		},
	});

	return (
		<RNWebView
			ref={augmentedRef}
			source={{ uri: src }}
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
						onMessage?.({ ...nativeEvent, data: parsedData });
					} catch (e) {
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
 *   const webViewRef = React.useRef<RNWebView>(null);
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
