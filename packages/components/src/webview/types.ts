import type * as React from 'react';

import type { WebViewProps as RNWebViewProps } from 'react-native-webview';
import type { WebViewErrorEvent } from 'react-native-webview/lib/WebViewTypes';

/**
 * react-native-webview types `onContentSizeChange` without the `contentSize`
 * payload it actually delivers — declare the real shape so the host can size
 * itself to the rendered document.
 */
interface WebViewContentSizeChangeEvent {
	nativeEvent: { contentSize: { width: number; height: number } };
}

/**
 * `retractsLoad`: the load since the last start was this failed document's synthetic finish
 * (Android's engine). The web iframe never sets it: a browser fires `load` for a failed
 * navigation and rarely `error`, so nothing is retracted. The host receives a plain copy of
 * the event, without SyntheticEvent methods.
 */
export type WebViewLoadErrorEvent = WebViewErrorEvent & {
	nativeEvent: WebViewErrorEvent['nativeEvent'] & { retractsLoad?: boolean };
};

/** One props shape for both engines; only the handle the ref receives differs per platform. */
export interface WebViewProps<Handle> extends Omit<
	RNWebViewProps,
	'onContentSizeChange' | 'onMessage' | 'onError'
> {
	ref?: React.Ref<Handle>;
	src?: string;
	srcDoc?: string;
	/**
	 * Web: `srcDoc` is HTML the app rendered and sanitised itself, so the frame may keep the app's
	 * origin. Any other `srcDoc` (a page read from a store) gets an origin of its own.
	 */
	trustedSrcDoc?: boolean;
	targetOrigin?: string;
	onMessage: (event: { nativeEvent: { data: unknown } }) => void;
	onContentSizeChange?: (event: WebViewContentSizeChangeEvent) => void;
	onError?: (event: WebViewLoadErrorEvent) => void;
}
