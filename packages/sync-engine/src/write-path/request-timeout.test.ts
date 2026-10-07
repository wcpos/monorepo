import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fetcher } from '@wcpos/sync-core';

import {
	RequestTimeoutError,
	withRequestTimeout,
	WRITE_DRAIN_REQUEST_TIMEOUT_MS,
} from './request-timeout';

const abortError = Object.assign(new Error('request aborted'), { name: 'AbortError' });
const neverAnswers: Fetcher = (_url, init) =>
	new Promise<Response>((_resolve, reject) => {
		if (init?.signal?.aborted) {
			reject(abortError);
		} else {
			init?.signal?.addEventListener('abort', () => reject(abortError), { once: true });
		}
	});

describe('withRequestTimeout', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('rejects with RequestTimeoutError and aborts the request when the fetcher never answers', async () => {
		const fetcher = vi.fn(neverAnswers);
		const settled = vi.fn();
		const result = withRequestTimeout(
			fetcher,
			WRITE_DRAIN_REQUEST_TIMEOUT_MS
		)('/push/orders').then(settled, settled);
		vi.advanceTimersByTime(29_999);
		await Promise.resolve();
		expect(settled).not.toHaveBeenCalled();
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
		vi.advanceTimersByTime(1);
		await result;
		const error = settled.mock.calls[0][0];
		expect(error).toBeInstanceOf(RequestTimeoutError);
		expect(error.name).toBe('TimeoutError');
		expect(error.message).toBe('request timed out after 30000 ms');
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('returns the response and clears its timer when the fetcher answers in time', async () => {
		const response = new Response('{}', { status: 201 });
		const fetcher = vi.fn<Fetcher>().mockResolvedValue(response);
		await expect(
			withRequestTimeout(fetcher, WRITE_DRAIN_REQUEST_TIMEOUT_MS)('/push/orders')
		).resolves.toBe(response);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a caller abort rejects with the caller's AbortError, not a timeout", async () => {
		const caller = new AbortController();
		const result = withRequestTimeout(neverAnswers, WRITE_DRAIN_REQUEST_TIMEOUT_MS)(
			'/push/orders',
			{
				signal: caller.signal,
			}
		);
		caller.abort();
		await expect(result).rejects.toBe(abortError);
		await expect(result).rejects.toHaveProperty('name', 'AbortError');
		await expect(result).rejects.not.toBeInstanceOf(RequestTimeoutError);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('an already-aborted caller signal reaches the fetcher aborted', async () => {
		const caller = new AbortController();
		caller.abort();
		const fetcher = vi.fn<Fetcher>((url, init) => {
			expect(init?.signal?.aborted).toBe(true);
			return neverAnswers(url, init);
		});
		await expect(
			withRequestTimeout(fetcher, WRITE_DRAIN_REQUEST_TIMEOUT_MS)('/push/orders', {
				signal: caller.signal,
			})
		).rejects.toBe(abortError);
		expect(fetcher).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("forwards the caller's RequestInit fields", async () => {
		const response = new Response('{}', { status: 201 });
		const fetcher = vi.fn<Fetcher>().mockResolvedValue(response);
		const init = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'mutation-1' },
			body: '{"order":1}',
			signal: new AbortController().signal,
		};
		await withRequestTimeout(fetcher, WRITE_DRAIN_REQUEST_TIMEOUT_MS)('/push/orders', init);
		const forwarded = fetcher.mock.calls[0][1] as RequestInit;
		expect(fetcher.mock.calls[0][0]).toBe('/push/orders');
		expect(forwarded.method).toBe(init.method);
		expect(forwarded.headers).toBe(init.headers);
		expect(forwarded.body).toBe(init.body);
	});
});
