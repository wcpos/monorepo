import * as React from 'react';

import { act, render } from '@testing-library/react';

import { WebView, type WebViewHandle } from './index.web';

jest.mock('../loader', () => ({ Loader: () => null }));

describe('WebView web target origin', () => {
	it('pins incoming and outgoing messages when targetOrigin is set', () => {
		const onMessage = jest.fn();
		const ref = React.createRef<WebViewHandle>();
		render(
			<WebView
				ref={ref}
				src="https://mini-app.example/index.html"
				targetOrigin="https://mini-app.example"
				onMessage={onMessage}
			/>
		);
		const framePostMessage = jest.spyOn(ref.current!.contentWindow!, 'postMessage');

		act(() => {
			window.dispatchEvent(
				new MessageEvent('message', { data: { ok: false }, origin: 'https://other.example' })
			);
			window.dispatchEvent(
				new MessageEvent('message', { data: { ok: true }, origin: 'https://mini-app.example' })
			);
			ref.current?.postMessage('hello');
		});

		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(framePostMessage).toHaveBeenCalledWith('hello', 'https://mini-app.example');
	});
});
