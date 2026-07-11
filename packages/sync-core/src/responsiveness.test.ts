import { describe, expect, it } from 'vitest';

import {
	installHiddenPageIdlePolyfill,
	type PerformanceObserverCtorLike,
	startResponsivenessSampler,
} from './responsiveness';

function createManualRaf() {
	const callbacks = new Map<number, () => void>();
	let nextHandle = 1;
	return {
		raf: (callback: () => void): number => {
			const handle = nextHandle;
			nextHandle += 1;
			callbacks.set(handle, callback);
			return handle;
		},
		caf: (handle: number): void => {
			callbacks.delete(handle);
		},
		fire(): void {
			const pending = [...callbacks.values()];
			callbacks.clear();
			for (const callback of pending) {
				callback();
			}
		},
		pendingCount: (): number => callbacks.size,
	};
}

type FakeObserverEmitter = (durations: number[]) => void;

function createFakeLongTaskObserverCtor(
	options: {
		supportedEntryTypes?: readonly string[];
		observeThrows?: boolean;
		pendingRecords?: number[];
	} = {}
) {
	const state = {
		instances: 0,
		observeCalls: [] as unknown[],
		disconnected: false,
		emit: null as FakeObserverEmitter | null,
	};

	class FakeLongTaskObserver {
		static supportedEntryTypes = options.supportedEntryTypes ?? ['longtask'];

		constructor(callback: (list: { getEntries(): { duration: number }[] }) => void) {
			state.instances += 1;
			state.emit = (durations: number[]) => {
				callback({ getEntries: () => durations.map((duration) => ({ duration })) });
			};
		}

		observe(observeOptions: unknown): void {
			if (options.observeThrows) {
				throw new Error('longtask entry type unsupported');
			}
			state.observeCalls.push(observeOptions);
		}

		disconnect(): void {
			state.disconnected = true;
		}

		takeRecords(): { duration: number }[] {
			return (options.pendingRecords ?? []).map((duration) => ({ duration }));
		}
	}

	return { ctor: FakeLongTaskObserver as unknown as PerformanceObserverCtorLike, state };
}

describe('startResponsivenessSampler', () => {
	it('counts frames with gaps above the 50ms threshold via the injected rAF and clock', () => {
		const manualRaf = createManualRaf();
		let nowMs = 0;
		const sampler = startResponsivenessSampler({
			now: () => nowMs,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: null,
		});

		nowMs = 16;
		manualRaf.fire();
		nowMs = 32;
		manualRaf.fire();
		nowMs = 152; // 120ms gap — a blocked frame window
		manualRaf.fire();
		nowMs = 200; // trailing 48ms gap stays under the threshold

		const metrics = sampler.stop();
		expect(metrics.frameGapCount).toBe(1);
		expect(metrics.frameGapMaxMs).toBe(120);
		expect(metrics.sampledMs).toBe(200);
		expect(metrics.longTaskCount).toBe(0);
		expect(metrics.longTaskTotalMs).toBe(0);
		expect(metrics.longTaskMaxMs).toBe(0);
		expect(manualRaf.pendingCount()).toBe(0);
	});

	it('records the trailing blocked window when no frame ever fires before stop', () => {
		const manualRaf = createManualRaf();
		let nowMs = 0;
		const sampler = startResponsivenessSampler({
			now: () => nowMs,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: null,
		});

		nowMs = 80;
		const metrics = sampler.stop();
		expect(metrics.frameGapCount).toBe(1);
		expect(metrics.frameGapMaxMs).toBe(80);
		expect(metrics.sampledMs).toBe(80);
	});

	it('aggregates long-task entries from the injected observer including stop-time takeRecords', () => {
		const manualRaf = createManualRaf();
		const { ctor, state } = createFakeLongTaskObserverCtor({ pendingRecords: [60] });
		let nowMs = 0;
		const sampler = startResponsivenessSampler({
			now: () => nowMs,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: ctor,
		});

		expect(state.instances).toBe(1);
		expect(state.observeCalls).toEqual([{ type: 'longtask', buffered: false }]);

		state.emit?.([80, 120]);
		nowMs = 40;
		const metrics = sampler.stop();
		expect(metrics.longTaskCount).toBe(3);
		expect(metrics.longTaskTotalMs).toBe(260);
		expect(metrics.longTaskMaxMs).toBe(120);
		expect(state.disconnected).toBe(true);
	});

	it('stays inert when no long-task observer is available (jsdom guard)', () => {
		const manualRaf = createManualRaf();
		let nowMs = 0;
		const sampler = startResponsivenessSampler({
			now: () => nowMs,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: null,
		});
		nowMs = 10;
		const metrics = sampler.stop();
		expect(metrics.longTaskCount).toBe(0);
		expect(metrics.longTaskTotalMs).toBe(0);
		expect(metrics.longTaskMaxMs).toBe(0);
	});

	it('skips observers that do not support the longtask entry type', () => {
		const manualRaf = createManualRaf();
		const { ctor, state } = createFakeLongTaskObserverCtor({ supportedEntryTypes: ['resource'] });
		const sampler = startResponsivenessSampler({
			now: () => 0,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: ctor,
		});
		expect(state.instances).toBe(0);
		expect(sampler.stop().longTaskCount).toBe(0);
	});

	it('guards against observe() throwing at runtime', () => {
		const manualRaf = createManualRaf();
		const { ctor } = createFakeLongTaskObserverCtor({ observeThrows: true });
		const sampler = startResponsivenessSampler({
			now: () => 0,
			requestAnimationFrame: manualRaf.raf,
			cancelAnimationFrame: manualRaf.caf,
			performanceObserverCtor: ctor,
		});
		expect(sampler.stop().longTaskCount).toBe(0);
	});
});

describe('installHiddenPageIdlePolyfill', () => {
	it('does not install while the page is visible', () => {
		const win = { setTimeout, clearTimeout } as unknown as typeof globalThis;
		expect(installHiddenPageIdlePolyfill({ hidden: false }, win)).toBe(false);
		expect((win as { requestIdleCallback?: unknown }).requestIdleCallback).toBeUndefined();
	});

	it('hidden calls run unthrottled via microtasks; cancellation works', async () => {
		const doc = { hidden: true };
		const win = { setTimeout, clearTimeout, queueMicrotask } as unknown as typeof globalThis;
		expect(installHiddenPageIdlePolyfill(doc, win)).toBe(true);
		const target = win as unknown as {
			requestIdleCallback: (cb: (d: { didTimeout: boolean }) => void) => number;
			cancelIdleCallback: (h: number) => void;
		};
		let ran = 0;
		target.requestIdleCallback(() => {
			ran += 1;
		});
		const handle = target.requestIdleCallback(() => {
			ran += 100;
		});
		target.cancelIdleCallback(handle);
		await Promise.resolve();
		await Promise.resolve();
		expect(ran).toBe(1);
	});

	it('delegates to the captured native callback while visible (codex review)', () => {
		const doc = { hidden: true };
		let nativeCalls = 0;
		const win = {
			setTimeout,
			clearTimeout,
			queueMicrotask,
			requestIdleCallback: () => {
				nativeCalls += 1;
				return 7;
			},
			cancelIdleCallback: () => {},
		} as unknown as typeof globalThis;
		installHiddenPageIdlePolyfill(doc, win);
		doc.hidden = false;
		const target = win as unknown as { requestIdleCallback: (cb: () => void) => number };
		const handle = target.requestIdleCallback(() => {});
		expect(nativeCalls).toBe(1);
		expect(handle).toBe(7);
	});
});
