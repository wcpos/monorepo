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

export function withRequestTimeout<Result>(
	fetcher: (url: string, init?: Parameters<Fetcher>[1]) => Promise<Result>,
	timeoutMs: number,
	timers: EngineTimers = systemTimers
): typeof fetcher {
	return async (url, init) => {
		const controller = new AbortController();
		let timedOut = false;
		let rejectDeadline!: (error: Error) => void;
		const deadline = new Promise<never>((_, reject) => {
			rejectDeadline = reject;
		});
		const abort = () => {
			controller.abort();
			rejectDeadline(Object.assign(new Error('request aborted'), { name: 'AbortError' }));
		};
		if (init?.signal?.aborted) {
			abort();
		} else {
			init?.signal?.addEventListener('abort', abort, { once: true });
		}
		const handle = timers.setTimeout(() => {
			timedOut = true;
			rejectDeadline(new RequestTimeoutError(timeoutMs));
			controller.abort();
		}, timeoutMs);
		try {
			return await Promise.race([fetcher(url, { ...init, signal: controller.signal }), deadline]);
		} catch (error) {
			if (timedOut) throw new RequestTimeoutError(timeoutMs);
			throw error;
		} finally {
			timers.clearTimeout(handle);
			init?.signal?.removeEventListener('abort', abort);
		}
	};
}
