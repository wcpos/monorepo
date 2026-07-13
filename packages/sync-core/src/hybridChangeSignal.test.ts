/**
 * Hybrid change-signal engine against a deterministic FAKE ChangeSignalSource
 * (the fakeHost pattern). These pin the composition the change-signal matrix
 * nominated — each tier catching exactly the scenario it was measured to catch:
 *
 *   TIER 1 sequence-log   — hooked changes incl. tax rates + delete tombstones
 *   TIER 2 hash-checksum  — hook-BYPASSING product writes (sql-bypass)
 *   TIER 2 range-checksum — hook-BYPASSING tax-rate writes (wrong id space for
 *                           hash-checksum)
 *   TIER 3 drill-down     — which ids drifted; revision-hash escalation for a
 *                           bucket the targeted pull does not reconcile
 *
 * No rxdb, no fetch, no DOM — only the injected source + a fake clock.
 */

import { describe, expect, it } from 'vitest';

import {
	type BaselineDigests,
	type ChangeSignalSource,
	createHybridChangeSignalEngine,
	DEFAULT_HYBRID_POLICY,
	digestsDiffer,
	type DriftedId,
	type HashChecksumBucket,
	type RangeChecksumBucket,
	type SequenceLogRow,
} from './hybridChangeSignal';

// --- Fake source builder ------------------------------------------------------

type SequencePage = { rows: SequenceLogRow[]; cursor: { sequence: number }; hasMore: boolean };

type FakeSourceConfig = {
	/** Successive sequence-log pages handed out in order; the last repeats. */
	sequencePages?: SequencePage[];
	/**
	 * hash-checksum scan results keyed by the sweep index (0-based count of
	 * sweeps that have RUN the scan). Index past the end repeats the last entry.
	 */
	hashScansBySweep?: HashChecksumBucket[][];
	/** range-checksum (tax-rate) results keyed by sweep index; last repeats. */
	rangeScansBySweep?: RangeChecksumBucket[][];
	/** drill-down results keyed by `${bucketSize}:${bucket}`. */
	drillDowns?: Record<string, DriftedId[]>;
	/** When omitted, revisionHashForIds is undefined (host has no repair path). */
	withRevisionHash?: boolean;
};

type Calls = {
	pollSequenceLog: { cursor: { sequence: number }; limit: number }[];
	hashChecksumScan: { bucketSize: number; afterId: number; limitBuckets: number }[];
	rangeChecksumScan: { collection: string; bucketSize: number }[];
	drillDownBucket: {
		collection?: string;
		detector?: string;
		bucketSize: number;
		bucket: number;
	}[];
	revisionHashForIds: { ids: number[]; collection?: string; detector?: string }[];
};

function makeFakeSource(config: FakeSourceConfig) {
	const calls: Calls = {
		pollSequenceLog: [],
		hashChecksumScan: [],
		rangeChecksumScan: [],
		drillDownBucket: [],
		revisionHashForIds: [],
	};

	let sequencePageIndex = 0;
	const sequencePages = config.sequencePages ?? [];

	// The scan handlers count how many sweeps have STARTED (each sweep makes one
	// pass; we paginate within a single config entry by serving all buckets at
	// once and reporting complete=true, which matches the tiny-payload evidence).
	let hashSweepIndex = 0;
	let rangeSweepIndex = 0;

	function at<T>(list: T[][], index: number): T[] {
		if (list.length === 0) {
			return [];
		}
		return list[Math.min(index, list.length - 1)];
	}

	const source: ChangeSignalSource = {
		async pollSequenceLog(input) {
			calls.pollSequenceLog.push({ cursor: input.cursor, limit: input.limit });
			const page = sequencePages[sequencePageIndex] ?? {
				rows: [],
				cursor: input.cursor,
				hasMore: false,
			};
			// Advance to the next configured page only while the host says hasMore;
			// otherwise the same terminal page repeats (an idle log).
			if (sequencePageIndex < sequencePages.length - 1) {
				sequencePageIndex += 1;
			}
			return page;
		},
		async hashChecksumScan(input) {
			calls.hashChecksumScan.push(input);
			const buckets = at(config.hashScansBySweep ?? [], hashSweepIndex);
			hashSweepIndex += 1;
			return { buckets, complete: true, nextAfterId: 0 };
		},
		async rangeChecksumScan(input) {
			calls.rangeChecksumScan.push({ collection: input.collection, bucketSize: input.bucketSize });
			const buckets = at(config.rangeScansBySweep ?? [], rangeSweepIndex);
			rangeSweepIndex += 1;
			return { buckets };
		},
		async drillDownBucket(input) {
			const request = input as typeof input & { collection?: string; detector?: string };
			calls.drillDownBucket.push(request);
			return {
				driftedIds:
					config.drillDowns?.[
						`${request.collection ?? 'products'}:${input.bucketSize}:${input.bucket}`
					] ??
					config.drillDowns?.[`${input.bucketSize}:${input.bucket}`] ??
					[],
			};
		},
	};

	if (config.withRevisionHash) {
		source.revisionHashForIds = async (input) => {
			calls.revisionHashForIds.push(input);
			return { rows: input.ids.map((id) => ({ id, revision: `rev-${id}` })) };
		};
	}

	return { source, calls };
}

/** A hash-checksum bucket; `match: false` means a hook-bypassing write. */
function hashBucket(
	overrides: Partial<HashChecksumBucket> & { bucket: number }
): HashChecksumBucket {
	return {
		range: { start: overrides.bucket * 1000, end: overrides.bucket * 1000 + 999 },
		stored_count: 10,
		current_count: 10,
		stored_digest: '111',
		current_digest: '111',
		match: true,
		...overrides,
	};
}

function rangeBucket(
	overrides: Partial<RangeChecksumBucket> & { bucket: number }
): RangeChecksumBucket {
	return { record_count: 5, checksum: 'abc', ...overrides };
}

function createFakeClock(startMs = 0) {
	let ms = startMs;
	return {
		now: () => ms,
		advance: (delta: number) => {
			ms += delta;
		},
	};
}

function repairTarget(
	id: number,
	overrides: {
		status?: 'changed' | 'deleted';
		collection?: 'products' | 'variations' | 'tax_rates';
		detector?: 'hash-checksum' | 'range-checksum';
	} = {}
) {
	return {
		id,
		status: overrides.status ?? 'changed',
		collection: overrides.collection ?? 'products',
		detector: overrides.detector ?? 'hash-checksum',
	};
}

// --- TIER 1: routine hooked changes ------------------------------------------

describe('TIER 1 — routine sequence-log poll', () => {
	it('surfaces a routine hooked change via sequence-log, advances the cursor, no sweep off-cadence', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [
				{
					rows: [
						{
							sequence: 7,
							id: 42,
							collection: 'products' as const,
							type: 'update',
							modified_gmt: '2026-06-17 00:00:00',
						},
					],
					cursor: { sequence: 7 },
					hasMore: false,
				},
			],
		});
		// sweepEveryNPolls=2 with the time cadence off keeps the FIRST poll
		// sweep-free so this exercises TIER 1 in isolation.
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 2, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.changes).toEqual([
			{ id: 42, type: 'update', collection: 'products', source: 'sequence-log' },
		]);
		expect(outcome.cursor).toEqual({ sequence: 7 });
		expect(outcome.sweepRan).toBe(false);
		expect(outcome.integrityMismatches).toEqual([]);
		expect(outcome.idsToPull).toEqual([]);
		expect(outcome.escalatedIds).toEqual([]);
		// Off-cadence: TIER 2 endpoints untouched.
		expect(calls.hashChecksumScan).toHaveLength(0);
		expect(calls.rangeChecksumScan).toHaveLength(0);
	});

	it('threads the advanced cursor into the next poll', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [
				{
					rows: [{ sequence: 3, id: 1, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 3 },
					hasMore: false,
				},
				{
					rows: [{ sequence: 9, id: 2, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 9 },
					hasMore: false,
				},
			],
		});
		const engine = createHybridChangeSignalEngine({ source, now: () => 0 });

		await engine.poll();
		await engine.poll();

		expect(calls.pollSequenceLog[0].cursor).toEqual({ sequence: 0 });
		expect(calls.pollSequenceLog[1].cursor).toEqual({ sequence: 3 });
	});

	it('cursor integrity across offline→online→offline: a mid-drain failure AFTER a page produced a cursor HOLDS the committed cursor; reconnect resumes with no skip/dup (ADR 0017, P2L-3e)', async () => {
		// Model going offline PART-WAY through a multi-page poll: page A returns and advances a LOCAL cursor,
		// then page B rejects (the browser aborts the in-flight fetch). The engine commits its cursor only on
		// full poll success (drainSequenceLog), so page A's local advance must be discarded — proven by the
		// reconnect poll resuming from the pre-failure COMMITTED cursor, not page A's local one.
		const rows = (from: number, to: number): SequenceLogRow[] =>
			Array.from({ length: to - from + 1 }, (_, i) => ({
				sequence: from + i,
				id: from + i,
				collection: 'products' as const,
				type: 'update',
			}));
		const { source: base } = makeFakeSource({});
		const cursorsSeen: number[] = [];
		let call = 0;
		const source: ChangeSignalSource = {
			...base,
			async pollSequenceLog(input) {
				call += 1;
				cursorsSeen.push(input.cursor.sequence);
				if (call === 1) return { rows: rows(1, 5), cursor: { sequence: 5 }, hasMore: false }; // online poll
				if (call === 2) return { rows: rows(6, 8), cursor: { sequence: 8 }, hasMore: true }; // poll 2, page A
				if (call === 3) throw new Error('offline: network unreachable'); // poll 2, page B rejects mid-drain
				return { rows: rows(6, 10), cursor: { sequence: 10 }, hasMore: false }; // poll 3, reconnect
			},
		};
		const engine = createHybridChangeSignalEngine({ source, now: () => 0 });

		// Online: drains 1–5, commits cursor 5.
		const online1 = await engine.poll();
		expect(online1.changes.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
		expect(online1.cursor).toEqual({ sequence: 5 });

		// Offline mid-drain: page A produced local cursor 8, page B rejected → the whole poll REJECTS and
		// delivers NO changes (page A's 6–8 are not committed).
		await expect(engine.poll()).rejects.toThrow(/offline/);

		// Reconnect: resumes from the COMMITTED cursor 5 (NOT page A's discarded 8), drains 6–10.
		const online2 = await engine.poll();
		expect(online2.changes.map((c) => c.id)).toEqual([6, 7, 8, 9, 10]);
		expect(online2.cursor).toEqual({ sequence: 10 });

		// The atomic-commit proof: poll 3 asked from cursor 5, not 8 — page A's mid-drain advance was discarded.
		expect(cursorsSeen).toEqual([0, 5, 8, 5]);
		// Delivered output across the successful polls is exactly 1..10, once each — nothing skipped/duplicated.
		expect([...online1.changes, ...online2.changes].map((c) => c.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
	});

	it('drains multiple pages while hasMore, then stops', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [
				{
					rows: [{ sequence: 1, id: 1, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 1 },
					hasMore: true,
				},
				{
					rows: [{ sequence: 2, id: 2, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 2 },
					hasMore: true,
				},
				{
					rows: [{ sequence: 3, id: 3, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 3 },
					hasMore: false,
				},
			],
		});
		const engine = createHybridChangeSignalEngine({ source, now: () => 0 });

		const outcome = await engine.poll();

		expect(outcome.changes.map((c) => c.id)).toEqual([1, 2, 3]);
		expect(outcome.cursor).toEqual({ sequence: 3 });
		expect(calls.pollSequenceLog).toHaveLength(3);
	});

	it('reports a hooked tax-rate edit via TIER 1 (carries timestamp-less tax rates)', async () => {
		// A hooked tax-rate update arrives as a sequence-log row with no
		// modified_gmt — the matrix proves sequence-log carries it.
		const { source } = makeFakeSource({
			sequencePages: [
				{
					rows: [
						{ sequence: 4, id: 900, collection: 'tax_rates' as const, type: 'tax_rate.update' },
					],
					cursor: { sequence: 4 },
					hasMore: false,
				},
			],
		});
		const engine = createHybridChangeSignalEngine({ source, now: () => 0 });

		const outcome = await engine.poll();

		expect(outcome.changes).toEqual([
			{ id: 900, type: 'tax_rate.update', collection: 'tax_rates', source: 'sequence-log' },
		]);
	});

	it('reports a hooked delete as a tombstone via TIER 1 (positive event, not an absence)', async () => {
		const { source } = makeFakeSource({
			sequencePages: [
				{
					rows: [{ sequence: 5, id: 77, collection: 'products' as const, type: 'delete' }],
					cursor: { sequence: 5 },
					hasMore: false,
				},
			],
		});
		const engine = createHybridChangeSignalEngine({ source, now: () => 0 });

		const outcome = await engine.poll();

		expect(outcome.changes).toEqual([
			{ id: 77, type: 'delete', collection: 'products', source: 'sequence-log' },
		]);
	});

	it('honours the safety cap on the drain loop when hasMore never clears', async () => {
		// A host that always reports hasMore=true and never advances must not spin
		// forever — the cap stops the drain.
		let pages = 0;
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				pages += 1;
				return {
					rows: [{ sequence: pages, id: pages, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: cursor.sequence + 1 },
					hasMore: true,
				};
			},
			async hashChecksumScan() {
				return { buckets: [], complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [] };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { maxSequenceLogPages: 5 },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(pages).toBe(5);
		expect(outcome.changes).toHaveLength(5);
		// Cursor reached the cap and is preserved for the next poll to resume.
		expect(outcome.cursor).toEqual({ sequence: 5 });
	});
});

// --- Cursor atomicity: a failed poll must not advance the committed cursor ----

describe('cursor atomicity (codex review P1)', () => {
	it('does NOT commit the cursor when the sweep rejects, so the next poll re-drains the same rows', async () => {
		const seen: { sequence: number }[] = [];
		let failSweep = true;
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				seen.push(cursor);
				// Always offers the row at the CURRENT cursor and advances by one.
				return {
					rows: [
						{
							sequence: cursor.sequence + 1,
							id: cursor.sequence + 1,
							collection: 'products' as const,
							type: 'update',
						},
					],
					cursor: { sequence: cursor.sequence + 1 },
					hasMore: false,
				};
			},
			async hashChecksumScan() {
				if (failSweep) {
					throw new Error('integrity endpoint down');
				}
				return { buckets: [], complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [] };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: false },
			now: () => 0,
		});

		// Poll 1: TIER 1 drains row id 1, then the sweep throws → poll rejects.
		await expect(engine.poll()).rejects.toThrow('integrity endpoint down');
		// The committed cursor was NOT advanced past the undelivered row.
		expect(seen[0]).toEqual({ sequence: 0 });

		// Poll 2 succeeds: it must RE-DRAIN from sequence 0, redelivering id 1
		// (idempotent), not skip it.
		failSweep = false;
		const outcome = await engine.poll();
		expect(seen[1]).toEqual({ sequence: 0 });
		expect(outcome.changes).toEqual([
			{ id: 1, type: 'update', collection: 'products', source: 'sequence-log' },
		]);
		expect(outcome.cursor).toEqual({ sequence: 1 });
	});
});

// --- TIER 2: integrity-path correctness (codex review) -----------------------

describe('TIER 2 — integrity sweep robustness', () => {
	it('retries a rejected/stalled sweep on the next poll instead of consuming its cadence slot (codex review)', async () => {
		// Count cadence every 5 polls. Poll 5's hash scan rejects (a stall throws,
		// or an endpoint errors). The backstop must not be skipped until poll 10 —
		// the failed sweep forces a retry on poll 6 even though 6 % 5 != 0.
		let sweeps = 0;
		let failNext = false;
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				return { rows: [], cursor, hasMore: false };
			},
			async hashChecksumScan() {
				sweeps += 1;
				if (failNext) {
					throw new Error('integrity endpoint flutter');
				}
				return { buckets: [], complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [] };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 5, sweepIntervalMs: 0, sweepTaxRates: false },
			now: () => 0,
		});

		for (let i = 0; i < 4; i++) await engine.poll(); // polls 1-4: not due
		failNext = true;
		await expect(engine.poll()).rejects.toThrow('integrity endpoint flutter'); // poll 5: due, rejects
		expect(sweeps).toBe(1);
		failNext = false;
		const retry = await engine.poll(); // poll 6: NOT count-due, but retry-due
		expect(retry.sweepRan).toBe(true);
		expect(sweeps).toBe(2);
	});

	it('labels a drifted hash-checksum id by the per-id collection from the drill-down, not always products (codex review)', async () => {
		// A hash-checksum bucket spans wp_posts ids = products AND variations. A
		// bypassing write that drifts a VARIATION row must be labeled
		// collection:'variations' (so the host pulls the variation path), taken from
		// the drill-down's per-id report — not collapsed to 'products' by detector.
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				return { rows: [], cursor, hasMore: false };
			},
			async hashChecksumScan() {
				return {
					buckets: [hashBucket({ bucket: 0, match: false, current_digest: '7' })],
					complete: true,
					nextAfterId: 0,
				};
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return {
					driftedIds: [
						{ id: 100, status: 'changed', collection: 'products' },
						{ id: 200, status: 'changed', collection: 'variations' },
					],
				};
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: false },
			now: () => 0,
		});

		const outcome = await engine.poll();
		const byId = new Map(outcome.idsToPull.map((t) => [t.id, t.collection]));
		expect(byId.get(100)).toBe('products');
		expect(byId.get(200)).toBe('variations');
	});

	it('does not persist a streak increment when a later drill-down in the same sweep rejects (codex review)', async () => {
		// Two mismatched buckets; the SECOND drill-down rejects, so poll() throws.
		// Bucket 0's streak increment must NOT persist — otherwise on retry it would
		// be one step closer to escalation with no targeted pull ever delivered.
		let failBucket1 = true;
		let revisionCalls = 0;
		const twoBad = [
			hashBucket({ bucket: 0, match: false, current_digest: '1' }),
			hashBucket({ bucket: 1, match: false, current_digest: '2' }),
		];
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				return { rows: [], cursor, hasMore: false };
			},
			async hashChecksumScan() {
				return { buckets: twoBad, complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket({ bucket }) {
				if (bucket === 1 && failBucket1) {
					throw new Error('drill-down 1 down');
				}
				return { driftedIds: [{ id: bucket * 10, status: 'changed' }] };
			},
			async revisionHashForIds({ ids }) {
				revisionCalls += 1;
				return { rows: ids.map((id) => ({ id, revision: `r-${id}` })) };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: {
				sweepEveryNPolls: 1,
				sweepIntervalMs: 0,
				sweepTaxRates: false,
				escalateToRevisionHashAfter: 2,
			},
			now: () => 0,
		});

		// Poll 1: bucket 0 drills (streak would be 1), bucket 1 throws → poll rejects.
		await expect(engine.poll()).rejects.toThrow('drill-down 1 down');
		// Poll 2: everything succeeds. Bucket 0's streak starts from 0 (NOT 1), so a
		// single mismatch here must NOT escalate (threshold is 2).
		failBucket1 = false;
		const recovered = await engine.poll();
		expect(recovered.escalatedIds).toEqual([]);
		expect(revisionCalls).toBe(0);
	});

	it('rejects a stalled hash-checksum scan instead of accepting a partial sweep', async () => {
		// The scan never advances afterId while reporting complete=false — an
		// endpoint/adapter failure. Rather than treat the partial pass as a clean
		// sweep (which would let the integrity backstop go falsely "verified" and
		// could evict unscanned baseline keys), runSweep THROWS. The throw rolls
		// back the poll (cursor uncommitted) and, via sweepRetryPending, the failed
		// sweep retries on the next poll instead of being silently dropped. No
		// partial state is mutated because the throw happens before resolveMismatches.
		let pages = 0;
		let rangeScans = 0;
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				return { rows: [], cursor, hasMore: false };
			},
			async hashChecksumScan() {
				pages += 1;
				// Page 1: a flagged bucket, complete=false, nextAfterId stays 0 → stall.
				return {
					buckets: [
						hashBucket({ bucket: 0, match: false, current_count: 3, current_digest: '999' }),
					],
					complete: false,
					nextAfterId: 0,
				};
			},
			async rangeChecksumScan() {
				rangeScans += 1;
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [{ id: 7, status: 'changed' }] };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: false },
			now: () => 0,
		});

		await expect(engine.poll()).rejects.toThrow(/stalled hash-checksum scan/i);
		expect(pages).toBe(1);
		expect(rangeScans).toBe(0);
	});

	it('does not false-flag a first-seen tax-rate bucket when only hash baselines were seeded (codex review)', async () => {
		// Engine persisted ONLY hash-checksum baselines, then the opt-in tax sweep
		// is enabled. A first-seen tax-rate bucket must be ADOPTED, not diffed
		// against `undefined` and falsely flagged. A LATER change to it then flags.
		const hashOnlyBaseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [
				[rangeBucket({ bucket: 0, checksum: 'abc' })], // sweep 1: first-seen → adopt, no flag
				[rangeBucket({ bucket: 0, checksum: 'XYZ' })], // sweep 2: changed → flag
			],
			drillDowns: { '1000:0': [{ id: 5, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: hashOnlyBaseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const first = await engine.poll();
		expect(first.integrityMismatches).toEqual([]); // adopted, NOT false-flagged
		expect(calls.rangeChecksumScan).toHaveLength(1);

		const second = await engine.poll();
		expect(second.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
	});

	it('threads the configured range-checksum bucket size into the scan and drill-down so they agree', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 2, checksum: 'r0' }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [[{ bucket: 0, record_count: 2, checksum: 'r1' }]],
			drillDowns: { 'tax_rates:500:0': [{ id: 10, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: {
				sweepEveryNPolls: 1,
				sweepIntervalMs: 0,
				sweepTaxRates: true,
				rangeChecksumBucketSize: 500,
			},
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(calls.rangeChecksumScan).toHaveLength(1);
		expect(calls.rangeChecksumScan[0].bucketSize).toBe(500);
		expect(calls.drillDownBucket).toEqual([
			{ bucketSize: 500, bucket: 0, collection: 'tax_rates', detector: 'range-checksum' },
		]);
		expect(outcome.idsToPull).toEqual([
			repairTarget(10, { collection: 'tax_rates', detector: 'range-checksum' }),
		]);
	});

	it('does not commit sequence cursor or sweep timestamp when a sweep-due poll fails', async () => {
		let hashCalls = 0;
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				return {
					rows: [
						{
							sequence: cursor.sequence + 10,
							id: 42,
							collection: 'products' as const,
							type: 'update',
						},
					],
					cursor: { sequence: cursor.sequence + 10 },
					hasMore: false,
				};
			},
			async hashChecksumScan() {
				hashCalls += 1;
				if (hashCalls === 1) {
					throw new Error('temporary scan failure');
				}
				return { buckets: [], complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [] };
			},
		};
		const calls: { cursor: { sequence: number } }[] = [];
		const trackingSource: ChangeSignalSource = {
			...source,
			async pollSequenceLog(input) {
				calls.push({ cursor: input.cursor });
				return source.pollSequenceLog(input);
			},
		};
		const engine = createHybridChangeSignalEngine({
			source: trackingSource,
			policy: { sweepEveryNPolls: 0, sweepIntervalMs: 1000 },
			now: () => 0,
		});

		await expect(engine.poll()).rejects.toThrow('temporary scan failure');
		const retry = await engine.poll();

		expect(calls.map((call) => call.cursor)).toEqual([{ sequence: 0 }, { sequence: 0 }]);
		expect(hashCalls).toBe(2);
		expect(retry.cursor).toEqual({ sequence: 10 });
		expect(retry.changes).toEqual([
			{ id: 42, type: 'update', collection: 'products', source: 'sequence-log' },
		]);
	});

	it('adopts an unseeded range baseline even when hash baselines were restored', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0 })]],
			rangeScansBySweep: [[rangeBucket({ bucket: 0, checksum: 'tax-baseline' })]],
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.integrityMismatches).toEqual([]);
		expect(outcome.baselineDigests.get('range-checksum:0')).toEqual({
			detector: 'range-checksum',
			count: 5,
			checksum: 'tax-baseline',
		});
	});

	it('does NOT flag a hash bucket whose digest moved while the server match stays true (tier-1 owns hooked changes)', async () => {
		// A hooked product/variation edit moves the digest, but the stored digest
		// moves with it, so the server reports match:true. hash-checksum detects ONLY
		// the absolute match:false (sql-bypass); a cross-sweep relative diff here is
		// provably unsound offline (it cannot tell this already-handled hooked change
		// from an unreconciled drift — see the engine comment), so it is not used.
		// TIER 1's sequence-log already reported this change.
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0, current_digest: '222', match: true })]],
			drillDowns: { 'products:1000:0': [{ id: 5005, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: false },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.integrityMismatches).toEqual([]);
		expect(outcome.idsToPull).toEqual([]);
	});

	it('returns updated baseline digests as a clone for host persistence', async () => {
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0 })]],
			rangeScansBySweep: [[rangeBucket({ bucket: 0, checksum: 'tax-baseline' })]],
		});
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.baselineDigests).toEqual(
			new Map([
				['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
				['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'tax-baseline' }],
			])
		);
		outcome.baselineDigests.clear();
		const next = await engine.poll();
		expect(next.baselineDigests.size).toBeGreaterThan(0);
	});

	it('keeps a dirty range baseline until the bucket reconciles', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[], []],
			rangeScansBySweep: [
				[rangeBucket({ bucket: 0, checksum: 'DEF' })],
				[rangeBucket({ bucket: 0, checksum: 'DEF' })],
			],
			drillDowns: { 'tax_rates:1000:0': [{ id: 903, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();

		expect(first.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(second.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(second.idsToPull).toEqual([
			repairTarget(903, { collection: 'tax_rates', detector: 'range-checksum' }),
		]);
	});

	it('emits deleted ids from retained range bucket membership when a bucket vanished', async () => {
		const baseline = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 1, checksum: 'abc', ids: [904] }],
		]) as BaselineDigests;
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [[]],
			drillDowns: { 'tax_rates:1000:0': [] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.idsToPull).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
	});

	it('serializes overlapping poll calls so only one mutates engine state at a time', async () => {
		let releaseFirst: ((value: SequencePage) => void) | undefined;
		let sequence = 0;
		const calls: { cursor: { sequence: number } }[] = [];
		const source: ChangeSignalSource = {
			async pollSequenceLog({ cursor }) {
				calls.push({ cursor });
				if (calls.length === 1) {
					return new Promise((resolve) => {
						releaseFirst = resolve;
					});
				}
				sequence = cursor.sequence + 1;
				return {
					rows: [{ sequence, id: sequence, collection: 'products' as const, type: 'update' }],
					cursor: { sequence },
					hasMore: false,
				};
			},
			async hashChecksumScan() {
				return { buckets: [], complete: true, nextAfterId: 0 };
			},
			async rangeChecksumScan() {
				return { buckets: [] };
			},
			async drillDownBucket() {
				return { driftedIds: [] };
			},
		};
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 2, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const first = engine.poll();
		const second = engine.poll();
		await Promise.resolve();

		expect(calls).toEqual([{ cursor: { sequence: 0 } }]);
		releaseFirst?.({
			rows: [{ sequence: 1, id: 1, collection: 'products' as const, type: 'update' }],
			cursor: { sequence: 1 },
			hasMore: false,
		});

		await expect(first).resolves.toMatchObject({ cursor: { sequence: 1 } });
		await expect(second).resolves.toMatchObject({ cursor: { sequence: 2 } });
		expect(calls.map((call) => call.cursor)).toEqual([{ sequence: 0 }, { sequence: 1 }]);
	});
});

// --- TIER 2: integrity sweep for hook-bypassing writes -----------------------

describe('TIER 2 — integrity sweep cadence', () => {
	it('runs the sweep every N polls and not in between; a sweep does NOT move the cursor', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0 })]],
		});
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 3, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();
		const third = await engine.poll();

		expect(first.sweepRan).toBe(false);
		expect(second.sweepRan).toBe(false);
		expect(third.sweepRan).toBe(true);
		expect(calls.hashChecksumScan).toHaveLength(1);
		// The sweep performed no sequence-log work beyond the routine TIER 1 drain,
		// and the cursor stays where TIER 1 left it (sequence 0).
		expect(third.cursor).toEqual({ sequence: 0 });
	});

	it('runs the sweep on the wall-clock interval even when the poll count cadence has not fired', async () => {
		const clock = createFakeClock(0);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0 })]],
		});
		const engine = createHybridChangeSignalEngine({
			source,
			// Count cadence effectively off (huge N), time cadence at 1s.
			policy: { sweepEveryNPolls: 1000, sweepIntervalMs: 1000 },
			now: clock.now,
		});

		const cold = await engine.poll(); // first poll: lastSweepAtMs null -> time-due
		clock.advance(500);
		const between = await engine.poll(); // 500ms < 1000ms -> no sweep
		clock.advance(600);
		const due = await engine.poll(); // 1100ms since last -> sweep

		expect(cold.sweepRan).toBe(true);
		expect(between.sweepRan).toBe(false);
		expect(due.sweepRan).toBe(true);
		expect(calls.hashChecksumScan).toHaveLength(2);
	});

	it('does NOT sweep tax rates by default (experimental, opt-in) but can be turned on', async () => {
		// The tax-rate range-checksum integrity sweep is EXPERIMENTAL and OFF by
		// default — TIER 1 already covers hooked tax-rate changes, and the
		// cross-sweep range-checksum over-flags without a server-absolute signal
		// (see the sweepTaxRates doc + ADR 0005).
		const offByDefault = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
		});
		const offEngine = createHybridChangeSignalEngine({
			source: offByDefault.source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});
		await offEngine.poll();
		expect(offByDefault.calls.rangeChecksumScan).toHaveLength(0);

		const withTax = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [[rangeBucket({ bucket: 0 })]],
		});
		const onEngine = createHybridChangeSignalEngine({
			source: withTax.source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});
		await onEngine.poll();
		expect(withTax.calls.rangeChecksumScan).toHaveLength(1);
		expect(withTax.calls.rangeChecksumScan[0].collection).toBe('tax_rates');
	});
});

describe('TIER 2 + TIER 3 — hook-bypassing PRODUCT write (sql-bypass)', () => {
	it('is missed by TIER 1, caught by the hash-checksum sweep, drill-down yields the exact id', async () => {
		// Seed a clean baseline so the FIRST sweep can diff (a cold engine adopts
		// its first scan and would not flag anything).
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source, calls } = makeFakeSource({
			// No sequence-log row — the SQL bypass fired no hook (TIER 1 is blind).
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			// The scan reports bucket 0 mismatched: digest drift, match=false.
			hashScansBySweep: [[hashBucket({ bucket: 0, current_digest: '222', match: false })]],
			drillDowns: { '1000:0': [{ id: 5005, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const outcome = await engine.poll();

		// TIER 1 saw nothing.
		expect(outcome.changes).toEqual([]);
		// TIER 2 flagged the bucket via hash-checksum.
		expect(outcome.integrityMismatches).toEqual([{ bucket: 0, detector: 'hash-checksum' }]);
		// TIER 3 drilled the exact drifted id into the targeted pull set.
		expect(outcome.idsToPull).toEqual([repairTarget(5005)]);
		expect(calls.drillDownBucket).toEqual([
			{ bucketSize: 1000, bucket: 0, collection: 'products', detector: 'hash-checksum' },
		]);
		// No escalation on the first post-pull mismatch.
		expect(outcome.escalatedIds).toEqual([]);
	});

	it('catches a hook-bypassing DELETE via the drill-down status:deleted', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:2', { detector: 'hash-checksum', count: 8, digest: '333', match: true }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [
				[hashBucket({ bucket: 2, current_count: 7, current_digest: '333', match: false })],
			],
			drillDowns: { '1000:2': [{ id: 2042, status: 'deleted' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.integrityMismatches).toEqual([{ bucket: 2, detector: 'hash-checksum' }]);
		expect(outcome.idsToPull).toEqual([repairTarget(2042, { status: 'deleted' })]);
	});

	it('cold start with no seeded baseline adopts a clean (all match:true) first scan without flagging RELATIVE drift, then detects drift on the next sweep', async () => {
		// Cold-start adopt-only suppresses RELATIVE (cross-sweep) drift only — every
		// bucket here is match:true, so the absolute server verdict is clean and the
		// first sweep legitimately raises nothing. It must NOT suppress an absolute
		// match:false (covered by the next test).
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [
				// Sweep 1: a steady, match:true bucket — adopted as baseline, NOT flagged.
				[hashBucket({ bucket: 0, current_digest: '111', match: true })],
				// Sweep 2: the same bucket now drifted (and the server agrees: match:false).
				[hashBucket({ bucket: 0, current_digest: '999', match: false })],
			],
			drillDowns: { '1000:0': [{ id: 7, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const cold = await engine.poll();
		const drift = await engine.poll();

		expect(cold.sweepRan).toBe(true);
		expect(cold.integrityMismatches).toEqual([]);
		expect(cold.idsToPull).toEqual([]);

		expect(drift.integrityMismatches).toEqual([{ bucket: 0, detector: 'hash-checksum' }]);
		expect(drift.idsToPull).toEqual([repairTarget(7)]);
	});

	// DEFECT 1 (critical): a hook-bypassing write that ALREADY EXISTS at cold
	// start produces an absolute match:false on the FIRST sweep. The engine must
	// honour that absolute verdict regardless of baselineSeeded — otherwise the
	// pre-existing sql-bypass is adopted-as-baseline and silently masked forever.
	it('cold start with NO seeded baseline flags a hash-checksum bucket whose absolute match is false on the FIRST sweep', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			// No seeded baseline; the bucket already carries the server's absolute
			// match:false verdict on the very first scan.
			hashScansBySweep: [[hashBucket({ bucket: 0, current_digest: '222', match: false })]],
			drillDowns: { '1000:0': [{ id: 5005, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			// No baselineDigests — genuinely cold.
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.sweepRan).toBe(true);
		expect(outcome.integrityMismatches).toEqual([{ bucket: 0, detector: 'hash-checksum' }]);
		expect(outcome.idsToPull).toEqual([repairTarget(5005)]);
		expect(calls.drillDownBucket).toEqual([
			{ bucketSize: 1000, bucket: 0, collection: 'products', detector: 'hash-checksum' },
		]);
	});

	// DEFECT 1 (escalation path for the absolute signal): a bucket that is
	// match:false and STAYS match:false across sweeps (targeted pull is not
	// reconciling it) must build the streak and escalate, even cold-started.
	it('escalates a cold-started hash-checksum bucket that stays match:false across sweeps', async () => {
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			// Stuck divergence: same match:false bucket on every sweep, pull not fixing.
			hashScansBySweep: [
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
			],
			drillDowns: { '1000:0': [{ id: 8001, status: 'changed' }] },
			withRevisionHash: true,
		});
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, escalateToRevisionHashAfter: 2 },
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();

		expect(first.idsToPull).toEqual([repairTarget(8001)]);
		expect(first.escalatedIds).toEqual([]);
		// Second consecutive absolute mismatch >= threshold: escalate.
		expect(second.idsToPull).toEqual([repairTarget(8001)]);
		expect(second.escalatedIds).toEqual([repairTarget(8001)]);
		expect(calls.revisionHashForIds).toEqual([
			{ ids: [8001], collection: 'products', detector: 'hash-checksum' },
		]);
	});
});

describe('TIER 2 + TIER 3 — tax-rate writes split by id-space', () => {
	it('a HOOKED tax-rate change surfaces via TIER 1', async () => {
		const { source } = makeFakeSource({
			sequencePages: [
				{
					rows: [
						{ sequence: 1, id: 901, collection: 'tax_rates' as const, type: 'tax_rate.update' },
					],
					cursor: { sequence: 1 },
					hasMore: false,
				},
			],
		});
		const engine = createHybridChangeSignalEngine({
			source,
			policy: { sweepEveryNPolls: 2, sweepIntervalMs: 0 },
			now: () => 0,
		});
		const outcome = await engine.poll();
		expect(outcome.changes).toEqual([
			{ id: 901, type: 'tax_rate.update', collection: 'tax_rates', source: 'sequence-log' },
		]);
		expect(outcome.sweepRan).toBe(false);
	});

	it('a hook-BYPASSING tax-rate change is invisible to TIER 1 and caught only by the range-checksum sweep', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source, calls } = makeFakeSource({
			// No hook fired -> no sequence-log row.
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			// hash-checksum can't see tax rates (wrong id space) — its scan is clean.
			hashScansBySweep: [[]],
			// range-checksum sees the tax-rate row checksum move.
			rangeScansBySweep: [[rangeBucket({ bucket: 0, checksum: 'DEF' })]],
			drillDowns: { '1000:0': [{ id: 903, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.changes).toEqual([]);
		expect(outcome.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(outcome.idsToPull).toEqual([
			repairTarget(903, { collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		// The drill-down used the range-checksum detector + bucket size.
		expect(calls.drillDownBucket).toEqual([
			{
				bucketSize: DEFAULT_HYBRID_POLICY.rangeChecksumBucketSize,
				bucket: 0,
				collection: 'tax_rates',
				detector: 'range-checksum',
			},
		]);
	});

	it('flags a tax-rate bucket that vanished from the scan (every rate in it deleted)', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [[]], // bucket 0 gone
			drillDowns: { '1000:0': [{ id: 904, status: 'deleted' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(outcome.idsToPull).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
	});

	// DEFECT 2: a persistently-divergent tax-rate bucket (present in baseline,
	// absent/divergent from the scan every later sweep) must KEEP flagging across
	// sweeps and build the escalation streak — it must NOT flag once on sweep 1
	// then go silent forever because resolveMismatches evicted the baseline key.
	it('keeps flagging a persistently-vanished tax-rate bucket across sweeps and escalates it', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			// Bucket 0 vanishes from the scan and STAYS gone every sweep — an
			// unreconciled divergence (the targeted pull is not bringing it back).
			rangeScansBySweep: [[], [], []],
			drillDowns: { '1000:0': [{ id: 904, status: 'deleted' }] },
			withRevisionHash: true,
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: {
				sweepEveryNPolls: 1,
				sweepIntervalMs: 0,
				sweepTaxRates: true,
				escalateToRevisionHashAfter: 2,
			},
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();
		const third = await engine.poll();

		// Flags on EVERY sweep, not just the first.
		expect(first.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(second.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		expect(third.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		// Targeted pull every sweep.
		expect(first.idsToPull).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		expect(second.idsToPull).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		expect(third.idsToPull).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		// Builds the streak and escalates from sweep 2 onward.
		expect(first.escalatedIds).toEqual([]);
		expect(second.escalatedIds).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		expect(third.escalatedIds).toEqual([
			repairTarget(904, { status: 'deleted', collection: 'tax_rates', detector: 'range-checksum' }),
		]);
		expect(calls.revisionHashForIds.length).toBeGreaterThanOrEqual(1);
	});

	// A vanished tax-rate bucket that REAPPEARS matching its baseline reconciles —
	// it stops flagging and resets its streak (the conservative offline rule:
	// keep flagging until the bucket reappears matching).
	it('stops flagging a vanished tax-rate bucket once it reappears matching its baseline', async () => {
		const baseline: BaselineDigests = new Map([
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[]],
			rangeScansBySweep: [
				[], // sweep 1: gone -> flagged
				[rangeBucket({ bucket: 0, record_count: 5, checksum: 'abc' })], // sweep 2: back, matching -> reconciled
				[rangeBucket({ bucket: 0, record_count: 5, checksum: 'abc' })], // sweep 3: still clean
			],
			drillDowns: { '1000:0': [{ id: 904, status: 'deleted' }] },
			withRevisionHash: true,
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: {
				sweepEveryNPolls: 1,
				sweepIntervalMs: 0,
				sweepTaxRates: true,
				escalateToRevisionHashAfter: 2,
			},
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();
		const third = await engine.poll();

		expect(first.integrityMismatches).toEqual([{ bucket: 0, detector: 'range-checksum' }]);
		// Reappeared matching the baseline -> reconciled, no flag, streak reset.
		expect(second.integrityMismatches).toEqual([]);
		expect(third.integrityMismatches).toEqual([]);
		expect(calls.revisionHashForIds).toHaveLength(0);
	});
});

// --- TIER 3: escalation to revision-hash -------------------------------------

describe('TIER 3 — escalation to revision-hash', () => {
	it('escalates a bucket that stays mismatched for escalateToRevisionHashAfter sweeps', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			// Bucket 0 stays drifted across two sweeps (the targeted pull didn't fix
			// it — a real divergence).
			hashScansBySweep: [
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
			],
			drillDowns: { '1000:0': [{ id: 8001, status: 'changed' }] },
			withRevisionHash: true,
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, escalateToRevisionHashAfter: 2 },
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();

		// First mismatch: targeted pull only, no escalation.
		expect(first.idsToPull).toEqual([repairTarget(8001)]);
		expect(first.escalatedIds).toEqual([]);
		// Second consecutive mismatch >= threshold: escalate.
		expect(second.idsToPull).toEqual([repairTarget(8001)]);
		expect(second.escalatedIds).toEqual([repairTarget(8001)]);
		expect(calls.revisionHashForIds).toEqual([
			{ ids: [8001], collection: 'products', detector: 'hash-checksum' },
		]);
	});

	it('does NOT escalate a bucket that reconciles after the targeted pull', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source, calls } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [
				// Sweep 1: drifted -> targeted pull emitted.
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
				// Sweep 2: the pull landed; bucket back to a clean matching digest.
				[hashBucket({ bucket: 0, current_digest: '222', match: true })],
				// Sweep 3: still clean.
				[hashBucket({ bucket: 0, current_digest: '222', match: true })],
			],
			drillDowns: { '1000:0': [{ id: 8001, status: 'changed' }] },
			withRevisionHash: true,
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, escalateToRevisionHashAfter: 2 },
			now: () => 0,
		});

		const first = await engine.poll();
		const second = await engine.poll();
		const third = await engine.poll();

		expect(first.idsToPull).toEqual([repairTarget(8001)]);
		expect(first.escalatedIds).toEqual([]);
		// Reconciled: no mismatch, the streak resets, never escalates.
		expect(second.integrityMismatches).toEqual([]);
		expect(second.idsToPull).toEqual([]);
		expect(third.integrityMismatches).toEqual([]);
		expect(calls.revisionHashForIds).toHaveLength(0);
	});

	it('never escalates when the host provides no revisionHashForIds', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
				[hashBucket({ bucket: 0, current_digest: '222', match: false })],
			],
			drillDowns: { '1000:0': [{ id: 8001, status: 'changed' }] },
			withRevisionHash: false, // host has no repair path
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, escalateToRevisionHashAfter: 2 },
			now: () => 0,
		});

		await engine.poll();
		const second = await engine.poll();

		expect(second.idsToPull).toEqual([repairTarget(8001)]);
		expect(second.escalatedIds).toEqual([]);
	});
});

// --- Provenance + policy defaults --------------------------------------------

describe('provenance + policy', () => {
	it('tags every change with source: sequence-log and every mismatch with its detector', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
			['range-checksum:0', { detector: 'range-checksum', count: 5, checksum: 'abc' }],
		]);
		const { source } = makeFakeSource({
			sequencePages: [
				{
					rows: [{ sequence: 1, id: 1, collection: 'products' as const, type: 'update' }],
					cursor: { sequence: 1 },
					hasMore: false,
				},
			],
			hashScansBySweep: [[hashBucket({ bucket: 0, current_digest: '222', match: false })]],
			rangeScansBySweep: [[rangeBucket({ bucket: 0, checksum: 'DEF' })]],
			drillDowns: {
				'1000:0': [{ id: 5, status: 'changed' }],
			},
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0, sweepTaxRates: true },
			now: () => 0,
		});

		const outcome = await engine.poll();

		expect(outcome.changes.every((c) => c.source === 'sequence-log')).toBe(true);
		const detectors = outcome.integrityMismatches.map((m) => m.detector).sort();
		expect(detectors).toEqual(['hash-checksum', 'range-checksum']);
	});

	it('exposes matrix-derived defaults', () => {
		expect(DEFAULT_HYBRID_POLICY).toMatchObject({
			sequenceLogLimit: 100,
			sweepEveryNPolls: 10,
			hashChecksumBucketSize: 1000,
			rangeChecksumBucketSize: 1000,
			hashChecksumLimitBuckets: 50,
			// Tax-rate integrity sweep is experimental + opt-in (see sweepTaxRates doc).
			sweepTaxRates: false,
			escalateToRevisionHashAfter: 2,
		});
	});

	it('does not mutate a caller-supplied baseline map', async () => {
		const baseline: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 10, digest: '111', match: true }],
		]);
		const before = new Map(baseline);
		const { source } = makeFakeSource({
			sequencePages: [{ rows: [], cursor: { sequence: 0 }, hasMore: false }],
			hashScansBySweep: [[hashBucket({ bucket: 0, current_digest: '999', match: false })]],
			drillDowns: { '1000:0': [{ id: 1, status: 'changed' }] },
		});
		const engine = createHybridChangeSignalEngine({
			source,
			baselineDigests: baseline,
			policy: { sweepEveryNPolls: 1, sweepIntervalMs: 0 },
			now: () => 0,
		});

		await engine.poll();

		expect(baseline).toEqual(before);
	});
});

// --- Pure helper --------------------------------------------------------------

describe('digestsDiffer', () => {
	it('treats an unseen bucket as a mismatch', () => {
		expect(
			digestsDiffer(undefined, { detector: 'hash-checksum', count: 1, digest: '1', match: true })
		).toBe(true);
	});

	it('flags a hash bucket whose scan match is false even if digest is unchanged', () => {
		const prev = { detector: 'hash-checksum', count: 1, digest: '1', match: true } as const;
		expect(
			digestsDiffer(prev, { detector: 'hash-checksum', count: 1, digest: '1', match: false })
		).toBe(true);
	});

	it('flags a hash bucket whose digest or count moved', () => {
		const prev = { detector: 'hash-checksum', count: 1, digest: '1', match: true } as const;
		expect(
			digestsDiffer(prev, { detector: 'hash-checksum', count: 1, digest: '2', match: true })
		).toBe(true);
		expect(
			digestsDiffer(prev, { detector: 'hash-checksum', count: 2, digest: '1', match: true })
		).toBe(true);
	});

	it('does not flag a stable matching hash bucket', () => {
		const prev = { detector: 'hash-checksum', count: 1, digest: '1', match: true } as const;
		expect(
			digestsDiffer(prev, { detector: 'hash-checksum', count: 1, digest: '1', match: true })
		).toBe(false);
	});

	it('flags a range bucket whose checksum or count moved, not a stable one', () => {
		const prev = { detector: 'range-checksum', count: 1, checksum: 'a' } as const;
		expect(digestsDiffer(prev, { detector: 'range-checksum', count: 1, checksum: 'b' })).toBe(true);
		expect(digestsDiffer(prev, { detector: 'range-checksum', count: 2, checksum: 'a' })).toBe(true);
		expect(digestsDiffer(prev, { detector: 'range-checksum', count: 1, checksum: 'a' })).toBe(
			false
		);
	});
});
