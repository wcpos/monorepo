import React from 'react';

import { cn } from '../lib/utils';

import type { WebViewSharedProps } from 'react-native-webview/lib/WebViewTypes';

export interface WebViewProps extends Omit<WebViewSharedProps, 'style'> {
	style?: React.CSSProperties;
	/**
	 * Source URI helper
	 */
	src?: string;
	/**
	 * A string that represents the content to display in the frame.
	 */
	srcDoc?: string;
}

/**
 *
 */
const WebViewBase = (
	{
		style,
		src,
		source,
		onMessage,
		onLoad,
		injectedJavaScript, // not working at the moment
		onNavigationStateChange,
		onError,
		srcDoc,
		className,
	}: WebViewProps,
	ref
) => {
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	React.useImperativeHandle(ref, () => iframeRef.current);

	// const onIframeLoad = function () {
	//   try {
	//     const location = iframeRef.current?.contentWindow?.location;
	//     console.log("onIframeLoad location", location);

	//     onNavigationStateChange?.({
	//       url: location?.href || "",
	//       navigationType: "other",
	//       loading: false,
	//       title: "",
	//       canGoBack: false,
	//       canGoForward: false,
	//       lockIdentifier: 0,
	//     });
	//   } catch (e) {
	//     throw new Error(e);
	//   }
	// };

	/**
	 * attach message listener
	 */
	React.useEffect(() => {
		const onIframeMessage = (event: MessageEvent<any>) => {
			const { origin, data } = event;

			const message = {
				data,
				url: origin,
				loading: false,
				title: '',
				canGoBack: false,
				canGoForward: false,
				lockIdentifier: 0,
			};

			onMessage?.(message as any);
		};

		window.addEventListener('message', onIframeMessage, true);

		return () => {
			window.removeEventListener('message', onIframeMessage, true);
		};
	}, [onMessage]);

	/**
	 * attach message listener
	 */

	return (
		<iframe
			ref={iframeRef}
			src={source?.uri || src}
			srcDoc={srcDoc}
			onLoad={onLoad}
			frameBorder="0"
			sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
			className={cn('w-full h-full', className)}
		/>
	);
};

export const WebView = React.forwardRef<HTMLIFrameElement, WebViewProps>(WebViewBase);
