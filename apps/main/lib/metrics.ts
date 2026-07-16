import { createMetricsCollector, type MetricsSnapshot } from '@wcpos/sync-core';

const HOUR_MS = 60 * 60 * 1000;
const MAX_BUCKETS = 48;

export type MetricsBucket = {
	hourStartMs: number;
	requests: number;
	bytes: number;
	durationTotalMs: number;
	durationCount: number;
	errors: number;
	loadLast?: number;
	loadMax?: number;
};

const appMetrics = createMetricsCollector();
const metricsBuckets = new Map<number, MetricsBucket>();
// Bumped on every reset (store switch). In-flight requests capture the epoch
// at start; a completion whose epoch is stale belongs to the previous store
// and must not land in the new store's buckets.
let metricsEpoch = 0;

export function getMetricsEpoch(): number {
	return metricsEpoch;
}

export const appMetricsObserver = appMetrics.observe;

export function getMetricsSnapshot(): MetricsSnapshot {
	return appMetrics.snapshot();
}

function hourStart(atMs: number): number {
	return Math.floor(atMs / HOUR_MS) * HOUR_MS;
}

function getOrCreateBucket(atMs: number): MetricsBucket {
	const start = hourStart(atMs);
	const existing = metricsBuckets.get(start);
	if (existing) return existing;

	const bucket: MetricsBucket = {
		hourStartMs: start,
		requests: 0,
		bytes: 0,
		durationTotalMs: 0,
		durationCount: 0,
		errors: 0,
	};
	metricsBuckets.set(start, bucket);
	return bucket;
}

function pruneMetricsBuckets(): void {
	const hours = [...metricsBuckets.keys()].sort((a, b) => a - b);
	for (const start of hours.slice(0, -MAX_BUCKETS)) {
		metricsBuckets.delete(start);
	}
}

/** Which synced collection a request concerns, derived from its URL path —
 * feeds the collector's per-collection dimension. Non-collection routes
 * (changes, resolve, status) return undefined. */
export function collectionFromSyncUrl(url: string): string | undefined {
	let segments: string[];
	try {
		segments = new URL(url).pathname.split('/').filter(Boolean);
	} catch {
		return undefined;
	}
	const namespaceIndex = segments.findIndex((segment) => segment === 'wcpos' || segment === 'wc');
	const route = segments.slice(namespaceIndex >= 0 ? namespaceIndex + 2 : 0);
	const [head, second] = route;
	switch (head) {
		case 'products':
			if (second === 'categories') return 'categories';
			if (second === 'brands') return 'brands';
			if (second === 'tags') return 'tags';
			if (second === 'variations') return 'variations';
			return 'products';
		case 'variations':
			return 'variations';
		case 'orders':
			return 'orders';
		case 'customers':
			return 'customers';
		case 'coupons':
			return 'coupons';
		case 'taxes':
			return 'taxRates';
		default:
			return undefined;
	}
}

export function recordTransport({
	atMs,
	durationMs,
	bytes,
	ok,
	epoch,
}: {
	atMs: number;
	durationMs: number;
	bytes: number;
	ok: boolean;
	epoch?: number;
}): void {
	if (epoch !== undefined && epoch !== metricsEpoch) return;
	const bucket = getOrCreateBucket(atMs);
	bucket.requests += 1;
	// Guard against a malformed byte count leaking in from any caller — a single
	// NaN/negative value would otherwise corrupt this bucket's running total.
	if (Number.isFinite(bytes) && bytes >= 0) bucket.bytes += bytes;
	bucket.durationTotalMs += durationMs;
	bucket.durationCount += 1;
	if (!ok) bucket.errors += 1;
	pruneMetricsBuckets();
}

export function recordServerLoad(load1: number, epoch?: number): void {
	if (epoch !== undefined && epoch !== metricsEpoch) return;
	if (!Number.isFinite(load1)) return;
	const bucket = getOrCreateBucket(Date.now());
	bucket.loadLast = load1;
	bucket.loadMax = Math.max(bucket.loadMax ?? load1, load1);
	pruneMetricsBuckets();
}

export function getMetricsBuckets(): MetricsBucket[] {
	return [...metricsBuckets.values()]
		.sort((a, b) => a.hourStartMs - b.hourStartMs)
		.map((bucket) => ({ ...bucket }));
}

function isMetricsBucket(value: unknown): value is MetricsBucket {
	if (!value || typeof value !== 'object') return false;
	const bucket = value as Record<string, unknown>;
	const requiredNumbers = [
		'hourStartMs',
		'requests',
		'bytes',
		'durationTotalMs',
		'durationCount',
		'errors',
	] as const;
	if (
		!requiredNumbers.every((key) => typeof bucket[key] === 'number' && Number.isFinite(bucket[key]))
	) {
		return false;
	}
	return (
		(bucket.loadLast === undefined ||
			(typeof bucket.loadLast === 'number' && Number.isFinite(bucket.loadLast))) &&
		(bucket.loadMax === undefined ||
			(typeof bucket.loadMax === 'number' && Number.isFinite(bucket.loadMax)))
	);
}

export function hydrateMetricsBuckets(persisted: unknown): void {
	if (!Array.isArray(persisted)) return;
	for (const bucket of persisted) {
		if (!isMetricsBucket(bucket)) continue;
		const existing = metricsBuckets.get(bucket.hourStartMs);
		if (!existing) {
			metricsBuckets.set(bucket.hourStartMs, { ...bucket });
			continue;
		}
		// The sync engine can open the current hour's bucket with startup ticks
		// before this (async) hydrate resolves. Fold the persisted counts into the
		// live bucket rather than skipping it, so earlier-in-the-hour totals from a
		// previous session survive the restart instead of being dropped. This runs
		// after resetMetricsBuckets() on a store switch, so the only live bucket it
		// can merge into belongs to the incoming store — never the previous one.
		existing.requests += bucket.requests;
		existing.bytes += bucket.bytes;
		existing.durationTotalMs += bucket.durationTotalMs;
		existing.durationCount += bucket.durationCount;
		existing.errors += bucket.errors;
		if (bucket.loadMax !== undefined) {
			existing.loadMax = Math.max(existing.loadMax ?? bucket.loadMax, bucket.loadMax);
		}
		// Keep the live reading when the session has already recorded one (it is the
		// most recent); otherwise fall back to the persisted last reading.
		if (existing.loadLast === undefined) existing.loadLast = bucket.loadLast;
	}
	pruneMetricsBuckets();
}

/**
 * Drop all in-memory hourly buckets. Host metrics are per-store, so the
 * persistence bridge calls this when the active store changes — otherwise the
 * previous store's buckets would survive in this module-level map and be
 * displayed and re-persisted under the new store.
 */
export function resetMetricsBuckets(): void {
	metricsBuckets.clear();
	metricsEpoch += 1;
}

export function resetMetricsForTests(): void {
	appMetrics.reset();
	metricsBuckets.clear();
	metricsEpoch = 0;
}
