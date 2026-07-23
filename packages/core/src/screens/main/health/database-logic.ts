import type { CensusTotal, CensusTotals } from '@wcpos/query';

export type CollectionKey =
	| 'products'
	| 'variations'
	| 'orders'
	| 'customers'
	| 'categories'
	| 'brands'
	| 'tags'
	| 'coupons'
	| 'taxRates';

/**
 * A single row's derived display state. `percentLocal` is populated ONLY when
 * an authoritative fresh server total exists — never computed off the local
 * count as its own denominator (the observability audit's honesty contract).
 * `orders` is windowed, so it reports policy text instead of a percentage.
 */
export type CollectionRow = {
	key: CollectionKey;
	local: number;
	serverTotal: number | null;
	fresh: boolean;
	percentLocal: number | null;
	/** Windowed collections state their coverage policy rather than a bar. */
	windowed: boolean;
};

/** Orders are the one windowed collection — "open + recent", not a full mirror. */
export const WINDOWED_COLLECTIONS: ReadonlySet<CollectionKey> = new Set(['orders']);

export function deriveCollectionRow(
	key: CollectionKey,
	local: number,
	census: CensusTotal | null
): CollectionRow {
	const windowed = WINDOWED_COLLECTIONS.has(key);
	// A stale or missing census means the total is unknown — no bar, no percentage.
	const authoritative = census !== null && census.fresh;
	const serverTotal = authoritative ? census.total : null;
	const percentLocal =
		!windowed && authoritative && census.total > 0
			? Math.min(100, Math.round((local / census.total) * 100))
			: null;
	return {
		key,
		local,
		serverTotal,
		fresh: authoritative,
		percentLocal,
		windowed,
	};
}

export function deriveRows(
	order: readonly CollectionKey[],
	counts: Record<string, number>,
	census: CensusTotals
): CollectionRow[] {
	return order.map((key) =>
		deriveCollectionRow(
			key,
			counts[key] ?? 0,
			(census as Record<string, CensusTotal | null>)[key] ?? null
		)
	);
}

/**
 * "Ready to sell" is a milestone, not a full-sync gate — the POS can sell as
 * soon as tier-0 (reference/tax) + the first product window land, even while
 * the backlog streams in (Paul, 2026-07-16). This reads those signals off the
 * engine gate, never off a per-collection completeness check.
 */
export function isReadyToSell(input: {
	connectivity: 'online' | 'offline' | 'degraded';
	gatedBy: string | null;
	bootstrapFailed: boolean;
	productsLocal: number;
}): boolean {
	if (input.bootstrapFailed) return false;
	// A bootstrap or lifecycle gate blocks readiness — but 'offline' does NOT:
	// a primed till sells offline (that is the whole point), so offline
	// readiness rides on productsLocal below, never on the gate.
	if (input.gatedBy === 'bootstrap-failed' || input.gatedBy === 'lifecycle') return false;
	// Any local products means the first window has landed; offline is fine —
	// selling works offline, that's the whole point.
	return input.productsLocal > 0;
}

/** Total records held locally across all synced collections. */
export function totalLocalRecords(counts: Record<string, number>): number {
	return Object.values(counts).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

/** Human-readable bytes for the storage-estimate line. */
export function formatBytes(bytes: number | null): string | null {
	if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Approximate on-disk bytes for a collection: average sampled serialized-record
 * length × record count. Deliberately an estimate (storage adds index/metadata
 * overhead the sample can't see) — the UI marks it with "≈". Null when nothing
 * was sampled (empty collection or sampling unavailable).
 */
export function estimateCollectionBytes(
	count: number,
	sampledJsonLengths: readonly number[]
): number | null {
	if (count <= 0 || sampledJsonLengths.length === 0) return null;
	const valid = sampledJsonLengths.filter((n) => Number.isFinite(n) && n > 0);
	if (valid.length === 0) return null;
	const average = valid.reduce((sum, n) => sum + n, 0) / valid.length;
	return Math.round(average * count);
}

/**
 * The census freshness window for the footer: when the totals were last taken
 * (latest updatedAtMs across known collections) and when the next refresh
 * lands (earliest freshUntilMs — the first collection to expire triggers the
 * next census request). Nulls when no census entry exists yet.
 */
export function censusFreshnessWindow(census: CensusTotals): {
	updatedAtMs: number | null;
	nextUpdateAtMs: number | null;
} {
	let updatedAtMs: number | null = null;
	let nextUpdateAtMs: number | null = null;
	for (const entry of Object.values(census)) {
		if (!entry) continue;
		if (updatedAtMs === null || entry.updatedAtMs > updatedAtMs) updatedAtMs = entry.updatedAtMs;
		if (nextUpdateAtMs === null || entry.freshUntilMs < nextUpdateAtMs)
			nextUpdateAtMs = entry.freshUntilMs;
	}
	return { updatedAtMs, nextUpdateAtMs };
}

/**
 * Elapsed fraction (0..1) of the census freshness window at `nowMs` — drives
 * the countdown meter under the freshness lines. Null when the window is
 * unknown or degenerate.
 */
export function censusWindowProgress(
	window: { updatedAtMs: number | null; nextUpdateAtMs: number | null },
	nowMs: number
): number | null {
	if (window.updatedAtMs === null || window.nextUpdateAtMs === null) return null;
	const span = window.nextUpdateAtMs - window.updatedAtMs;
	if (span <= 0) return null;
	return Math.min(1, Math.max(0, (nowMs - window.updatedAtMs) / span));
}

/**
 * Relative-time bucket for freshness copy. The UI owns the words (i18n); this
 * owns the arithmetic so the buckets are testable.
 */
export function relativeTimeParts(
	fromMs: number,
	toMs: number
): { unit: 'seconds' | 'minutes' | 'hours'; value: number } {
	const deltaMs = Math.max(0, toMs - fromMs);
	if (deltaMs < 60_000) return { unit: 'seconds', value: Math.round(deltaMs / 1000) };
	if (deltaMs < 60 * 60_000) return { unit: 'minutes', value: Math.round(deltaMs / 60_000) };
	return { unit: 'hours', value: Math.round(deltaMs / (60 * 60_000)) };
}
