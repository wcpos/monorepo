import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

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

		const frameWindow = ref.current!.contentWindow!;

		act(() => {
			window.dispatchEvent(
				new MessageEvent('message', { data: { ok: false }, origin: 'https://other.example' })
			);
			// Right origin, wrong window: another page on the same shared host.
			window.dispatchEvent(
				new MessageEvent('message', {
					data: { ok: false },
					origin: 'https://mini-app.example',
					source: window,
				})
			);
			window.dispatchEvent(
				new MessageEvent('message', {
					data: { ok: true },
					origin: 'https://mini-app.example',
					source: frameWindow,
				})
			);
			ref.current?.postMessage('hello');
		});

		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(onMessage.mock.calls[0][0].nativeEvent.data).toEqual({ ok: true });
		expect(framePostMessage).toHaveBeenCalledWith('hello', 'https://mini-app.example');
	});
});

// Revert: drop testID at the web wrapper so receipt previews cannot be located without DOM selectors.
it('exposes the caller testID on the actual preview iframe', async () => {
	const ref = React.createRef<WebViewHandle>();
	await act(async () => {
		render(
			<WebView
				ref={ref}
				testID="receipt-preview"
				srcDoc="<p>Closure 42</p>"
				onMessage={jest.fn()}
			/>
		);
	});
	expect(screen.getByTestId('receipt-preview')).toBe(ref.current);
	expect(screen.getByTestId('receipt-preview').getAttribute('srcdoc')).toBe('<p>Closure 42</p>');
});

// Revert: show a page read from src as bare srcDoc, so its relative links resolve against the app.
describe('WebView web base for a page read from src', () => {
	const renderFrame = (props: { src?: string; srcDoc: string }) => {
		render(<WebView ref={React.createRef()} testID="frame" onMessage={jest.fn()} {...props} />);
		return screen.getByTestId('frame');
	};

	it('puts src in a base tag after the opening head tag and does not navigate to it', () => {
		const frame = renderFrame({
			src: 'https://store.test/r/?key=k&mode=live',
			srcDoc: '<html><head lang="en"><title>R</title></head><body>R</body></html>',
		});
		expect(frame.getAttribute('srcdoc')).toBe(
			'<html><head lang="en"><base href="https://store.test/r/?key=k&amp;mode=live"><title>R</title></head><body>R</body></html>'
		);
		expect(frame.getAttribute('src')).toBeNull();
	});

	it('prepends the base tag to a document without a head', () => {
		const frame = renderFrame({ src: 'https://store.test/r', srcDoc: '<p>R</p>' });
		expect(frame.getAttribute('srcdoc')).toBe('<base href="https://store.test/r"><p>R</p>');
	});

	it('leaves inline HTML untouched when there is no src', () => {
		const frame = renderFrame({ srcDoc: '<head></head><p>R</p>' });
		expect(frame.getAttribute('srcdoc')).toBe('<head></head><p>R</p>');
	});
});
