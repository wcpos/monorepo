import React from 'react';
import { View } from 'react-native';

import { useComposedRefs } from '@rn-primitives/hooks';
import { WebViewProps as RNWebViewProps } from 'react-native-webview';

import { cn } from '../lib/utils';
import { Loader } from '../loader';

/**
 * react-native-webview types `onContentSizeChange` without the `contentSize`
 * payload it actually delivers — declare the real shape so the host can size
 * itself to the rendered document.
 */
export interface WebViewContentSizeChangeEvent {
	nativeEvent: { contentSize: { width: number; height: number } };
}

export interface WebViewProps extends Omit<RNWebViewProps, 'onContentSizeChange'> {
	ref: React.RefObject<HTMLIFrameElement>;
	src?: string;
	srcDoc?: string;
	onMessage: (event: { nativeEvent: { data: any } }) => void;
	onContentSizeChange?: (event: WebViewContentSizeChangeEvent) => void;
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
	onContentSizeChange,
	srcDoc,
	className,
	...props
}: WebViewProps) {
	const [loading, setLoading] = React.useState(true);

	const localRef = React.useRef<HTMLIFrameElement>(null);
	const composedRef = useComposedRefs(ref, localRef);

	// Keep the latest callback in a ref so the ResizeObserver — wired up once on
	// iframe load — always invokes the current handler without re-subscribing.
	const onContentSizeChangeRef = React.useRef(onContentSizeChange);
	onContentSizeChangeRef.current = onContentSizeChange;
	const resizeObserverRef = React.useRef<ResizeObserver | null>(null);

	const measureContentSize = React.useCallback(() => {
		let doc: Document | null = null;
		try {
			doc = localRef.current?.contentDocument ?? null;
		} catch {
			// Cross-origin document (remote src) — not measurable from the host.
			return;
		}
		const body = doc?.body;
		if (!body) return;
		onContentSizeChangeRef.current?.({
			nativeEvent: { contentSize: { width: body.scrollWidth, height: body.scrollHeight } },
		});
	}, []);

	React.useImperativeHandle(
		ref,
		() =>
			Object.assign(localRef.current ?? ({} as HTMLIFrameElement), {
				postMessage(message: any) {
					localRef.current?.contentWindow?.postMessage(message, '*');
				},
			}),
		[]
	);

	/**
	 * Attach message listener
	 */
	React.useEffect(() => {
		const onIframeMessage = (event: MessageEvent<any>) => {
			const { origin, data } = event;

			const message = {
				nativeEvent: {
					data,
					url: origin,
					loading: false,
					title: '',
					canGoBack: false,
					canGoForward: false,
					lockIdentifier: 0,
				},
			};

			onMessage?.(message as any);
		};

		window.addEventListener('message', onIframeMessage, true);

		return () => {
			window.removeEventListener('message', onIframeMessage, true);
		};
	}, [onMessage]);

	/**
	 * Handle loaded — also wires up content-size measurement for same-origin
	 * (srcDoc) documents so the embedder can size the frame to the content.
	 */
	const handleLoaded = React.useCallback(
		(e: React.SyntheticEvent<HTMLIFrameElement>) => {
			setLoading(false);
			// Web-specific: iframe load events don't match RN WebView navigation events
			onLoad?.(e as unknown as Parameters<NonNullable<RNWebViewProps['onLoad']>>[0]);

			resizeObserverRef.current?.disconnect();
			resizeObserverRef.current = null;
			if (!onContentSizeChangeRef.current) return;

			let doc: Document | null = null;
			try {
				doc = localRef.current?.contentDocument ?? null;
			} catch {
				doc = null;
			}
			if (!doc?.body) return;
			// Zero the UA's default body margin so the measurement reflects the
			// document itself, and hide overflow so a transient scrollbar can't
			// shrink the next measurement.
			if (!doc.getElementById('wcpos-webview-reset')) {
				const style = doc.createElement('style');
				style.id = 'wcpos-webview-reset';
				style.textContent = 'html,body{margin:0;padding:0;overflow:hidden;}';
				doc.head?.appendChild(style);
			}
			measureContentSize();
			if (typeof ResizeObserver !== 'undefined') {
				const observer = new ResizeObserver(() => measureContentSize());
				observer.observe(doc.body);
				resizeObserverRef.current = observer;
			}
		},
		[onLoad, measureContentSize]
	);

	// Disconnect the content-size observer on unmount.
	React.useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

	/**
	 *
	 */
	return (
		<View className={cn('relative', className)}>
			<iframe
				ref={composedRef}
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
