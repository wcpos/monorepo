/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import type { WebViewHandle } from '@wcpos/components/webview';

import { useBridge } from './use-bridge';

jest.mock('uuid', () => ({ v4: () => 'generated-id' }));

const origin = 'https://mini-app.example';

function setup(
	handlers: Record<string, (payload: Record<string, unknown>) => Promise<object>>,
	pin = origin
) {
	const postMessage = jest.fn();
	const ref = { current: { postMessage } } as unknown as React.RefObject<WebViewHandle>;
	const hook = renderHook(() => useBridge(ref, pin, handlers));
	const receive = (data: unknown, url: string | undefined = `${pin}/index.html`) =>
		hook.result.current.onMessage({ nativeEvent: url === undefined ? { data } : { data, url } });
	const handshake = () =>
		act(async () => receive({ wcpos: 1, id: 'ready-1', action: 'app.ready', payload: {} }));

	return { ...hook, postMessage, receive, handshake };
}

const READY_HANDLER = { 'app.ready': async () => ({ locale: 'en' }) };

const envelope = (overrides: Record<string, unknown> = {}) => ({
	wcpos: 1,
	id: 'request-1',
	action: 'test.action',
	payload: {},
	...overrides,
});

describe('useBridge', () => {
	it('drops malformed and wrong-origin messages', async () => {
		const handler = jest.fn(async () => ({}));
		const { postMessage, receive } = setup({ 'test.action': handler });

		await act(async () => {
			await receive('{not-json');
			await receive(envelope({ extra: true }));
			await receive(envelope(), 'https://other.example/index.html');
		});

		expect(handler).not.toHaveBeenCalled();
		expect(postMessage).not.toHaveBeenCalled();
	});

	it('a message without a sender URL is dropped when pinned', async () => {
		const { postMessage, receive, result } = setup(READY_HANDLER);

		await act(async () => {
			await receive(envelope({ action: 'app.ready' }), undefined);
		});

		expect(result.current.ready).toBe(false);
		expect(postMessage).not.toHaveBeenCalled();
	});

	it('a message from another jsDelivr path is dropped', async () => {
		const pin = `${origin}/gh/wcpos/mini-apps@1`;
		const handler = jest.fn(async () => ({}));
		const bridge = setup({ ...READY_HANDLER, 'test.action': handler }, pin);

		for (const url of [
			`${origin}/gh/someone/else@1/index.html`,
			`${origin}/gh/wcpos/mini-apps@10/index.html`,
		]) {
			await act(async () => bridge.receive(envelope({ action: 'app.ready' }), url));
		}
		expect(bridge.result.current.ready).toBe(false);
		expect(bridge.postMessage).not.toHaveBeenCalled();

		// The mini-app's own pages, and the web frame (which reports only its origin), still speak.
		await bridge.handshake();
		await act(async () => bridge.receive(envelope(), origin));
		expect(bridge.result.current.ready).toBe(true);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('answers unsupported protocol versions', async () => {
		const { postMessage, receive } = setup({});

		await act(async () => receive(envelope({ wcpos: 2 })));

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'request-1',
				action: 'error',
				payload: expect.objectContaining({ code: 'unsupported_version' }),
			})
		);
	});

	it('denies actions without a granted handler', async () => {
		const { postMessage, receive } = setup({});

		await act(async () => receive(envelope()));

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'error',
				payload: expect.objectContaining({ code: 'capability_denied' }),
			})
		);
	});

	it('refuses every action until the handshake has succeeded', async () => {
		const handler = jest.fn(async () => ({ ok: true }));
		const { postMessage, receive, handshake } = setup({ ...READY_HANDLER, 'test.action': handler });

		await act(async () => receive(envelope()));

		expect(handler).not.toHaveBeenCalled();
		expect(postMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				id: 'request-1',
				action: 'error',
				payload: expect.objectContaining({ code: 'capability_denied' }),
			})
		);

		await handshake();
		await act(async () => receive(envelope()));

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('echoes the id and action on success', async () => {
		const { postMessage, receive, handshake } = setup({
			...READY_HANDLER,
			'test.action': async () => ({ ok: true }),
		});
		await handshake();

		await act(async () => receive(envelope()));

		expect(postMessage).toHaveBeenCalledWith({
			wcpos: 1,
			id: 'request-1',
			action: 'test.action',
			payload: { ok: true },
		});
	});

	it('returns timeout when a handler exceeds its action limit', async () => {
		const { postMessage, receive, handshake } = setup({
			...READY_HANDLER,
			'test.action': () => new Promise(() => undefined),
		});
		await handshake();
		jest.useFakeTimers();
		const request = receive(envelope());

		await act(async () => {
			jest.advanceTimersByTime(5_000);
			await request;
		});

		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'error',
				payload: expect.objectContaining({ code: 'timeout', action: 'test.action' }),
			})
		);
		jest.useRealTimers();
	});

	it('marks the bridge ready and responds with app.init', async () => {
		const bridge = setup({
			'app.ready': async () => ({ locale: 'en' }),
		});

		await act(async () => bridge.receive(envelope({ action: 'app.ready' })));

		expect(bridge.result.current.ready).toBe(true);
		expect(bridge.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'request-1', action: 'app.init' })
		);
	});

	it('requires a new handshake after readiness is reset', async () => {
		const handler = jest.fn(async () => ({ ok: true }));
		const bridge = setup({ ...READY_HANDLER, 'test.action': handler });
		await bridge.handshake();

		act(() => bridge.result.current.reset());
		expect(bridge.result.current.ready).toBe(false);

		await act(async () => bridge.receive(envelope()));
		expect(handler).not.toHaveBeenCalled();

		await bridge.handshake();
		await act(async () => bridge.receive(envelope()));
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
