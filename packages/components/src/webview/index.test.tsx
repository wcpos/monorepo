import * as React from 'react';

import { render } from '@testing-library/react';

import { WebView, WebViewHandle } from './index';

const injectJavaScriptMock = jest.fn();
const sources: unknown[] = [];
// The props the engine hands react-native-webview, so a test can play its raw events.
const rendered: Record<string, any>[] = [];
const rnProps = () => rendered[rendered.length - 1];

jest.mock('react-native-webview', () => {
	return {
		WebView: React.forwardRef(function MockRNWebView(
			props: Record<string, unknown>,
			ref: React.ForwardedRef<{ injectJavaScript: (script: string) => void }>
		) {
			sources.push(props.source);
			rendered.push(props);
			React.useImperativeHandle(ref, () => ({
				injectJavaScript: injectJavaScriptMock,
			}));
			return null;
		}),
	};
});

describe('WebView native source', () => {
	beforeEach(() => {
		sources.length = 0;
	});

	it('shows inline HTML read from src with src as its base, so relative links resolve', () => {
		render(
			<WebView src="https://store.test/receipt/1/?key=k" srcDoc="<p>hi</p>" onMessage={() => {}} />
		);
		expect(sources[0]).toEqual({
			html: '<p>hi</p>',
			baseUrl: 'https://store.test/receipt/1/?key=k',
		});
	});

	it('shows inline HTML without a base when there is no src', () => {
		render(<WebView srcDoc="<p>hi</p>" onMessage={() => {}} />);
		expect(sources[0]).toEqual({ html: '<p>hi</p>' });
	});
});

describe('WebView native postMessage bridge', () => {
	beforeEach(() => {
		injectJavaScriptMock.mockClear();
	});

	it('dispatches app messages on window and document for native payment pages', () => {
		const ref = React.createRef<WebViewHandle>();

		render(<WebView ref={ref} src="https://example.test" onMessage={() => {}} />);

		ref.current?.postMessage({ action: 'wcpos-process-payment' });

		expect(injectJavaScriptMock).toHaveBeenCalledTimes(1);
		const injectedScript = injectJavaScriptMock.mock.calls[0]?.[0] as string;
		expect(injectedScript).toContain("new MessageEvent('message', eventInit)");
		expect(injectedScript).toContain(
			"event.initMessageEvent(\n\t\t\t\t\t\t\t\t\t\t'message',\n\t\t\t\t\t\t\t\t\t\tfalse,"
		);
		expect(injectedScript).toContain('dispatchMessage(window)');
		expect(injectedScript).toContain('dispatchMessage(document)');
		expect(injectedScript).toContain('wcpos-process-payment');
	});
});

// react-native-webview 14.0.1 on Android (RNCWebViewClient.onReceivedError) emits a FINISH
// before the error, so `onLoad` fires for a document that never loaded; the error page's
// history entry then fires `onLoadStart` for the same URL (doUpdateVisitedHistory). Run
// 38478468639 (Android phone, flow 04).
describe('WebView native load events', () => {
	const PAY_URL = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';
	const renderEngine = (src = PAY_URL) => {
		const host = { onLoad: jest.fn(), onLoadStart: jest.fn(), onError: jest.fn() };
		const view = render(<WebView src={src} onMessage={() => {}} {...host} />);
		return { ...host, view };
	};
	const nav = (url?: string) => ({ nativeEvent: url ? { url, loading: false } : {} });
	const fail = (url?: string) => ({
		nativeEvent: {
			...(url ? { url } : {}),
			code: -6,
			description: 'net::ERR_SOCKET_NOT_CONNECTED',
		},
	});
	const retracted = (host: { onError: jest.Mock }) =>
		host.onError.mock.calls.map(([event]) => event.nativeEvent.retractsLoad);

	it('Android, first document: the error retracts the synthetic finish; the error page starts nothing', () => {
		const host = renderEngine();
		rnProps().onLoad(nav(PAY_URL));
		rnProps().onError(fail(PAY_URL));
		rnProps().onLoadStart(nav(PAY_URL));
		rnProps().onLoadStart(nav('chrome-error://chromewebdata/'));
		expect(host.onLoad).toHaveBeenCalledTimes(1);
		expect(retracted(host)).toEqual([true]);
		expect(host.onError.mock.calls[0][0].nativeEvent).toMatchObject({
			code: -6,
			description: 'net::ERR_SOCKET_NOT_CONNECTED',
		});
		expect(host.onLoadStart).not.toHaveBeenCalled();
	});

	it('Android, later navigation: the gateway error retracts only its own synthetic finish', () => {
		const host = renderEngine();
		const gateway = 'https://gateway.example.com/hosted/abc';
		rnProps().onLoad(nav(PAY_URL));
		rnProps().onLoad(nav(gateway));
		rnProps().onError(fail(gateway));
		rnProps().onLoadStart(nav(gateway));
		expect(retracted(host)).toEqual([true]);
		expect(host.onLoadStart).not.toHaveBeenCalled();
	});

	it('iOS: a form post back to the loaded URL that errors retracts nothing (a start came between)', () => {
		const host = renderEngine();
		rnProps().onLoad(nav(PAY_URL));
		rnProps().onLoadStart(nav(PAY_URL));
		rnProps().onError(fail(PAY_URL));
		expect(host.onLoadStart).toHaveBeenCalledTimes(1);
		expect(retracted(host)).toEqual([false]);
	});

	it('iOS: an error naming another URL than the loaded document retracts nothing', () => {
		const host = renderEngine();
		rnProps().onLoad(nav('https://shop.example.com/pay'));
		rnProps().onError(fail('https://gateway.example.com/a'));
		expect(retracted(host)).toEqual([false]);
	});

	it('an error that names no URL retracts nothing', () => {
		const host = renderEngine();
		rnProps().onLoad(nav());
		rnProps().onError(fail());
		expect(retracted(host)).toEqual([false]);
	});

	it('a load after an error clears it: a later navigation to that URL is reported', () => {
		const host = renderEngine();
		rnProps().onError(fail(PAY_URL));
		rnProps().onLoad(nav(PAY_URL));
		rnProps().onLoadStart(nav(PAY_URL));
		expect(host.onLoadStart).toHaveBeenCalledTimes(1);
	});
});

// Revert: hand the host the raw string, so readPayPageMessage never sees the plugin's object.
describe('WebView native pay page session signal', () => {
	it('parses the JSON string ReactNativeWebView.postMessage delivers into the object', () => {
		const onMessage = jest.fn();
		render(<WebView src="https://shop.example.com/order-pay/42" onMessage={onMessage} />);
		rnProps().onMessage({
			nativeEvent: { data: '{"action":"wcpos-session-expired","orderId":"42"}' },
		});
		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(onMessage.mock.calls[0][0].nativeEvent.data).toEqual({
			action: 'wcpos-session-expired',
			orderId: '42',
		});
	});
});

describe('WebView native message origin', () => {
	const STORE = 'https://shop.example.com';
	const MESSAGE = JSON.stringify({
		action: 'host-ping',
		payload: { data: { id: 1 } },
	});

	const renderPinned = () => {
		const onMessage = jest.fn();
		render(
			<WebView src={`${STORE}/checkout/order-pay/42/`} targetOrigin={STORE} onMessage={onMessage} />
		);
		return onMessage;
	};

	it("forwards the pinned origin's own page, with its data parsed", () => {
		const onMessage = renderPinned();
		rnProps().onMessage({
			nativeEvent: { url: `${STORE}/checkout/order-received/42/?key=k`, data: MESSAGE },
		});
		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(onMessage.mock.calls[0][0].nativeEvent.data).toEqual(JSON.parse(MESSAGE));
	});

	it('drops a message from another origin', () => {
		const onMessage = renderPinned();
		rnProps().onMessage({
			nativeEvent: { url: 'https://gateway.example.net/return', data: MESSAGE },
		});
		expect(onMessage).not.toHaveBeenCalled();
	});

	it('drops hosts that only begin with the pinned origin', () => {
		const onMessage = renderPinned();
		rnProps().onMessage({
			nativeEvent: { url: 'https://shop.example.com.evil.test/x', data: MESSAGE },
		});
		rnProps().onMessage({
			nativeEvent: { url: 'https://shop.example.com@evil.test/x', data: MESSAGE },
		});
		expect(onMessage).not.toHaveBeenCalled();
	});

	it('drops a message that names no parseable sender', () => {
		const onMessage = renderPinned();
		rnProps().onMessage({ nativeEvent: { data: MESSAGE } });
		rnProps().onMessage({ nativeEvent: { url: '', data: MESSAGE } });
		rnProps().onMessage({ nativeEvent: { url: 'not a url', data: MESSAGE } });
		expect(onMessage).not.toHaveBeenCalled();
	});

	it('drops a message from another origin before parsing it', () => {
		const onMessage = renderPinned();
		rnProps().onMessage({ nativeEvent: { url: 'https://gateway.example.net/', data: 'not json' } });
		rnProps().onMessage({
			nativeEvent: { url: 'https://gateway.example.net/', data: { action: 'x' } },
		});
		expect(onMessage).not.toHaveBeenCalled();
	});

	it('forwards any sender when no origin is pinned', () => {
		const onMessage = jest.fn();
		render(<WebView src={`${STORE}/checkout/order-pay/42/`} onMessage={onMessage} />);
		rnProps().onMessage({ nativeEvent: { url: 'https://anything.example.org/', data: MESSAGE } });
		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(onMessage.mock.calls[0][0].nativeEvent.data).toEqual(JSON.parse(MESSAGE));
	});
});
