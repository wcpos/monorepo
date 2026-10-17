import type { Fetcher } from '@wcpos/sync-core';

import { type EngineTimers, systemTimers } from '../engine-timers';

/** Below the 60 s claim lease, but allows a slow store's order create to finish. */
export const WRITE_DRAIN_REQUEST_TIMEOUT_MS = 30_000;

export class RequestTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`request timed out after ${timeoutMs} ms`);
		this.name = 'TimeoutError';
	}
}

export function withRequestTimeout<T>(
	fetcher: (...args: Parameters<Fetcher>) => Promise<T>,
	timeoutMs: number,
	timers: EngineTimers = systemTimers
): (...args: Parameters<Fetcher>) => Promise<T> {
	return async (url, init) => {
		const controller = new AbortController();
		let callerAborted = false;
		let rejectDeadline!: (error: Error) => void;
		const deadline = new Promise<never>((_, reject) => {
			rejectDeadline = reject;
		});
		const abortError = () => Object.assign(new Error('request aborted'), { name: 'AbortError' });
		const abort = () => {
			callerAborted = true;
			// Abort the transport first so a transport that answers an abort with its own
			// AbortError keeps that identity; then settle the race ourselves for a transport that
			// ignores the signal. A transport that answers with a plain Error is renamed below.
			controller.abort();
			rejectDeadline(abortError());
		};
		if (init?.signal?.aborted) {
			abort();
		} else {
			init?.signal?.addEventListener('abort', abort, { once: true });
		}
		let timedOut = false;
		const handle = timers.setTimeout(() => {
			timedOut = true;
			rejectDeadline(new RequestTimeoutError(timeoutMs));
			controller.abort();
		}, timeoutMs);
		try {
			return await Promise.race([fetcher(url, { ...init, signal: controller.signal }), deadline]);
		} catch (error) {
			if (timedOut) throw new RequestTimeoutError(timeoutMs);
			if (callerAborted && (error as { name?: unknown } | null)?.name !== 'AbortError') {
				throw abortError();
			}
			throw error;
		} finally {
			timers.clearTimeout(handle);
			init?.signal?.removeEventListener('abort', abort);
		}
	};
}
