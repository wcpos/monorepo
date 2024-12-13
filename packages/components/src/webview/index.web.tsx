import React from 'react';
import { View } from 'react-native';

import { cn } from '../lib/utils';
import { Loader } from '../loader';

import type {
	WebViewSharedProps,
	WebViewNavigationEvent,
} from 'react-native-webview/lib/WebViewTypes';

export interface WebViewProps extends WebViewSharedProps {
	src?: string;
	srcDoc?: string;
}

/**
 *
 */
const _WebView = React.forwardRef<HTMLIFrameElement, WebViewProps>(
	({ src, source, onMessage, onLoad, srcDoc, className, ...props }, ref) => {
		const [loading, setLoading] = React.useState(true);

		/**
		 * Attach message listener
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
		 * Handle loaded
		 */
		const handleLoaded = React.useCallback(
			(e: WebViewNavigationEvent) => {
				setLoading(false);
				onLoad?.(e);
			},
			[onLoad]
		);

		/**
		 *
		 */
		return (
			<View className={cn('relative', className)}>
				<iframe
					ref={ref}
					src={source?.uri || src}
					srcDoc={srcDoc}
					onLoad={handleLoaded}
					frameBorder="0"
					sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-modals"
					className="h-full w-full"
					{...props}
				/>
				{loading && (
					<View className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
						<Loader />
					</View>
				)}
			</View>
		);
	}
);

export const WebView = React.memo(_WebView);
