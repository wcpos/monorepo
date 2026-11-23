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

// Revert: drop the origin/source pin, so any window may post the pay page's session signal.
describe('WebView web pay page session signal', () => {
	const STORE = 'https://shop.example.com';
	const SIGNAL = { action: 'wcpos-session-expired', orderId: 42 };

	it('hands the plugin signal from the store frame to onMessage unchanged; another origin is dropped', () => {
		const onMessage = jest.fn();
		const ref = React.createRef<WebViewHandle>();
		render(
			<WebView
				ref={ref}
				src={`${STORE}/wcpos-checkout/order-pay/42?token=jwt-token`}
				targetOrigin={STORE}
				onMessage={onMessage}
			/>
		);
		const source = ref.current!.contentWindow!;
		act(() => {
			window.dispatchEvent(
				new MessageEvent('message', { data: SIGNAL, origin: 'https://other.example', source })
			);
		});
		expect(onMessage).not.toHaveBeenCalled();
		act(() => {
			window.dispatchEvent(new MessageEvent('message', { data: SIGNAL, origin: STORE, source }));
		});
		expect(onMessage).toHaveBeenCalledTimes(1);
		expect(onMessage.mock.calls[0][0].nativeEvent.data).toBe(SIGNAL);
	});
});

// Revert: give every srcDoc frame allow-same-origin, so a fetched page runs as the app.
describe('WebView web sandbox for inline HTML', () => {
	const tokens = (frame: HTMLElement) => (frame.getAttribute('sandbox') ?? '').split(/\s+/);

	it('a srcDoc frame is sandboxed without allow-same-origin', () => {
		render(
			<WebView
				testID="page"
				src="https://store.test/r"
				srcDoc="<p>Server receipt</p>"
				onMessage={jest.fn()}
			/>
		);
		const page = tokens(screen.getByTestId('page'));
		expect(page).not.toContain('allow-same-origin');
		expect(page).toEqual(
			expect.arrayContaining(['allow-scripts', 'allow-forms', 'allow-popups', 'allow-modals'])
		);
		// A frame that loads a URL keeps its own origin (pay page, mini-app).
		render(<WebView testID="url" src="https://store.test/pay" onMessage={jest.fn()} />);
		expect(tokens(screen.getByTestId('url'))).toContain('allow-same-origin');
	});

	// Revert: give a trustedSrcDoc frame allow-scripts next to allow-same-origin again.
	it('a trustedSrcDoc frame keeps allow-same-origin without allow-scripts', () => {
		render(<WebView testID="local" srcDoc="<p>Receipt</p>" trustedSrcDoc onMessage={jest.fn()} />);
		const local = tokens(screen.getByTestId('local'));
		expect(local).not.toContain('allow-scripts');
		expect(local).toEqual(
			expect.arrayContaining(['allow-forms', 'allow-popups', 'allow-same-origin', 'allow-modals'])
		);
	});

	it('a URL frame keeps both allow-scripts and allow-same-origin', () => {
		render(<WebView testID="url" src="https://store.test/pay" onMessage={jest.fn()} />);
		expect(tokens(screen.getByTestId('url'))).toEqual(
			expect.arrayContaining(['allow-scripts', 'allow-same-origin'])
		);
	});
});

// Revert: drop the source, token or shape checks, the clamps or the 2 MB cap on the frame's
// messages, or the frame script itself, and a page sizes the app or feeds print at will.
describe('WebView web bridge for an untrusted srcDoc frame', () => {
	const tokenOf = (frame: HTMLElement) =>
		/var T="([^"]+)"/.exec(frame.getAttribute('srcdoc') ?? '')?.[1];
	const renderPage = (srcDoc: string, onContentSizeChange = jest.fn()) => {
		const ref = React.createRef<WebViewHandle>();
		render(
			<WebView
				ref={ref}
				testID="page"
				src="https://store.test/r"
				srcDoc={srcDoc}
				onMessage={jest.fn()}
				onContentSizeChange={onContentSizeChange}
			/>
		);
		const frame = screen.getByTestId('page') as HTMLIFrameElement;
		return { ref, frame, frameWindow: frame.contentWindow!, token: tokenOf(frame) };
	};
	const post = (data: unknown, source: Window) =>
		window.dispatchEvent(new MessageEvent('message', { data, source }));

	afterEach(() => jest.restoreAllMocks());

	it('sizes the frame only from its own window with its token, clamped', () => {
		const onContentSizeChange = jest.fn();
		const { frameWindow, token } = renderPage('<p>Server receipt</p>', onContentSizeChange);
		expect(token).toMatch(/^[0-9a-z]{8,}$/);
		act(() => {
			post({ type: 'wcpos-frame', token, width: 300, height: 700 }, window);
			post({ type: 'wcpos-frame', token: 'guess', width: 300, height: 700 }, frameWindow);
			post({ type: 'wcpos-frame', token, width: '300', height: 700 }, frameWindow);
			post({ type: 'wcpos-frame', token, width: 300, height: -1 }, frameWindow);
			post({ type: 'wcpos-frame', token, width: 300, height: 1e9 }, frameWindow);
			post({ type: 'wcpos-frame', token, width: 10, height: 700 }, frameWindow);
		});
		expect(onContentSizeChange.mock.calls.map(([event]) => event.nativeEvent.contentSize)).toEqual([
			{ width: 300, height: 20000 },
			{ width: 50, height: 700 },
		]);
	});

	it('takes the rendered copy only from its own window with its token, up to 2 MB', async () => {
		const { ref, frameWindow, token } = renderPage('<p>Server receipt</p>');
		const ask = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => {});

		const tooLarge = ref.current!.requestRenderedHtml();
		expect(ask).toHaveBeenCalledWith({ type: 'wcpos-frame-html' }, '*');
		post({ type: 'wcpos-frame', token, html: 'x'.repeat(2_000_001) }, frameWindow);
		await expect(tooLarge).resolves.toBeNull();

		const copy = ref.current!.requestRenderedHtml();
		post({ type: 'wcpos-frame', token, html: '<p>Forged</p>' }, window);
		post({ type: 'wcpos-frame', token: 'guess', html: '<p>Forged</p>' }, frameWindow);
		post({ type: 'wcpos-frame', token, html: '<p>Rendered</p>' }, frameWindow);
		await expect(copy).resolves.toBe('<p>Rendered</p>');
	});

	// Revert: let a re-render rewrite the sandbox of a frame that already holds a page.
	it('a frame keeps the sandbox it was created with; a change of trust is a new frame', async () => {
		const ref = React.createRef<WebViewHandle>();
		const props = {
			ref,
			testID: 'page',
			src: 'https://store.test/r',
			onMessage: jest.fn(),
			onContentSizeChange: jest.fn(),
		};
		const { rerender } = render(<WebView {...props} srcDoc="<p>One</p>" />);
		const frame = screen.getByTestId('page') as HTMLIFrameElement;
		const created = frame.getAttribute('sandbox');
		expect(created).toBe('allow-scripts allow-forms allow-popups allow-modals');
		const changes: MutationRecord[] = [];
		const observer = new MutationObserver((records) => changes.push(...records));
		observer.observe(frame, { attributes: true, attributeFilter: ['sandbox'] });
		const token = tokenOf(frame);
		jest.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});

		// Resize, print and a re-render with new HTML all reuse the frame as it was made.
		act(() => post({ type: 'wcpos-frame', token, width: 300, height: 700 }, frame.contentWindow!));
		const copy = ref.current!.requestRenderedHtml();
		post({ type: 'wcpos-frame', token, html: '<p>One</p>' }, frame.contentWindow!);
		await expect(copy).resolves.toBe('<p>One</p>');
		rerender(<WebView {...props} srcDoc="<p>Two</p>" />);
		expect(screen.getByTestId('page')).toBe(frame);

		rerender(<WebView {...props} srcDoc="<p>Two</p>" trustedSrcDoc />);
		changes.push(...observer.takeRecords());
		observer.disconnect();
		expect(changes).toEqual([]);
		expect(frame.getAttribute('sandbox')).toBe(created);
		expect(frame.isConnected).toBe(false);
		expect(screen.getByTestId('page').getAttribute('sandbox')).toContain('allow-same-origin');
	});

	it('the frame script reports its size and copies a script-filled body, canvas as image', async () => {
		const onContentSizeChange = jest.fn();
		const { ref, frame, frameWindow } = renderPage('<p>Server receipt</p>', onContentSizeChange);
		// jsdom's postMessage carries no source; deliver each message as a browser does.
		jest.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
			post(data, frameWindow);
		});
		jest.spyOn(frameWindow, 'postMessage').mockImplementation((data: unknown) => {
			frameWindow.dispatchEvent(
				new (frameWindow as any).MessageEvent('message', { data, source: window })
			);
		});
		jest
			.spyOn((frameWindow as any).HTMLCanvasElement.prototype, 'toDataURL')
			.mockReturnValue('data:image/png;base64,QkFSQ09ERQ==');
		const doc = frameWindow.document;
		doc.body.innerHTML = '<p id="total"></p><canvas class="qr" width="40" height="40"></canvas>';
		// The page's own script filled the total; the source still reads empty.
		doc.getElementById('total')!.textContent = 'Scripted total';
		Object.defineProperty(doc.body, 'scrollWidth', { configurable: true, value: 302 });
		Object.defineProperty(doc.body, 'scrollHeight', { configurable: true, value: 640 });
		const script = doc.createElement('script');
		// The frame script is the last element of the srcdoc; run its text in the fake frame.
		const srcdoc = frame.getAttribute('srcdoc')!;
		const open = '<script>';
		script.textContent = srcdoc.slice(
			srcdoc.lastIndexOf(open) + open.length,
			srcdoc.lastIndexOf('</script>')
		);
		doc.body.appendChild(script);

		act(() => {
			frameWindow.dispatchEvent(new (frameWindow as any).Event('load'));
		});
		expect(onContentSizeChange).toHaveBeenCalledWith({
			nativeEvent: { contentSize: { width: 302, height: 640 } },
		});

		const html = await ref.current!.requestRenderedHtml();
		expect(html).toContain('Scripted total');
		expect(html).toMatch(/<img [^>]*src="data:image\/png;base64,QkFSQ09ERQ=="[^>]*class="qr"/);
		expect(html).not.toContain('<canvas');
	});
});
