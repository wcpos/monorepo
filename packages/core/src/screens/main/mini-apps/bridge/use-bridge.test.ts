/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import type { WebViewHandle } from '@wcpos/components/webview';

import { useBridge } from './use-bridge';

jest.mock('uuid', () => ({ v4: () => 'generated-id' }));

const origin = 'https://mini-app.example';

function setup(handlers: Record<string, (payload: Record<string, unknown>) => Promise<object>>) {
	const postMessage = jest.fn();
	const ref = { current: { postMessage } } as unknown as React.RefObject<WebViewHandle>;
	const hook = renderHook(() => useBridge(ref, origin, handlers));
	const receive = (data: unknown, url = `${origin}/index.html`) =>
		hook.result.current.onMessage({ nativeEvent: { data, url } });

	return { ...hook, postMessage, receive };
}

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

	it('echoes the id and action on success', async () => {
		const { postMessage, receive } = setup({
			'test.action': async () => ({ ok: true }),
		});

		await act(async () => receive(envelope()));

		expect(postMessage).toHaveBeenCalledWith({
			wcpos: 1,
			id: 'request-1',
			action: 'test.action',
			payload: { ok: true },
		});
	});

	it('returns timeout when a handler exceeds its action limit', async () => {
		jest.useFakeTimers();
		const { postMessage, receive } = setup({
			'test.action': () => new Promise(() => undefined),
		});
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
});
