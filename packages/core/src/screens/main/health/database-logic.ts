import { COLLECTION_VOCABULARY } from '@wcpos/query';
import type { CensusTotal, CensusTotals, SyncCollectionName } from '@wcpos/sync-engine';

export type CollectionKey = SyncCollectionName;

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
 * True when the earliest census expiry has already passed — the totals-retry
 * lane (30s cadence) will refresh it imminently, so the footer says
 * "refreshing now…" instead of counting down into the past.
 */
export function censusRefreshDue(
	window: { nextUpdateAtMs: number | null },
	nowMs: number
): boolean {
	return window.nextUpdateAtMs !== null && window.nextUpdateAtMs <= nowMs;
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

/**
 * Telemetry (snake_case) collection names carried by log rows → engine row
 * keys. Unknown names are dropped rather than guessed.
 */
const TELEMETRY_TO_ROW_KEY = Object.fromEntries(
	Object.entries(COLLECTION_VOCABULARY).map(([name, row]) => [row.telemetryName, name])
) as Record<string, CollectionKey>;

export function rowKeyForTelemetryCollection(name: string): CollectionKey | null {
	return TELEMETRY_TO_ROW_KEY[name] ?? null;
}

/** Per-row stuck counts for the collection table's chips. */
export function stuckCountsByRow(
	stuck: { collection: string }[]
): Partial<Record<CollectionKey, number>> {
	const counts: Partial<Record<CollectionKey, number>> = {};
	for (const record of stuck) {
		const key = rowKeyForTelemetryCollection(record.collection);
		if (key === null) continue;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

/**
 * The "Everything else" row: storage the estimate can see but the collection
 * rows don't account for — search indexes, logs, sync bookkeeping — after
 * other stores' scopes (measured separately) are excluded. Null when there is
 * no storage estimate to reconcile against.
 */
export function deriveEverythingElseBytes(
	storageBytes: number | null,
	collectionBytes: (number | null | undefined)[],
	otherStoresBytes: number | null
): number | null {
	if (storageBytes === null || !Number.isFinite(storageBytes)) return null;
	const known = collectionBytes.reduce<number>(
		(sum, bytes) => sum + (typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0),
		0
	);
	return Math.max(0, storageBytes - known - (otherStoresBytes ?? 0));
}

/**
 * OPFS entry classification for the other-stores footnote. Mirrors the
 * storage layer's naming: one `rxdb-<opfs-safe db name>` directory per RxDB
 * database ('/' encoded as '__'), scope databases named
 * `pos_v<gen>_<site12>_s<store>_c<cashier>` (packages/database/src/database-names.ts —
 * deliberately not imported: those helpers are package-internal).
 */
const OPFS_RXDB_PREFIX = 'rxdb-';
const SCOPE_DB_NAME = /pos_v\d+_([a-f0-9]{12})_s([a-z0-9-]+)_c[a-z0-9-]+/;

export type OtherScopesSummary = {
	/** Distinct OTHER (site, store) pairs — the footnote's "N other stores". */
	storeCount: number;
	/** OPFS bytes held by those other stores' scopes. */
	bytes: number;
	/**
	 * OPFS bytes of the ACTIVE store's scopes for other cashiers. Not part of
	 * the footnote (they belong to this store), but they must be excluded from
	 * the "Everything else" reconciliation or they'd masquerade as this
	 * scope's indexes/logs/bookkeeping.
	 */
	sameStoreOtherCashierBytes: number;
};

/**
 * Classify every scope database's OPFS footprint relative to the active
 * scope: other stores (counted once per store, however many cashiers), the
 * active store's other cashiers, and the active scope itself (skipped — the
 * collection rows account for it).
 */
export function summarizeOtherScopes(
	entries: { name: string; bytes: number }[],
	activeDbName: string | null
): OtherScopesSummary {
	const activeMatch = activeDbName?.match(SCOPE_DB_NAME) ?? null;
	const activeStoreKey = activeMatch ? `${activeMatch[1]}_s${activeMatch[2]}` : null;
	const stores = new Set<string>();
	let bytes = 0;
	let sameStoreOtherCashierBytes = 0;
	for (const entry of entries) {
		if (!entry.name.startsWith(OPFS_RXDB_PREFIX)) continue;
		const dbName = entry.name.slice(OPFS_RXDB_PREFIX.length).replace(/__/g, '/');
		const match = dbName.match(SCOPE_DB_NAME);
		if (!match) continue;
		if (activeDbName !== null && dbName.includes(activeDbName)) continue; // the active scope itself
		const storeKey = `${match[1]}_s${match[2]}`;
		if (storeKey === activeStoreKey) {
			sameStoreOtherCashierBytes += entry.bytes;
			continue;
		}
		stores.add(storeKey);
		bytes += entry.bytes;
	}
	return { storeCount: stores.size, bytes, sameStoreOtherCashierBytes };
}
