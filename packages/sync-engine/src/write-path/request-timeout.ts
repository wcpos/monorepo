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

export function withRequestTimeout(
	fetcher: Fetcher,
	timeoutMs: number,
	timers: EngineTimers = systemTimers
): Fetcher {
	return async (url, init) => {
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (init?.signal?.aborted) {
			abort();
		} else {
			init?.signal?.addEventListener('abort', abort, { once: true });
		}
		let timedOut = false;
		const handle = timers.setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);
		try {
			return await fetcher(url, { ...init, signal: controller.signal });
		} catch (error) {
			if (timedOut) throw new RequestTimeoutError(timeoutMs);
			throw error;
		} finally {
			timers.clearTimeout(handle);
			init?.signal?.removeEventListener('abort', abort);
		}
	};
}
