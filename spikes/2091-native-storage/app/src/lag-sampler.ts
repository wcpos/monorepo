export const samplerIntervalMs = 16;
export const materialisedMissedTicks = true;

export function lagSampler() {
	const startMs = performance.now();
	const samples: {
		scheduledMs: number;
		observedMs: number;
		lagMs: number;
		materialised: boolean;
		source: 'timer' | 'stop';
	}[] = [];
	let expected = startMs + samplerIntervalMs;
	const record = (actual: number, source: 'timer' | 'stop') => {
		if (source === 'stop' && actual < expected) {
			samples.push({
				scheduledMs: expected,
				observedMs: actual,
				lagMs: 0,
				materialised: false,
				source,
			});
		}
		let materialised = false;
		while (actual >= expected) {
			samples.push({
				scheduledMs: expected,
				observedMs: actual,
				lagMs: actual - expected,
				materialised,
				source,
			});
			materialised = true;
			expected += samplerIntervalMs;
		}
	};
	const timer = setInterval(() => record(performance.now(), 'timer'), samplerIntervalMs);
	return () => {
		clearInterval(timer);
		const endMs = performance.now();
		record(endMs, 'stop');
		const series = samples.map(({ lagMs }) => lagMs);
		return {
			startMs,
			endMs,
			samples,
			series,
			// Sum only non-overlapping observed lateness, not overlapping synthetic delays.
			totalBlockedMs: samples.filter((s) => !s.materialised).reduce((sum, s) => sum + s.lagMs, 0),
			maxLagMs: Math.max(0, ...series),
			ticksOver50Ms: series.filter((lag) => lag > 50).length,
		};
	};
}
