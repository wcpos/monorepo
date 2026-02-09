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
	const augmentedRef = useAugmentedRef<HTMLIFrameElement>({
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
		(e: React.SyntheticEvent<HTMLIFrameElement>) => {
			setLoading(false);
			// Web-specific: iframe load events don't match RN WebView navigation events
			onLoad?.(e as unknown as Parameters<NonNullable<RNWebViewProps['onLoad']>>[0]);
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
				src={(source && 'uri' in source ? source.uri : undefined) || src}
				srcDoc={srcDoc}
				onLoad={handleLoaded}
				frameBorder="0"
				sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-modals"
				className="h-full w-full"
				onError={(error) => {
					console.error('WebView error:', error);
					// Web-specific: iframe error events don't match RN WebView error events
					props.onError?.(
						error as unknown as Parameters<NonNullable<RNWebViewProps['onError']>>[0]
					);
				}}
			/>
			{loading && (
				<View className="bg-opacity-75 absolute inset-0 flex items-center justify-center bg-white">
					<Loader />
				</View>
			)}
		</View>
	);
}

export { WebView };
