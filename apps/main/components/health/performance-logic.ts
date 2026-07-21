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

export type TrendPoint = { x: number; y: number };

/**
 * A fixed, gentle wave used only to give the "not enough data yet" state a
 * chart-shaped silhouette. Deliberately hand-written rather than derived from
 * anything measured — a placeholder that echoed real numbers would read as data.
 */
const PLACEHOLDER_SHAPE: readonly number[] = [4, 6, 5, 8, 7, 10, 9, 12];

const PLACEHOLDER_POINTS: readonly TrendPoint[] = PLACEHOLDER_SHAPE.map((y, x) => ({ x, y }));

export type TrendDisplay = {
	/** `placeholder` means the drawn line is decorative and must be labelled as such. */
	mode: 'chart' | 'placeholder';
	points: TrendPoint[];
	/** The latest *measured* value, or null when nothing has been measured. */
	latest: number | null;
};

/**
 * Decide what a trend should draw. Two samples make a line; anything less gets
 * the muted placeholder so the card holds its shape instead of collapsing to an
 * empty box. The real latest value survives either way — one sample is not a
 * trend, but it is still true.
 *
 * Placeholder points are returned for rendering only; they are never summarized,
 * persisted, or counted (see `summarizeLast24h`, which reads buckets, not these).
 */
export function trendDisplay(points: TrendPoint[]): TrendDisplay {
	const latest = points.length > 0 ? points[points.length - 1].y : null;
	if (points.length < 2) {
		return {
			mode: 'placeholder',
			points: PLACEHOLDER_POINTS.map((point) => ({ ...point })),
			latest,
		};
	}
	return { mode: 'chart', points, latest };
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
