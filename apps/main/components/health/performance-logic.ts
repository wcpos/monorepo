import type { MetricsBucket } from '../../lib/metrics';

/**
 * The #559 presets — macros over the two dials.
 *
 * TWO INDEPENDENT BUDGET LINES (#908). `checkIntervalMs` prices HOW OFTEN we ask;
 * `pullBatchSize` prices HOW HEAVY each request is. The old table moved the interval
 * aggressively (60s → 10s → 5s) while treating page weight as a free rider — but page
 * weight is what actually hurts shared hosting: a 100-record products page takes seconds
 * even on a fast server, and the check interval only multiplies that cost.
 *
 * So each tier now moves BOTH lines, and notably no preset ships the 100-record maximum:
 * the top of the slider stays reachable only through Custom, for merchants who know their
 * server can take it.
 *
 *   Eco       5 min · 25   —   288 checks/day, lightest possible page
 *   Balanced   60 s · 50   — 1,440 checks/day (Paul's anchor: 10s was over-ambitious
 *                            for the average server)
 *   Realtime   10 s · 75   — 8,640 checks/day, fast but still not max-weight pages
 *
 * These numbers are deliberately in one table so they are easy to re-tune.
 */
export const PRESETS = {
	eco: { checkIntervalMs: 300_000, pullBatchSize: 25 },
	balanced: { checkIntervalMs: 60_000, pullBatchSize: 50 },
	realtime: { checkIntervalMs: 10_000, pullBatchSize: 75 },
} as const;
export type PresetName = keyof typeof PRESETS;

/** The shipped default — what a fresh till gets, and what "Reset" restores. */
export const DEFAULT_PRESET: PresetName = 'balanced';
export const DEFAULT_CHECK_INTERVAL_MS = PRESETS[DEFAULT_PRESET].checkIntervalMs;
export const DEFAULT_PULL_BATCH_SIZE = PRESETS[DEFAULT_PRESET].pullBatchSize;

/**
 * Both budget lines, in the preset's own numbers — derived rather than written out in
 * copy so the description can never drift from the table when the numbers are re-tuned.
 */
export function presetBudget(name: PresetName): { intervalSeconds: number; records: number } {
	return {
		intervalSeconds: Math.round(PRESETS[name].checkIntervalMs / 1000),
		records: PRESETS[name].pullBatchSize,
	};
}

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
	// Trend points, plotted by the "Your server, over time" charts. A server-load
	// sample can open an hour's bucket before any request lands in it, so a
	// zero-request bucket is bookkeeping rather than an hour the POS spent
	// asking — plotting it would draw a dip the till never had.
	const requestPoints = recent
		.filter((bucket) => bucket.requests > 0)
		.map((bucket) => ({ x: bucket.hourStartMs, y: bucket.requests }));
	const loadPoints = recent
		.filter((bucket) => bucket.loadMax !== undefined)
		.map((bucket) => ({ x: bucket.hourStartMs, y: bucket.loadMax as number }));
	const requests = recent.reduce((sum, bucket) => sum + bucket.requests, 0);
	const bytes = recent.reduce((sum, bucket) => sum + bucket.bytes, 0);
	const durationTotal = recent.reduce((sum, bucket) => sum + bucket.durationTotalMs, 0);
	const durationCount = recent.reduce((sum, bucket) => sum + bucket.durationCount, 0);
	const errors = recent.reduce((sum, bucket) => sum + bucket.errors, 0);
	const serverSeconds = Math.round(durationTotal / 1000);
	return {
		recent,
		requestPoints,
		loadPoints,
		requests,
		megabytes: bytes / 1_048_576,
		typicalMs: durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
		errors,
		serverMinutes: serverSeconds >= 60 ? Math.round(serverSeconds / 60) : null,
	};
}

const HOUR_MS_LOCAL = 60 * 60 * 1000;

export type UptimeCellState = 'running' | 'errors' | 'closed';
export type UptimeCell = {
	hourStartMs: number;
	state: UptimeCellState;
	requests: number;
	errors: number;
};

/**
 * Uptime strip cells for the trailing window, newest last. Buckets exist only
 * when the engine made requests, and an open engine checks continuously — so
 * a missing hour reads "app closed".
 * NOTE — deferred: "slowed" (cadence adaptation) and "stalled while open"
 * need the adaptation-transition rows / hourly heartbeat rollups (spec §4,
 * engine #846) that aren't produced yet; until then errors-in-hour is the
 * only amber signal and red is never shown.
 */
export function deriveUptimeCells(
	buckets: MetricsBucket[],
	nowMs: number,
	hours = 24
): UptimeCell[] {
	const byHour = new Map(buckets.map((bucket) => [bucket.hourStartMs, bucket]));
	const currentHourStart = Math.floor(nowMs / HOUR_MS_LOCAL) * HOUR_MS_LOCAL;
	const cells: UptimeCell[] = [];
	for (let i = hours - 1; i >= 0; i -= 1) {
		const hourStartMs = currentHourStart - i * HOUR_MS_LOCAL;
		const bucket = byHour.get(hourStartMs);
		const requests = bucket?.requests ?? 0;
		const errors = bucket?.errors ?? 0;
		cells.push({
			hourStartMs,
			state: requests === 0 ? 'closed' : errors > 0 ? 'errors' : 'running',
			requests,
			errors,
		});
	}
	return cells;
}
