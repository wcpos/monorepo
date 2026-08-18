/**
 * The coverage verdict's rules, with no storage in the way. These are the semantics
 * `query-bindings.ts` used to re-implement client-side; owning them here is the point of
 * `engine.coverageChanges`.
 */

import { describe, expect, it } from 'vitest';

import { coverageVerdictFrom, nextCoverageExpiryMs } from './coverage-verdicts';

import type { CoverageLaneDocument } from './coverage-schema';
import type { QueryTotalCacheDocument } from '../scheduler';

const NOW = 1_000_000;

function lane(overrides: Partial<CoverageLaneDocument> = {}): CoverageLaneDocument {
	return {
		laneKey: 'orders::orders:browser:limit=25',
		collectionName: 'orders',
		queryKey: 'orders:browser:limit=25',
		complete: true,
		expectedRecordIds: ['a', 'b', 'c'],
		freshUntilMs: NOW + 60_000,
		updatedAtMs: NOW,
		schemaVersion: 3,
		...overrides,
	} as CoverageLaneDocument;
}

function queryTotal(overrides: Partial<QueryTotalCacheDocument> = {}): QueryTotalCacheDocument {
	return {
		queryKey: 'orders:browser:limit=25',
		totalMatchingRecords: 4_200,
		freshUntilMs: NOW + 60_000,
		updatedAtMs: NOW,
		schemaVersion: 1,
		...overrides,
	} as QueryTotalCacheDocument;
}

describe('coverageVerdictFrom', () => {
	it('prefers a fresh query-total over an otherwise usable lane', () => {
		expect(coverageVerdictFrom(lane(), queryTotal(), NOW)).toMatchObject({
			total: 4_200,
			source: 'query-total',
		});
	});

	it('falls to the lane once the query-total has expired', () => {
		expect(coverageVerdictFrom(lane(), queryTotal({ freshUntilMs: NOW - 1 }), NOW)).toMatchObject({
			total: 3,
			source: 'lane',
		});
	});

	it('vouches for nothing when neither row is usable', () => {
		expect(coverageVerdictFrom(null, null, NOW)).toEqual({
			total: null,
			source: 'unknown',
			complete: false,
			fresh: false,
			progress: null,
		});
	});

	// A windowed browse holds the first N of a much larger set: reporting its id count as the
	// query's size is the false-complete bug (#894/#945). A cached server total has no such
	// problem, which is why completeness is demanded of one and not the other.
	it('requires completeness of a lane but not of a query-total', () => {
		expect(coverageVerdictFrom(lane({ complete: false }), null, NOW)).toMatchObject({
			total: null,
			source: 'unknown',
			complete: false,
			fresh: true,
		});
		expect(coverageVerdictFrom(lane({ complete: false }), queryTotal(), NOW)).toMatchObject({
			total: 4_200,
			source: 'query-total',
			complete: false,
		});
	});

	// Freshness is strict: a document that expires exactly now has expired. Expiry demotes the
	// row to the stale tiers — it flips `fresh`, it does not erase the count.
	it('treats a deadline of exactly now as expired', () => {
		expect(coverageVerdictFrom(lane({ freshUntilMs: NOW }), null, NOW)).toMatchObject({
			total: 3,
			source: 'lane',
			fresh: false,
		});
		expect(coverageVerdictFrom(lane({ freshUntilMs: NOW + 1 }), null, NOW)).toMatchObject({
			total: 3,
			source: 'lane',
			fresh: true,
		});
	});

	// The `18 of 18+` complaint: a total whose freshness window lapsed is still the server's
	// last answer, and for display the last answer beats refusing to answer. `fresh` (a LANE
	// fact) is what callers with sync-side decisions consult instead.
	it('keeps vouching a stale query-total when nothing fresh outranks it', () => {
		expect(coverageVerdictFrom(null, queryTotal({ freshUntilMs: NOW - 1 }), NOW)).toMatchObject({
			total: 4_200,
			source: 'query-total',
			fresh: false,
		});
	});

	it('prefers a fresh complete lane over a stale query-total', () => {
		expect(coverageVerdictFrom(lane(), queryTotal({ freshUntilMs: NOW - 1 }), NOW)).toMatchObject({
			total: 3,
			source: 'lane',
			fresh: true,
		});
	});

	// Between two stale rows the ordering matches the fresh tiers: the query-total is the
	// server's own count for the key, the lane's id set is only local evidence of it.
	it('prefers a stale query-total over a stale complete lane', () => {
		expect(
			coverageVerdictFrom(
				lane({ freshUntilMs: NOW - 1 }),
				queryTotal({ freshUntilMs: NOW - 1 }),
				NOW
			)
		).toMatchObject({ total: 4_200, source: 'query-total', fresh: false });
	});

	// An incomplete lane's id count was never the query's size, stale or not (#894/#945) — with
	// no query-total ever recorded there is genuinely nothing to vouch.
	it('still vouches nothing for a stale incomplete lane with no query-total', () => {
		expect(
			coverageVerdictFrom(lane({ complete: false, freshUntilMs: NOW - 1 }), null, NOW)
		).toMatchObject({ total: null, source: 'unknown', fresh: false });
	});

	it('reports the walk running count when the cursor carries one', () => {
		expect(
			coverageVerdictFrom(
				lane({
					complete: false,
					rangedResume: {
						beforeSeconds: 1_783_000_000,
						excludeWooIds: [7],
						totalRecords: 30_000,
						downloadedRecords: 120,
					},
				}),
				null,
				NOW
			).progress
		).toEqual({ downloaded: 120, total: 30_000 });
	});

	// Lanes written before the per-page publish landed carry no running count; the id set is
	// the only thing they have, and it is written when a pass ends.
	it('falls back to the expected id count for a cursor with no running count', () => {
		expect(
			coverageVerdictFrom(
				lane({
					complete: false,
					rangedResume: {
						beforeSeconds: 1_783_000_000,
						excludeWooIds: [],
						totalRecords: null,
					},
				}),
				null,
				NOW
			).progress
		).toEqual({ downloaded: 3, total: null });
	});

	// The walk's progress is work already done, and a large range routinely outlives the lane's
	// freshness window — so a stale lane still reports where the walk got to.
	it('reports progress independently of freshness and completeness', () => {
		const verdict = coverageVerdictFrom(
			lane({
				complete: false,
				freshUntilMs: NOW - 1,
				rangedResume: {
					beforeSeconds: 1,
					excludeWooIds: [],
					totalRecords: 9,
					downloadedRecords: 4,
				},
			}),
			null,
			NOW
		);
		expect(verdict).toMatchObject({ total: null, source: 'unknown', fresh: false });
		expect(verdict.progress).toEqual({ downloaded: 4, total: 9 });
	});

	it('reports no progress for a lane with nothing left to resume', () => {
		expect(coverageVerdictFrom(lane(), null, NOW).progress).toBeNull();
	});
});

describe('nextCoverageExpiryMs', () => {
	it('takes the earliest FUTURE deadline of the two rows', () => {
		expect(
			nextCoverageExpiryMs(
				lane({ freshUntilMs: NOW + 5 }),
				queryTotal({ freshUntilMs: NOW + 3 }),
				NOW
			)
		).toBe(NOW + 3);
		expect(
			nextCoverageExpiryMs(
				lane({ freshUntilMs: NOW + 5 }),
				queryTotal({ freshUntilMs: NOW - 3 }),
				NOW
			)
		).toBe(NOW + 5);
	});

	it('has nothing to re-arm when both rows are already stale or absent', () => {
		expect(nextCoverageExpiryMs(lane({ freshUntilMs: NOW }), null, NOW)).toBeNull();
		expect(nextCoverageExpiryMs(null, null, NOW)).toBeNull();
	});
});
