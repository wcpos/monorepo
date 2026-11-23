import React from 'react';
import { View } from 'react-native';

import { useComposedRefs } from '@rn-primitives/hooks';
import { WebViewProps as RNWebViewProps } from 'react-native-webview';

import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { withBase } from './with-base';

import type { WebViewLoadErrorEvent, WebViewProps } from './types';

export type WebViewHandle = HTMLIFrameElement & {
	postMessage(message: any): void;
	/** The rendered copy of an untrusted srcDoc frame; null without one, too large or too late. */
	requestRenderedHtml(): Promise<string | null>;
};

export type { WebViewLoadErrorEvent };

// An untrusted srcDoc frame has its own origin, so the host cannot read its document. A script
// added to it reports the content size and, on request, a copy of the rendered document (each
// canvas kept as an image). Its messages are data: own frame, own token, checked shape, clamps.
const BRIDGE = 'wcpos-frame';
const MIN_SIZE = 50;
const MAX_SIZE = 20_000;
const MAX_HTML_LENGTH = 2_000_000;
const RENDERED_HTML_TIMEOUT_MS = 2_000;
const bridgeScript = (token: string) =>
	`<script>(function(){var T=${JSON.stringify(token)},K='${BRIDGE}';` +
	`function post(m){m.type=K;m.token=T;parent.postMessage(m,'*');}` +
	`function size(){var b=document.body;if(b)post({width:b.scrollWidth,height:b.scrollHeight});}` +
	`addEventListener('load',function(){var s=document.createElement('style');` +
	`s.textContent='html,body{margin:0;padding:0;overflow:hidden;}';` +
	`(document.head||document.documentElement).appendChild(s);size();` +
	`if(window.ResizeObserver&&document.body)new ResizeObserver(size).observe(document.body);});` +
	`addEventListener('message',function(e){if(e.source!==parent||!e.data||e.data.type!==K+'-html')return;` +
	`var c=document.documentElement.cloneNode(true),from=document.getElementsByTagName('canvas'),` +
	`to=c.getElementsByTagName('canvas');for(var i=from.length-1;i>=0;i--){try{` +
	`var img=document.createElement('img');img.src=from[i].toDataURL();img.width=from[i].width;` +
	`img.height=from[i].height;img.className=from[i].className;` +
	`img.setAttribute('style',from[i].getAttribute('style')||'');to[i].parentNode.replaceChild(img,to[i]);` +
	`}catch(x){}}post({html:c.outerHTML});});})();</script>`;
const newToken = () =>
	Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(36)).join('');
const clampSize = (n: unknown) =>
	typeof n === 'number' && n > 0 && n < Infinity ? Math.min(Math.max(n, MIN_SIZE), MAX_SIZE) : null;

/**
 * Inline HTML would inherit the app's origin; only the app's own rendered HTML may. A frame keeps
 * the sandbox it was created with: a change of trust mounts a new frame. That trusted HTML is
 * sanitised and read by the host, so it runs no script: scripts and same origin never meet there.
 */
function WebView(props: WebViewProps<WebViewHandle>) {
	const trusted = props.srcDoc != null && !!props.trustedSrcDoc;
	const scripts = trusted ? '' : 'allow-scripts ';
	const sameOrigin = props.srcDoc == null || trusted ? ' allow-same-origin' : '';
	const sandbox = `${scripts}allow-forms allow-popups${sameOrigin} allow-modals`;
	return <WebViewFrame key={sandbox} {...props} sandbox={sandbox} />;
}

/**
 *
 */
function WebViewFrame({
	ref,
	src,
	source,
	onMessage,
	onLoad,
	onContentSizeChange,
	srcDoc,
	trustedSrcDoc = false,
	targetOrigin,
	className,
	sandbox,
	...props
}: WebViewProps<WebViewHandle> & { sandbox: string }) {
	const [loading, setLoading] = React.useState(true);
	const [token] = React.useState(newToken);
	// Only a caller that sizes the frame gets the script; other inline HTML is shown as given.
	const bridged = srcDoc != null && !trustedSrcDoc && onContentSizeChange != null;
	const renderedHtmlRef = React.useRef<((html: string | null) => void) | null>(null);

	const localRef = React.useRef<HTMLIFrameElement>(null);
	const composedRef = useComposedRefs(ref, localRef);

	// Keep the latest callback in a ref so the ResizeObserver — wired up once on
	// iframe load — always invokes the current handler without re-subscribing.
	// The ref is written in an effect (not during render) and read later from the
	// observer/load callbacks, both of which run after commit.
	const onContentSizeChangeRef = React.useRef(onContentSizeChange);
	React.useEffect(() => {
		onContentSizeChangeRef.current = onContentSizeChange;
	});
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
					localRef.current?.contentWindow?.postMessage(message, targetOrigin ?? '*');
				},
				requestRenderedHtml() {
					const frameWindow = localRef.current?.contentWindow;
					if (!bridged || !frameWindow) return Promise.resolve(null);
					renderedHtmlRef.current?.(null);
					return new Promise<string | null>((resolve) => {
						const finish = (html: string | null) => {
							clearTimeout(timer);
							if (renderedHtmlRef.current === finish) renderedHtmlRef.current = null;
							resolve(html);
						};
						const timer = setTimeout(() => finish(null), RENDERED_HTML_TIMEOUT_MS);
						renderedHtmlRef.current = finish;
						frameWindow.postMessage({ type: `${BRIDGE}-html` }, '*');
					});
				},
			}),
		[targetOrigin, bridged]
	);

	// The bridge script's messages: from this frame's window, carrying this frame's token.
	React.useEffect(() => {
		if (!bridged) return;
		const onBridgeMessage = ({ source, data }: MessageEvent<any>) => {
			if (source !== localRef.current?.contentWindow || data?.type !== BRIDGE) return;
			if (data.token !== token) return;
			if (typeof data.html === 'string') {
				renderedHtmlRef.current?.(data.html.length <= MAX_HTML_LENGTH ? data.html : null);
				return;
			}
			const width = clampSize(data.width);
			const height = clampSize(data.height);
			if (width == null || height == null) return;
			onContentSizeChangeRef.current?.({ nativeEvent: { contentSize: { width, height } } });
		};
		window.addEventListener('message', onBridgeMessage, true);
		return () => window.removeEventListener('message', onBridgeMessage, true);
	}, [bridged, token]);

	/**
	 * Attach message listener
	 */
	React.useEffect(() => {
		const onIframeMessage = (event: MessageEvent<any>) => {
			const { origin, data } = event;
			// A pinned origin is shared hosting (a CDN); only the rendered frame may speak.
			if (
				targetOrigin &&
				(origin !== targetOrigin || event.source !== localRef.current?.contentWindow)
			)
				return;

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
	}, [onMessage, targetOrigin]);

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
			if (!onContentSizeChangeRef.current || bridged) return;

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
		[onLoad, measureContentSize, bridged]
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
				data-testid={props.testID}
				// srcDoc wins over src; with both, src is only the document's base and the frame never
				// navigates to it.
				src={
					srcDoc != null ? undefined : (source && 'uri' in source ? source.uri : undefined) || src
				}
				srcDoc={
					srcDoc == null
						? undefined
						: (src ? withBase(srcDoc, src) : srcDoc) + (bridged ? bridgeScript(token) : '')
				}
				onLoad={handleLoaded}
				frameBorder="0"
				sandbox={sandbox}
				className="h-full w-full"
				onError={(error) => {
					console.error('WebView error:', error);
					// Web-specific: iframe error events don't match RN WebView error events
					props.onError?.(error as unknown as WebViewLoadErrorEvent);
				}}
			/>
			{loading && (
				<View className="bg-background/75 absolute inset-0 flex items-center justify-center">
					<Loader />
				</View>
			)}
		</View>
	);
}

export { WebView };
