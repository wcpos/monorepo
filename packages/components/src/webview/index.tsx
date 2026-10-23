import * as React from 'react';

import isString from 'lodash/isString';
import { WebView as RNWebView, WebViewProps as RNWebViewProps } from 'react-native-webview';

import type {
	WebViewErrorEvent,
	WebViewEvent,
	WebViewMessageEvent,
	WebViewNavigationEvent,
} from 'react-native-webview/lib/WebViewTypes';

export type WebViewHandle = Omit<RNWebView<object>, 'postMessage'> & {
	postMessage(message: unknown): void;
};

/**
 * react-native-webview types `onContentSizeChange` without the `contentSize`
 * payload it actually delivers — declare the real shape so the host can size
 * itself to the rendered document.
 */
export interface WebViewContentSizeChangeEvent {
	nativeEvent: { contentSize: { width: number; height: number } };
}

/** `retractsLoad`: the load since the last start was this failed document's synthetic finish. */
export type WebViewLoadErrorEvent = WebViewErrorEvent & {
	nativeEvent: WebViewErrorEvent['nativeEvent'] & { retractsLoad: boolean };
};

export interface WebViewProps extends Omit<
	RNWebViewProps,
	'onContentSizeChange' | 'onMessage' | 'onError'
> {
	ref?: React.Ref<WebViewHandle>;
	src?: string;
	srcDoc?: string;
	targetOrigin?: string;
	onMessage: (event: { nativeEvent: { data: unknown } }) => void;
	onContentSizeChange?: (event: WebViewContentSizeChangeEvent) => void;
	onError?: (event: WebViewLoadErrorEvent) => void;
}

/** The URL a navigation event names, when it names one. */
function eventURL(event: { nativeEvent?: { url?: unknown } }): string | null {
	const url = event.nativeEvent?.url;
	return typeof url === 'string' && url !== '' ? url : null;
}

/**
 * WebView component that automatically resizes to fill its parent container
 */
function WebView({
	ref,
	src,
	srcDoc,
	targetOrigin: _targetOrigin,
	onMessage,
	onContentSizeChange,
	onLoad,
	onLoadStart,
	onError,
	...props
}: WebViewProps) {
	const localRef = React.useRef<RNWebView<object>>(null);
	// react-native-webview 14.0.1 on Android (RNCWebViewClient.onReceivedError) reports a
	// failed navigation as a FINISH and then an error, so `onLoad` fires for a document that
	// never loaded. `loadSinceStartRef` holds the URL of a load since the last navigation
	// start, so an error naming that same URL is marked `retractsLoad` (iOS errors never
	// follow a load of their own URL). `erroredURLRef` is the URL that failed: its error page
	// then fires a load-start of its own (doUpdateVisitedHistory), which is not a navigation
	// and is not reported.
	const loadSinceStartRef = React.useRef<string | null>(null);
	const erroredURLRef = React.useRef<string | null>(null);

	React.useImperativeHandle(
		ref,
		() =>
			Object.assign(localRef.current ?? ({} as RNWebView<object>), {
				postMessage(message: unknown) {
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

	// srcDoc (inline HTML) takes priority over src (URI). When both are given the HTML is a page
	// that was read from src (the receipt stage reads it once and shows the text), so src is its
	// base: relative links in a template resolve against the store, as they did when the WebView
	// loaded the URL itself.
	const source =
		srcDoc != null ? { html: srcDoc, ...(src ? { baseUrl: src } : {}) } : { uri: src || '' };

	return (
		<RNWebView<object>
			ref={localRef}
			source={source}
			onMessage={(event: WebViewMessageEvent) => {
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
			onLoad={(event: WebViewNavigationEvent) => {
				loadSinceStartRef.current = eventURL(event);
				erroredURLRef.current = null;
				onLoad?.(event);
			}}
			onLoadStart={(event: WebViewNavigationEvent) => {
				const url = eventURL(event);
				const errored = erroredURLRef.current;
				if (
					errored !== null &&
					url !== null &&
					(url === errored || url.startsWith('chrome-error://'))
				)
					return;
				erroredURLRef.current = null;
				loadSinceStartRef.current = null;
				onLoadStart?.(event);
			}}
			onError={(error: WebViewErrorEvent) => {
				const url = eventURL(error);
				const retractsLoad = url !== null && loadSinceStartRef.current === url;
				loadSinceStartRef.current = null;
				erroredURLRef.current = url ?? '';
				if (!onError) console.error('WebView error:', error);
				onError?.({ ...error, nativeEvent: { ...error.nativeEvent, retractsLoad } });
			}}
			// react-native-webview types onContentSizeChange without `contentSize`,
			// but it is populated at runtime — the cast bridges the upstream gap.
			onContentSizeChange={onContentSizeChange as ((event: WebViewEvent) => void) | undefined}
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
