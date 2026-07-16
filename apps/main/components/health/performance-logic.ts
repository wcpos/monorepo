import type { MetricsBucket } from '../../lib/metrics';

/** The #559 presets — macros over the two dials. */
export const PRESETS = {
	eco: { checkIntervalMs: 60_000, pullBatchSize: 25 },
	balanced: { checkIntervalMs: 10_000, pullBatchSize: 50 },
	realtime: { checkIntervalMs: 5_000, pullBatchSize: 100 },
} as const;
export type PresetName = keyof typeof PRESETS;

export function presetFor(checkIntervalMs: number, pullBatchSize: number): PresetName | 'custom' {
	for (const [name, values] of Object.entries(PRESETS) as [
		PresetName,
		(typeof PRESETS)[PresetName],
	][]) {
		if (values.checkIntervalMs === checkIntervalMs && values.pullBatchSize === pullBatchSize) {
			return name;
		}
	}
	return 'custom';
}

export function summarizeLast24h(buckets: MetricsBucket[], nowMs: number) {
	const cutoff = nowMs - 24 * 60 * 60 * 1000;
	const recent = buckets.filter((bucket) => bucket.hourStartMs >= cutoff);
	const requests = recent.reduce((sum, bucket) => sum + bucket.requests, 0);
	const bytes = recent.reduce((sum, bucket) => sum + bucket.bytes, 0);
	const durationTotal = recent.reduce((sum, bucket) => sum + bucket.durationTotalMs, 0);
	const durationCount = recent.reduce((sum, bucket) => sum + bucket.durationCount, 0);
	const errors = recent.reduce((sum, bucket) => sum + bucket.errors, 0);
	const serverSeconds = Math.round(durationTotal / 1000);
	return {
		recent,
		requests,
		megabytes: bytes / 1_048_576,
		typicalMs: durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
		errors,
		serverMinutes: serverSeconds >= 60 ? Math.round(serverSeconds / 60) : null,
	};
}
