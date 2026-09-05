export const JS_THREAD_LAG_SAMPLE_INTERVAL_MS = 50; // Fine enough to see a dropped frame, coarse enough to cost nothing.
const JS_THREAD_LAG_BUCKETS_MS = [16, 50, 100, 250, 500, 1000] as const; // Requested cutoffs for the investigation report.
export interface JsThreadLagSnapshot {
	samples: number;
	blockedMs: number;
	maxMs: number;
	buckets: Record<(typeof JS_THREAD_LAG_BUCKETS_MS)[number], number>;
}
function emptySnapshot(): JsThreadLagSnapshot {
	return {
		samples: 0,
		blockedMs: 0,
		maxMs: 0,
		buckets: { 16: 0, 50: 0, 100: 0, 250: 0, 500: 0, 1000: 0 },
	};
}
export function createJsThreadLagAccumulator() {
	let snapshot = emptySnapshot();
	return {
		record(lagMs: number): void {
			snapshot.samples += 1;
			snapshot.blockedMs += lagMs;
			snapshot.maxMs = Math.max(snapshot.maxMs, lagMs);
			JS_THREAD_LAG_BUCKETS_MS.forEach((threshold) => {
				if (lagMs > threshold) snapshot.buckets[threshold] += 1;
			});
		},
		take(): JsThreadLagSnapshot {
			const taken = snapshot;
			snapshot = emptySnapshot();
			return taken;
		},
	};
}
const jsThreadLagAccumulator = createJsThreadLagAccumulator();
export function startJsThreadLagSampler(): () => void {
	let expected = performance.now() + JS_THREAD_LAG_SAMPLE_INTERVAL_MS;
	const timer = setInterval(() => {
		const actual = performance.now();
		jsThreadLagAccumulator.record(Math.max(0, actual - expected));
		// Re-anchor on the actual tick: a fixed schedule would keep reporting one
		// stall as lag on every tick after it.
		expected = actual + JS_THREAD_LAG_SAMPLE_INTERVAL_MS;
	}, JS_THREAD_LAG_SAMPLE_INTERVAL_MS);
	return () => clearInterval(timer);
}
export function takeJsThreadLagSnapshot(): JsThreadLagSnapshot {
	return jsThreadLagAccumulator.take();
}
