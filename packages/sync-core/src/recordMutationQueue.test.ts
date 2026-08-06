import { describe, expect, it } from 'vitest';

import {
	InMemoryRecordMutationStorage,
	pendingRecordIds,
	RecordMutationQueue,
	recordMutationQueueMigrationStrategies,
	type RxRecordMutationCollection,
	RxRecordMutationStorage,
} from './recordMutationQueue';

import type { RecordMutation } from './recordMutation';

const mut = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm1',
	collectionName: 'products',
	operation: 'update',
	recordId: 'rec-A',
	origin: 'existing',
	payload: { id: 'rec-A' },
	baseRevision: null,
	queuedAt: '2026-06-26T00:00:00.000Z',
	...over,
});

describe('RecordMutationQueue', () => {
	it('migrates durable v1 rows with a deterministic synthesized seq', () => {
		const legacy = mut({ mutationId: 'durable-v1' });
		const migrated = recordMutationQueueMigrationStrategies[2](legacy);
		expect(migrated).toMatchObject({ mutationId: 'durable-v1', status: 'pending' });
		expect(migrated.seq).toBeGreaterThan(0);
		expect(recordMutationQueueMigrationStrategies[2](legacy).seq).toBe(migrated.seq);
	});

	it('v1 → v2 migration preserves cross-row queuedAt order (per-doc, no other rows consulted)', () => {
		// Adversarial ids: the earlier row's id sorts LAST lexicographically, so
		// only the timestamp component can be keeping the order right.
		const early = recordMutationQueueMigrationStrategies[2](
			mut({ mutationId: 'zzz-early', queuedAt: '2026-06-26T00:00:00.000Z' })
		);
		const late = recordMutationQueueMigrationStrategies[2](
			mut({ mutationId: 'aaa-late', queuedAt: '2026-06-26T00:00:01.000Z' })
		);
		expect(early.seq!).toBeLessThan(late.seq!);
	});

	it('appends each mutation as a distinct immutable entry (no in-place coalescing)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(
			mut({
				mutationId: 'm-create',
				operation: 'create',
				recordId: 'rec-A',
				queuedAt: '2026-06-26T00:00:00.000Z',
			})
		);
		await q.enqueue(
			mut({
				mutationId: 'm-edit',
				operation: 'update',
				recordId: 'rec-A',
				queuedAt: '2026-06-26T00:00:01.000Z',
			})
		);
		const pending = await q.pending();
		expect(pending.map((m) => m.mutationId)).toEqual(['m-create', 'm-edit']); // both kept, FIFO
		expect(pending[0].operation).toBe('create');
	});

	it('orders pending by queue-minted seq alone, honoring limit', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(mut({ mutationId: 'm-b', queuedAt: '2026-06-26T00:00:02.000Z' }));
		await q.enqueue(mut({ mutationId: 'm-a', queuedAt: '2026-06-26T00:00:01.000Z' }));
		await q.enqueue(mut({ mutationId: 'm-c', queuedAt: '2026-06-26T00:00:01.000Z' }));
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-b', 'm-a', 'm-c']);
		expect((await q.pending(1)).map((m) => m.mutationId)).toEqual(['m-b']);
	});

	it('acknowledge removes ONLY the exact pushed mutationId — an edit that lands mid-push survives', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		// a create is queued and a push picks it up...
		await q.enqueue(mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-A' }));
		const [pushed] = await q.pending();
		// ...then the user edits the same record before the push completes (separate entry)
		await q.enqueue(
			mut({
				mutationId: 'm-edit',
				operation: 'update',
				recordId: 'rec-A',
				queuedAt: '2026-06-26T00:00:02.000Z',
			})
		);
		// the push acks ONLY what it sent
		await q.acknowledge([pushed.mutationId]);
		const remaining = await q.pending();
		expect(remaining.map((m) => m.mutationId)).toEqual(['m-edit']); // the newer edit is NOT lost
	});

	it('keeps both a create and a later delete (no premature cancel of a maybe-in-flight create)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(
			mut({
				mutationId: 'm-create',
				operation: 'create',
				recordId: 'rec-A',
				queuedAt: '2026-06-26T00:00:00.000Z',
			})
		);
		await q.enqueue(
			mut({
				mutationId: 'm-delete',
				operation: 'delete',
				recordId: 'rec-A',
				queuedAt: '2026-06-26T00:00:01.000Z',
			})
		);
		expect((await q.pending()).map((m) => m.operation)).toEqual(['create', 'delete']);
	});

	it('append is keyed by mutationId, so re-enqueuing the same mutation is idempotent', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(mut({ mutationId: 'm1' }));
		await q.enqueue(mut({ mutationId: 'm1' }));
		expect(await q.pending()).toHaveLength(1);
	});

	it('mints strictly increasing unique seqs across CONCURRENT enqueues (#507 E)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const queued = await Promise.all(
			['m-1', 'm-2', 'm-3', 'm-4', 'm-5'].map((mutationId, index) =>
				q.enqueue(mut({ mutationId, recordId: `rec-${index}` }))
			)
		);
		expect(queued.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5]); // call order, no duplicates
		expect((await q.pending()).map((m) => m.mutationId)).toEqual([
			'm-1',
			'm-2',
			'm-3',
			'm-4',
			'm-5',
		]);
	});

	it('retries the read-max+insert seq CAS on an insert conflict (409) from storage (#507 E)', async () => {
		const inner = new InMemoryRecordMutationStorage();
		let raced = false;
		const storage = {
			list: () => inner.list(),
			remove: (ids: readonly string[]) => inner.remove(ids),
			append: async (m: Parameters<InMemoryRecordMutationStorage['append']>[0]) => {
				if (!raced && m.mutationId === 'm-race') {
					raced = true;
					// A rival writer lands at the seq we computed, and our insert conflicts.
					await inner.append({
						...mut({ mutationId: 'm-rival', recordId: 'rec-R' }),
						seq: 1,
						status: 'pending',
					});
					throw Object.assign(new Error('insert conflict'), { status: 409 });
				}
				return inner.append(m);
			},
		};
		const queued = await new RecordMutationQueue(storage).enqueue(mut({ mutationId: 'm-race' }));
		expect(queued.seq).toBe(2); // re-read max after the conflict, minted above the rival
	});

	it('same-queuedAt create+update drains create-first regardless of adversarial mutationIds (#507 regression 5)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const sameMs = '2026-07-10T00:00:00.000Z';
		// The update's id sorts FIRST lexicographically — the old (queuedAt, mutationId)
		// order would push it before its create. seq must not care.
		await q.enqueue(mut({ mutationId: 'zz-create', operation: 'create', queuedAt: sameMs }));
		await q.enqueue(mut({ mutationId: 'aa-update', operation: 'update', queuedAt: sameMs }));
		expect((await q.pending()).map((m) => m.operation)).toEqual(['create', 'update']);
	});

	it('a stranded same-seq pair drains superseded-first: the coalesce generation breaks the tie, not the mutationId', async () => {
		// A crash between the coalesce's insert and its remove leaves BOTH rows at
		// one seq. The replacement carries the latest snapshot and must drain LAST
		// so the server converges on it — even with adversarial id ordering.
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.replace({ ...mut({ mutationId: 'zz-superseded' }), seq: 1, status: 'pending' });
		await q.replace({
			...mut({ mutationId: 'aa-replacement' }),
			seq: 1,
			coalesced: 1,
			status: 'pending',
		});
		expect((await q.pending()).map((m) => m.mutationId)).toEqual([
			'zz-superseded',
			'aa-replacement',
		]);
	});

	it('restores the original queue when inserting a removed chain fails after suffix rows were shifted', async () => {
		const inner = new InMemoryRecordMutationStorage();
		const original = [
			{
				...mut({ mutationId: 'm-earlier', recordId: 'rec-B' }),
				seq: 1,
				status: 'pending' as const,
			},
			{ ...mut({ mutationId: 'm-newcomer' }), seq: 2, status: 'pending' as const },
			{ ...mut({ mutationId: 'm-suffix', recordId: 'rec-C' }), seq: 3, status: 'pending' as const },
		];
		for (const row of original) await inner.append(row);
		let appendCount = 0;
		const failure = new Error('restored append failed');
		const storage = {
			list: () => inner.list(),
			remove: (ids: readonly string[]) => inner.remove(ids),
			append: async (mutation: Parameters<InMemoryRecordMutationStorage['append']>[0]) => {
				appendCount += 1;
				if (appendCount === 4) throw failure;
				await inner.append(mutation);
			},
		};
		const q = new RecordMutationQueue(storage);
		const removed = [
			{
				...mut({ mutationId: 'm-create', operation: 'create' }),
				seq: 1,
				status: 'pending' as const,
			},
			{ ...mut({ mutationId: 'm-update' }), seq: 2, status: 'pending' as const },
		];

		await expect(q.restoreAheadOfRecordNewcomers(removed)).rejects.toBe(failure);
		expect((await q.pending()).map(({ mutationId, seq }) => ({ mutationId, seq }))).toEqual(
			original.map(({ mutationId, seq }) => ({ mutationId, seq }))
		);
	});

	it('pending() excludes rejected dead letters but keeps claimed, conflicted, and needs-revision rows', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const claimed = await q.enqueue(mut({ mutationId: 'm-claimed', recordId: 'rec-A' }));
		const conflicted = await q.enqueue(mut({ mutationId: 'm-conflicted', recordId: 'rec-B' }));
		const parked = await q.enqueue(mut({ mutationId: 'm-needs-revision', recordId: 'rec-D' }));
		const dead = await q.enqueue(mut({ mutationId: 'm-rejected', recordId: 'rec-C' }));
		await q.replace({ ...claimed, status: 'claimed' });
		await q.replace({ ...conflicted, status: 'conflicted', conflictRevision: 'sha256:theirs' });
		await q.replace({ ...parked, status: 'needs-revision' });
		await q.replace({ ...dead, status: 'rejected' });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual([
			'm-claimed',
			'm-conflicted',
			'm-needs-revision',
		]);
		expect((await q.all()).map((m) => m.mutationId).sort()).toEqual([
			'm-claimed',
			'm-conflicted',
			'm-needs-revision',
			'm-rejected',
		]); // terminal rows persist for conflicts()
	});

	it('gate2 item 4: the v2 → v3 migration passes rows through (status enum widening only)', () => {
		const row = { ...mut({ mutationId: 'durable-v2' }), seq: 7, status: 'conflicted' as const };
		expect(recordMutationQueueMigrationStrategies[3](row)).toEqual(row);
	});

	it('#832: the v3 → v4 migration passes a dead letter through untouched (additive fields only)', () => {
		// A pre-#832 dead letter has no recorded reason and no requeue provenance —
		// it must still arrive intact and requeue-able, because these are exactly the
		// stranded sales the recovery path exists to rescue.
		const row = { ...mut({ mutationId: 'stranded-v3' }), seq: 7, status: 'rejected' as const };
		expect(recordMutationQueueMigrationStrategies[4](row)).toEqual(row);
	});
});

describe('RecordMutationQueue — conditional (CAS) transitions (#507 P1-2)', () => {
	it('#832: removeIfStatus settles a dead letter exactly once, so concurrent recoveries cannot both win', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const row = await q.enqueue(mut({ mutationId: 'm-dead' }));
		await q.replace({ ...row, status: 'rejected' });

		// Both recoveries raced to here; only one may retire the row.
		const [first, second] = await Promise.all([
			q.removeIfStatus('m-dead', 'rejected'),
			q.removeIfStatus('m-dead', 'rejected'),
		]);
		expect([first, second].filter(Boolean)).toHaveLength(1);
		expect(await q.all()).toEqual([]);
	});

	it('#832: removeIfStatus refuses a row that is no longer in the expected status', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(mut({ mutationId: 'm-pending' }));

		expect(await q.removeIfStatus('m-pending', 'rejected')).toBe(false);
		expect(await q.removeIfStatus('m-absent', 'rejected')).toBe(false);
		expect((await q.all()).map((m) => m.mutationId)).toEqual(['m-pending']);
	});

	it('claim refuses a row that was removed after the scan — never resurrects it', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const row = await q.enqueue(mut({ mutationId: 'm-annihilated' }));
		await q.remove(['m-annihilated']); // an annihilating delete got there first
		expect(await q.claim({ ...row, status: 'claimed' })).toBe(false);
		expect(await q.all()).toEqual([]); // NOT re-inserted by the refused claim
	});

	it('claim accepts pending and stale-claimed rows, refuses terminal ones', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const pendingRow = await q.enqueue(mut({ mutationId: 'm-pending', recordId: 'rec-A' }));
		const staleClaim = await q.enqueue(mut({ mutationId: 'm-stale', recordId: 'rec-B' }));
		const terminal = await q.enqueue(mut({ mutationId: 'm-conflicted', recordId: 'rec-C' }));
		await q.replace({ ...staleClaim, status: 'claimed' }); // a crashed drain left this
		await q.replace({ ...terminal, status: 'conflicted', conflictRevision: 'sha256:theirs' });
		expect(await q.claim({ ...pendingRow, status: 'claimed' })).toBe(true);
		expect(await q.claim({ ...staleClaim, status: 'claimed' })).toBe(true); // crash recovery stays possible
		expect(await q.claim({ ...terminal, status: 'claimed' })).toBe(false); // resolution owns terminal rows
		// needs-revision (gate2 item 4) is terminal-until-resolved too: the drain
		// must never claim past the explicit resolution seam.
		const parked = await q.enqueue(mut({ mutationId: 'm-parked', recordId: 'rec-D' }));
		await q.replace({ ...parked, status: 'needs-revision' });
		expect(await q.claim({ ...parked, status: 'claimed' })).toBe(false);
	});

	it('coalesceInto swaps only a still-pending prior; a claimed or consumed prior refuses untouched', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const prior = await q.enqueue(mut({ mutationId: 'm-prior' }));
		const replacement = {
			...mut({ mutationId: 'm-replacement', payload: { id: 'rec-A', v: 2 } }),
			seq: prior.seq,
			coalesced: 1,
			status: 'pending' as const,
		};
		// Drain claims the prior first → the coalesce must refuse and change nothing.
		await q.claim({ ...prior, status: 'claimed' });
		expect(await q.coalesceInto('m-prior', replacement)).toBe(false);
		expect((await q.all()).map((m) => m.mutationId)).toEqual(['m-prior']);
		// A missing prior (already consumed by a concurrent coalesce) refuses too.
		expect(await q.coalesceInto('m-gone', replacement)).toBe(false);
		expect((await q.all()).map((m) => m.mutationId)).toEqual(['m-prior']);
		// Back to pending → the swap applies atomically: replacement in, prior out.
		await q.replace({ ...prior, status: 'pending' });
		expect(await q.coalesceInto('m-prior', replacement)).toBe(true);
		expect((await q.all()).map((m) => m.mutationId)).toEqual(['m-replacement']);
	});

	it('removePending refuses a claimed row — an in-flight create cannot be annihilated', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const row = await q.enqueue(mut({ mutationId: 'm-create', operation: 'create' }));
		await q.claim({ ...row, status: 'claimed' });
		expect(await q.removePending('m-create')).toBe(false);
		expect((await q.all()).map((m) => ({ id: m.mutationId, status: m.status }))).toEqual([
			{ id: 'm-create', status: 'claimed' },
		]);
		// Reverted to pending (push failed / aborted) → the remove applies.
		await q.replace({ ...row, status: 'pending' });
		expect(await q.removePending('m-create')).toBe(true);
		expect(await q.all()).toEqual([]);
	});

	it('#516 review P1: enqueueWhen appends only while the precondition holds against the in-turn re-read', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(mut({ mutationId: 'm-a' }));
		// Precondition still true inside the turn → seq minted and inserted.
		const appended = await q.enqueueWhen(
			mut({ mutationId: 'm-b', recordId: 'rec-B' }),
			(rows) => rows.length === 1
		);
		expect(appended).toMatchObject({ mutationId: 'm-b', seq: 2, status: 'pending' });
		// The queue moved since the (simulated) stale read → refused, nothing inserted.
		expect(
			await q.enqueueWhen(
				mut({ mutationId: 'm-c', recordId: 'rec-C' }),
				(rows) => rows.length === 1
			)
		).toBeNull();
		expect((await q.all()).map((m) => m.mutationId).sort()).toEqual(['m-a', 'm-b']);
	});
});

describe('pendingRecordIds', () => {
	it('collects the record ids of all pending mutations (for the pull-apply guard)', () => {
		const ids = pendingRecordIds([
			mut({ recordId: 'rec-A' }),
			mut({ recordId: 'rec-B' }),
			mut({ recordId: 'rec-A' }),
		]);
		expect([...ids].sort()).toEqual(['rec-A', 'rec-B']);
	});

	it('drops rejected dead letters — their record is syncable again (#507 regression 4)', () => {
		const ids = pendingRecordIds([
			{ ...mut({ recordId: 'rec-dead' }), status: 'rejected' },
			{ ...mut({ mutationId: 'm2', recordId: 'rec-live' }), status: 'pending' },
			mut({ mutationId: 'm3', recordId: 'rec-v1' }), // a pre-status row still guards
		]);
		expect([...ids].sort()).toEqual(['rec-live', 'rec-v1']);
	});
});

describe('RxRecordMutationStorage', () => {
	// Fake RxDB collection keyed by mutationId; find() returns RxDocument-like rows ({ toJSON }).
	function fakeCollection() {
		const store = new Map<string, RecordMutation>();
		const col = {
			store,
			bulkUpsert: async (items: RecordMutation[]) => {
				for (const m of items) store.set(m.mutationId, m);
			},
			find: () => ({ exec: async () => [...store.values()].map((m) => ({ toJSON: () => m })) }),
			bulkRemove: async (ids: string[]) => {
				for (const id of ids) store.delete(id);
			},
		};
		return col;
	}

	it('append persists a mutation and list returns it via toJSON', async () => {
		const storage = new RxRecordMutationStorage(fakeCollection());
		await storage.append(mut({ mutationId: 'm1' }));
		expect((await storage.list()).map((m) => m.mutationId)).toEqual(['m1']);
	});

	it('append is a keyed upsert on the immutable mutationId (no duplicate rows)', async () => {
		const storage = new RxRecordMutationStorage(fakeCollection());
		await storage.append(mut({ mutationId: 'm1', payload: { id: 'rec-A', v: 1 } }));
		await storage.append(mut({ mutationId: 'm1', payload: { id: 'rec-A', v: 2 } }));
		expect(await storage.list()).toHaveLength(1);
	});

	it('remove deletes exactly the given mutationIds — an edit landing mid-push survives', async () => {
		const storage = new RxRecordMutationStorage(fakeCollection());
		await storage.append(mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-A' }));
		await storage.append(mut({ mutationId: 'm-edit', operation: 'update', recordId: 'rec-A' }));
		await storage.remove(['m-create']);
		expect((await storage.list()).map((m) => m.mutationId)).toEqual(['m-edit']);
	});

	it('remove of an empty list is a no-op (skips bulkRemove)', async () => {
		const col = fakeCollection();
		let called = false;
		col.bulkRemove = async () => {
			called = true;
		};
		await new RxRecordMutationStorage(col).remove([]);
		expect(called).toBe(false);
	});

	it('remove rejects when RxDB resolves with a per-row failure', async () => {
		const col = fakeCollection();
		col.bulkRemove = async () => ({ error: [{ documentId: 'm-create', status: 409 }] }) as never;
		await expect(new RxRecordMutationStorage(col).remove(['m-create'])).rejects.toThrow(
			'mutation queue remove'
		);
	});

	/**
	 * TWO PROCESSES, ONE STORAGE (#832 follow-up). Each `RecordMutationQueue` has
	 * its own in-memory transition chain, so two instances over one storage is
	 * exactly the two-Electron-windows condition: neither chain can see the other,
	 * and only the durable row is shared.
	 */
	describe('durable resolution claim across instances', () => {
		const shared = () => {
			const storage = new InMemoryRecordMutationStorage();
			return { storage, a: new RecordMutationQueue(storage), b: new RecordMutationQueue(storage) };
		};
		const seedRejected = async (q: RecordMutationQueue) => {
			const row = await q.enqueue(mut({ mutationId: 'dead-1' }));
			await q.replace({ ...row, status: 'rejected' });
		};

		// EXPECTED TO FAIL — this is the spike's finding, kept executable so it
		// starts passing the moment the storage port grows a real CAS.
		//
		// `transact` serializes transitions within ONE instance. Across instances
		// there is nothing: `list()` drops `_rev` (plain `toJSON()`) and `append()` is
		// an unconditional `bulkUpsert`, so read-then-write from two processes
		// interleaves and the second write simply overwrites the first. Both windows
		// therefore believe they hold the claim.
		//
		// This is not a flaw introduced by the claim — it is true of every existing
		// "CAS" on this queue (`removeIfStatus`, `claim`, `coalesceInto`). They are
		// in-process CAS only. A durable cross-process lock needs a revision-checked
		// write in `RecordMutationStorage`; see the PR for the two candidate shapes.
		it.fails(
			'lets exactly ONE instance claim a dead letter; the other is told to wait',
			async () => {
				const { a, b } = shared();
				await seedRejected(a);

				const [first, second] = await Promise.all([
					a.claimForResolution({
						mutationId: 'dead-1',
						expectedStatus: 'rejected',
						holder: 'window-A',
						untilIso: '2026-01-01T00:00:30.000Z',
						nowMs: 0,
					}),
					b.claimForResolution({
						mutationId: 'dead-1',
						expectedStatus: 'rejected',
						holder: 'window-B',
						untilIso: '2026-01-01T00:00:30.000Z',
						nowMs: 0,
					}),
				]);

				expect([first, second].filter((outcome) => outcome === 'claimed')).toHaveLength(1);
				expect([first, second].filter((outcome) => outcome === 'held')).toHaveLength(1);
			}
		);

		it('lets a crashed window claim be STOLEN once its deadline passes', async () => {
			const { a, b } = shared();
			await seedRejected(a);
			await a.claimForResolution({
				mutationId: 'dead-1',
				expectedStatus: 'rejected',
				holder: 'window-A',
				untilIso: '2026-01-01T00:00:30.000Z',
				nowMs: 0,
			});

			// Window A died without releasing. Before the deadline the row is locked…
			expect(
				await b.claimForResolution({
					mutationId: 'dead-1',
					expectedStatus: 'rejected',
					holder: 'window-B',
					untilIso: '2026-01-01T00:01:00.000Z',
					nowMs: Date.parse('2026-01-01T00:00:29.000Z'),
				})
			).toBe('held');
			// …and after it, recovery is possible again. A permanent lock on a dead
			// letter is a completed sale nobody can ever recover.
			expect(
				await b.claimForResolution({
					mutationId: 'dead-1',
					expectedStatus: 'rejected',
					holder: 'window-B',
					untilIso: '2026-01-01T00:01:00.000Z',
					nowMs: Date.parse('2026-01-01T00:00:31.000Z'),
				})
			).toBe('claimed');
		});

		it('hands the row straight back on release, and reports a settled row as gone', async () => {
			const { a, b } = shared();
			await seedRejected(a);
			await a.claimForResolution({
				mutationId: 'dead-1',
				expectedStatus: 'rejected',
				holder: 'window-A',
				untilIso: '2026-01-01T00:00:30.000Z',
				nowMs: 0,
			});
			await a.releaseResolutionClaim('dead-1', 'window-A');

			expect(
				await b.claimForResolution({
					mutationId: 'dead-1',
					expectedStatus: 'rejected',
					holder: 'window-B',
					untilIso: '2026-01-01T00:00:30.000Z',
					nowMs: 0,
				})
			).toBe('claimed');

			// The other window resolved it in the meantime.
			await b.remove(['dead-1']);
			expect(
				await a.claimForResolution({
					mutationId: 'dead-1',
					expectedStatus: 'rejected',
					holder: 'window-A',
					untilIso: '2026-01-01T00:00:30.000Z',
					nowMs: 0,
				})
			).toBe('gone');
		});

		it('never RESURRECTS a row the winner already retired', async () => {
			const { a, storage } = shared();
			await seedRejected(a);
			await a.claimForResolution({
				mutationId: 'dead-1',
				expectedStatus: 'rejected',
				holder: 'window-A',
				untilIso: '2026-01-01T00:00:30.000Z',
				nowMs: 0,
			});
			// The resolution succeeded and removed the row; the release still runs.
			await a.remove(['dead-1']);
			await a.releaseResolutionClaim('dead-1', 'window-A');

			expect(await storage.list()).toEqual([]);
		});

		it('does not clear a claim that has since been stolen by someone else', async () => {
			const { a, b } = shared();
			await seedRejected(a);
			await a.claimForResolution({
				mutationId: 'dead-1',
				expectedStatus: 'rejected',
				holder: 'window-A',
				untilIso: '2026-01-01T00:00:30.000Z',
				nowMs: 0,
			});
			await b.claimForResolution({
				mutationId: 'dead-1',
				expectedStatus: 'rejected',
				holder: 'window-B',
				untilIso: '2026-01-01T00:02:00.000Z',
				nowMs: Date.parse('2026-01-01T00:00:31.000Z'),
			});

			// A wakes up late and releases. It must not unlock B's live resolution.
			await a.releaseResolutionClaim('dead-1', 'window-A');

			expect((await b.all())[0]).toMatchObject({ resolutionClaimBy: 'window-B' });
		});
	});

	it('drives the queue end-to-end with FIFO pending ordering', async () => {
		const q = new RecordMutationQueue(new RxRecordMutationStorage(fakeCollection()));
		await q.enqueue(mut({ mutationId: 'm-b', queuedAt: '2026-06-26T00:00:02.000Z' }));
		await q.enqueue(mut({ mutationId: 'm-a', queuedAt: '2026-06-26T00:00:01.000Z' }));
		await q.acknowledge(['m-a']);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-b']);
	});
});
