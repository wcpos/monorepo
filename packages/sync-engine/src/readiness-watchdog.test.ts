import { describe, expect, it, vi } from 'vitest';

import { armReadinessWatchdog } from './readiness-watchdog';

import type { EngineTimers } from './engine-timers';

function deferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function timerHarness() {
	const callbacks: (() => void)[] = [];
	const unref = vi.fn();
	const timers: EngineTimers = {
		setTimeout: (callback) => {
			callbacks.push(callback);
			return callbacks.length as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimeout: vi.fn(),
		setInterval: vi.fn(),
		clearInterval: vi.fn(),
		unref,
	};
	return { callbacks, timers, unref };
}

describe('armReadinessWatchdog', () => {
	it('reports the current stalled phase and rearms with unref', () => {
		const ready = deferred<void>();
		const diagnostics = vi.fn();
		const { callbacks, timers, unref } = timerHarness();
		let now = 100;
		armReadinessWatchdog({
			ready: ready.promise,
			phase: () => ({ phase: 'create-database', sinceMs: 105 }),
			now: () => now,
			diagnostics,
			timers,
			firstStallMs: 10,
			repeatStallMs: 20,
		});
		now = 130;
		callbacks[0]!();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'engine.ready-stalled',
				fields: { phase: 'create-database', elapsedMs: 30, phaseElapsedMs: 25 },
			})
		);
		expect(unref).toHaveBeenCalledTimes(2);
	});

	it('stops and reports readiness when the promise resolves', async () => {
		const ready = deferred<void>();
		const diagnostics = vi.fn();
		const { timers } = timerHarness();
		armReadinessWatchdog({
			ready: ready.promise,
			phase: () => ({ phase: 'idle', sinceMs: 0 }),
			now: () => 25,
			diagnostics,
			timers,
		});
		ready.resolve();
		await ready.promise;
		await Promise.resolve();
		expect(timers.clearTimeout).toHaveBeenCalledTimes(1);
		expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ type: 'engine.ready' }));
	});

	it('reports the current phase when the promise rejects', async () => {
		const ready = deferred<void>();
		const diagnostics = vi.fn();
		const { timers } = timerHarness();
		armReadinessWatchdog({
			ready: ready.promise,
			phase: () => ({ phase: 'bootstrap', sinceMs: 0 }),
			now: () => 25,
			diagnostics,
			timers,
		});
		ready.reject(new Error('broken'));
		await expect(ready.promise).rejects.toThrow('broken');
		await Promise.resolve();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'engine.ready-failed',
				fields: { phase: 'bootstrap', elapsedMs: 0 },
			})
		);
	});
});
