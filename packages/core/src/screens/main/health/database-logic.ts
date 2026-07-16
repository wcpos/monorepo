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
	if (input.gatedBy !== null) return false;
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
