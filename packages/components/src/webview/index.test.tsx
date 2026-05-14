import * as React from 'react';

import { render } from '@testing-library/react';

import { WebView, WebViewHandle } from './index';

const injectJavaScriptMock = jest.fn();

jest.mock('react-native-webview', () => {
	return {
		WebView: React.forwardRef(function MockRNWebView(
			_props: Record<string, unknown>,
			ref: React.ForwardedRef<{ injectJavaScript: (script: string) => void }>
		) {
			React.useImperativeHandle(ref, () => ({
				injectJavaScript: injectJavaScriptMock,
			}));
			return null;
		}),
	};
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
		expect(injectedScript).toContain('dispatchMessage(window)');
		expect(injectedScript).toContain('dispatchMessage(document)');
		expect(injectedScript).toContain('wcpos-process-payment');
	});
});
