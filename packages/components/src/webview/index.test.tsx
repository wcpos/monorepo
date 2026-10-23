import * as React from 'react';

import { render } from '@testing-library/react';

import { WebView, WebViewHandle } from './index';

const injectJavaScriptMock = jest.fn();
const sources: unknown[] = [];

jest.mock('react-native-webview', () => {
	return {
		WebView: React.forwardRef(function MockRNWebView(
			props: Record<string, unknown>,
			ref: React.ForwardedRef<{ injectJavaScript: (script: string) => void }>
		) {
			sources.push(props.source);
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
