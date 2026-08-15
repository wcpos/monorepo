/**
 * The engine's answer to "how much of this query do you actually hold, and what is the
 * authoritative size of it?" — computed here, once, from the two rows that carry the facts.
 *
 * This module is deliberately pure: no RxDB, no clock, no subscriptions. `coverageChanges`
 * (local-coverage/coverage-changes.ts) owns the plumbing that keeps the two documents current;
 * everything a caller is allowed to conclude from them lives in `coverageVerdictFrom`. That
 * split is what keeps the semantics testable without storage, and what stops a UI layer from
 * re-deriving them against the engine's private tables.
 */

import type { SyncCollectionName } from '../collections/engine-collections';
import type { QueryTotalCacheDocument } from '../scheduler';
import type { CoverageLaneDocument } from './coverage-schema';

/**
 * What the engine can vouch for about ONE coverage key, right now.
 *
 * `total` is `null` whenever the engine cannot vouch for a count — there is no fallback baked
 * in here, because the only sensible fallback (the caller's resident count) is the caller's
 * own knowledge. `source` says which row the number came from so a caller can decide how to
 * present it; `unknown` and `total: null` always travel together.
 *
 * `complete`/`fresh` describe the local coverage LANE for the key — whether the engine believes
 * it holds the whole matching set locally, and whether that belief is still inside its freshness
 * window. They are reported independently of which source supplied `total`, because a fresh
 * server-side count says nothing about local completeness.
 */
export type CoverageVerdict = {
	/** The authoritative count, or null when the engine cannot vouch for one. */
	total: number | null;
	source: 'query-total' | 'lane' | 'unknown';
	complete: boolean;
	fresh: boolean;
	/**
	 * How far a mid-flight fetch-to-completion walk has got (#954), or null when no walk is in
	 * flight. Deliberately independent of freshness AND completeness: the walk's progress is
	 * work already done, and a large range routinely outlives its lane's freshness window.
	 */
	progress: { downloaded: number; total: number | null } | null;
};

/**
 * Which coverage key to answer for.
 *
 * The `queryKey` arm is for lanes whose key the caller already holds — the engine handed it out
 * on the requirement handle. The `lane: 'reference'` arm is for the boot/reference lanes that
 * are seeded without any requirement (tax rates) or whose key is the engine's own convention:
 * the engine resolves it through `laneKeyFor`, so callers never construct a lane key.
 */
export type CoverageTarget =
	| { collection: SyncCollectionName; queryKey: string }
	| { collection: SyncCollectionName; lane: 'reference' };

/** No scope, no rows, no lane key — indistinguishable, and all mean the same thing. */
export const UNKNOWN_COVERAGE_VERDICT: CoverageVerdict = Object.freeze({
	total: null,
	source: 'unknown',
	complete: false,
	fresh: false,
	progress: null,
});

/**
 * Precedence: a FRESH cached query-total wins, then a lane that is both COMPLETE and FRESH,
 * then nothing.
 *
 * Completeness is required of the lane and not of the query-total on purpose. A windowed browse
 * lane is deliberately incomplete — it holds the first N of a much larger set — so its id count
 * is not the query's size; the cached total is exactly the server's answer for that same window
 * key, which is why it can stand alone (#894/#945/#951). Freshness is strict `>`: a document
 * that expires at exactly `nowMs` has expired, and stale is indistinguishable from missing.
 */
export function coverageVerdictFrom(
	lane: CoverageLaneDocument | null,
	queryTotal: QueryTotalCacheDocument | null,
	nowMs: number
): CoverageVerdict {
	const laneFresh = lane !== null && lane.freshUntilMs > nowMs;
	const shared = {
		complete: lane?.complete ?? false,
		fresh: laneFresh,
		progress:
			lane !== null && lane.rangedResume
				? {
						// The walk publishes its running count per page; the id set is only written
						// when a pass ends, so it is the fallback for lanes written before the
						// per-page publish landed.
						downloaded: lane.rangedResume.downloadedRecords ?? lane.expectedRecordIds.length,
						total: lane.rangedResume.totalRecords,
					}
				: null,
	};
	if (queryTotal !== null && queryTotal.freshUntilMs > nowMs) {
		return { ...shared, total: queryTotal.totalMatchingRecords, source: 'query-total' };
	}
	if (lane !== null && lane.complete && laneFresh) {
		return { ...shared, total: lane.expectedRecordIds.length, source: 'lane' };
	}
	return { ...shared, total: null, source: 'unknown' };
}

/**
 * Does `queryKey` belong to `collection`'s key namespace?
 *
 * The COVERAGE LANE table needs no such test — its primary key is `${collection}::${queryKey}`,
 * so the collection is part of the address. The QUERY-TOTAL table has no collection column at
 * all: it is keyed by `queryKey` alone and separated only by the convention that every key the
 * engine mints is `${collection}:…` (`laneKeyFor`, plus the orders/product/customer browse key
 * builders). Reading it by key alone would therefore let a target of one collection adopt
 * another collection's cached server total — a wrong number presented as authoritative, which
 * is worse than declining to answer.
 *
 * So the namespace IS the guard, and it is checked rather than assumed. The convention is
 * pinned by a test over the real key builders, so a future key that breaks it fails loudly
 * instead of silently dropping a footer back to the resident count.
 */
export function queryKeyBelongsToCollection(collection: string, queryKey: string): boolean {
	return queryKey.startsWith(`${collection}:`);
}

/**
 * The earliest future deadline at which this verdict could change on its own, or null.
 *
 * Nothing writes a row at `freshUntilMs`, so a verdict that says `fresh: true` would otherwise
 * outlive its own deadline in a subscriber's hands — the same republish-at-expiry contract the
 * census snapshot keeps.
 */
export function nextCoverageExpiryMs(
	lane: CoverageLaneDocument | null,
	queryTotal: QueryTotalCacheDocument | null,
	nowMs: number
): number | null {
	const upcoming = [lane?.freshUntilMs, queryTotal?.freshUntilMs].filter(
		(deadline): deadline is number => deadline !== undefined && deadline > nowMs
	);
	return upcoming.length > 0 ? Math.min(...upcoming) : null;
}
