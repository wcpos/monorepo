/**
 * Electron HTTP adapter: cancellation hooks are attached per request and
 * detached when the request settles, so a long-lived store-scope signal does
 * not collect one listener per request (#2502).
 */
import axios, { isCancel } from 'axios';

import { http } from './http.electron';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}));

// eslint-disable-next-line import/no-named-as-default-member -- the named CancelToken export is type-only
const { CancelToken } = axios;
const invoke = jest.fn();

const success = { success: true, data: 1, status: 200, statusText: 'OK', headers: {} };
const failure = { success: false, name: 'AxiosError', message: 'boom', code: 'ERR_BAD_RESPONSE' };

const spyOnListeners = (signal: AbortSignal) => ({
	add: jest.spyOn(signal, 'addEventListener'),
	remove: jest.spyOn(signal, 'removeEventListener'),
});

const abortListener = (spy: jest.SpyInstance) => {
	const call = spy.mock.calls.find(([type]) => type === 'abort');
	expect(call).toBeDefined();
	return call![1];
};

beforeEach(() => {
	invoke.mockReset();
	window.ipcRenderer = { invoke };
});

describe('http.electron cancellation hooks', () => {
	it('removes the abort listener when the request succeeds', async () => {
		const { signal } = new AbortController();
		const { add, remove } = spyOnListeners(signal);
		invoke.mockResolvedValue(success);

		await expect(http.request({ url: 'x', signal })).resolves.toMatchObject({ data: 1 });

		expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
		expect(remove).toHaveBeenCalledWith('abort', abortListener(add));
	});

	it('removes the abort listener when the main process reports a failure', async () => {
		const { signal } = new AbortController();
		const { add, remove } = spyOnListeners(signal);
		invoke.mockResolvedValue(failure);

		await expect(http.request({ url: 'x', signal })).rejects.toMatchObject({
			message: 'boom',
			code: 'ERR_BAD_RESPONSE',
		});
		expect(remove).toHaveBeenCalledWith('abort', abortListener(add));
	});

	it('removes the abort listener when the IPC call itself rejects', async () => {
		const { signal } = new AbortController();
		const { add, remove } = spyOnListeners(signal);
		invoke.mockRejectedValue(new Error('ipc down'));

		await expect(http.request({ url: 'x', signal })).rejects.toThrow('ipc down');
		expect(remove).toHaveBeenCalledWith('abort', abortListener(add));
	});

	it('leaves no listener behind after many requests on one shared signal', async () => {
		const { signal } = new AbortController();
		const { add, remove } = spyOnListeners(signal);
		invoke.mockResolvedValue(success);

		for (let i = 0; i < 50; i++) {
			await http.request({ url: 'x', signal });
		}

		const count = (spy: jest.SpyInstance) =>
			spy.mock.calls.filter(([type]) => type === 'abort').length;
		expect(count(add)).toBe(50);
		expect(count(add) - count(remove)).toBe(0);
	});

	it('still cancels an in-flight request in the main process on abort', async () => {
		const controller = new AbortController();
		let settle!: (result: unknown) => void;
		invoke.mockImplementation((_channel: string, message: { type: string }) =>
			message.type === 'request'
				? new Promise((resolve) => {
						settle = resolve;
					})
				: Promise.resolve()
		);

		const pending = http.request({ url: 'x', signal: controller.signal });
		controller.abort();

		const requestCall = invoke.mock.calls.find(([, message]) => message.type === 'request');
		expect(invoke).toHaveBeenCalledWith('http-request', {
			type: 'cancel',
			requestId: requestCall![1].requestId,
		});

		settle({ success: false, name: 'CanceledError', message: 'canceled', code: 'ERR_CANCELED' });
		const err = await pending.catch((e: unknown) => e);
		expect(isCancel(err)).toBe(true);
	});

	it('rejects a pre-aborted signal without IPC or a listener', async () => {
		const controller = new AbortController();
		controller.abort();
		const { add } = spyOnListeners(controller.signal);

		const err = await http.request({ url: 'x', signal: controller.signal }).catch((e) => e);

		expect(isCancel(err)).toBe(true);
		expect(invoke).not.toHaveBeenCalled();
		expect(add).not.toHaveBeenCalled();
	});

	it('rejects a pre-cancelled CancelToken without sending the request IPC', async () => {
		const source = CancelToken.source();
		source.cancel();
		invoke.mockResolvedValue(success);

		const err = await http.request({ url: 'x', cancelToken: source.token }).catch((e) => e);

		expect(isCancel(err)).toBe(true);
		expect(invoke).not.toHaveBeenCalled();
	});

	it('unsubscribes from a CancelToken on settle and still cancels through it', async () => {
		const done = CancelToken.source();
		const subscribe = jest.spyOn(done.token, 'subscribe');
		const unsubscribe = jest.spyOn(done.token, 'unsubscribe');
		invoke.mockResolvedValue(success);

		await http.request({ url: 'x', cancelToken: done.token });

		expect(subscribe).toHaveBeenCalledTimes(1);
		expect(unsubscribe).toHaveBeenCalledWith(subscribe.mock.calls[0][0]);
		expect((done.token as unknown as { _listeners?: unknown[] })._listeners ?? []).toHaveLength(0);

		const source = CancelToken.source();
		invoke.mockReset();
		invoke.mockImplementation((_channel: string, message: { type: string }) =>
			message.type === 'request' ? new Promise(() => {}) : Promise.resolve()
		);
		void http.request({ url: 'x', cancelToken: source.token });
		source.cancel();
		await Promise.resolve(); // CancelToken notifies its subscribers on a microtask

		const requestCall = invoke.mock.calls.find(([, message]) => message.type === 'request');
		expect(invoke).toHaveBeenCalledWith('http-request', {
			type: 'cancel',
			requestId: requestCall![1].requestId,
		});
	});
});
