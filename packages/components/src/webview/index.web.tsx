import React from 'react';
import { View } from 'react-native';

import { useAugmentedRef } from '@rn-primitives/hooks';
import { WebViewProps as RNWebViewProps } from 'react-native-webview';

import { cn } from '../lib/utils';
import { Loader } from '../loader';

export interface WebViewProps extends RNWebViewProps {
	ref: React.RefObject<HTMLIFrameElement>;
	src?: string;
	srcDoc?: string;
	onMessage: (event: { nativeEvent: { data: any } }) => void;
}

/**
 *
 */
function WebView({
	ref,
	src,
	source,
	onMessage,
	onLoad,
	srcDoc,
	className,
	...props
}: WebViewProps) {
	const [loading, setLoading] = React.useState(true);

	/**
	 * Add a postMessage function to the ref
	 */
	const augmentedRef = useAugmentedRef({
		ref,
		methods: {
			postMessage(message) {
				augmentedRef.current?.contentWindow?.postMessage(message, '*');
			},
		},
	});

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
		(e) => {
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
				ref={augmentedRef}
				src={source?.uri || src}
				srcDoc={srcDoc}
				onLoad={handleLoaded}
				frameBorder="0"
				sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-modals"
				className="h-full w-full"
				onError={(error) => {
					console.error('WebView error:', error);
					props.onError?.(error);
				}}
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

export { WebView };
