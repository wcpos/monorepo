import { serialize as structuredSerialize } from 'node:v8';

import { describe, expect, it, vi } from 'vitest';

import { createFakeMutationCollection } from '@wcpos/sync-core/testing';
import { drainMutationQueue, RecordMutationQueue, RxRecordMutationStorage } from '@wcpos/sync-core';
import type { QueuedMutation, RxRecordMutationCollection } from '@wcpos/sync-core';

import { writeFacetFor } from '../collections/collection-descriptors';
import { withoutLocallyProtected } from './local-work-guard';
import { enqueueWriteIntent, queueFor, requeueBornTwiceSnapshot } from './write-intents';

import type { RxDatabase } from 'rxdb';

/**
 * Wrap a pre-seeded `queued` Map in the revision-checked RxDB-like contract, so a
 * test that builds its starting rows as a plain Map still exercises the
 * conditional writes the coalesce path now uses. The Map stays the assertion
 * view; a side revision counter provides the optimistic-concurrency token.
 */
function revCollectionOverMap(queued: Map<string, QueuedMutation>): RxRecordMutationCollection {
	const revs = new Map<string, string>();
	let counter = 0;
	const bump = (id: string) => {
		counter += 1;
		revs.set(id, `1-seed-${counter}`);
	};
	for (const id of queued.keys()) bump(id);
	const conflict = () => Object.assign(new Error('CONFLICT'), { status: 409, code: 'CONFLICT' });
	const docFor = (id: string) => {
		if (!queued.has(id)) return undefined;
		const captured = revs.get(id);
		return {
			toJSON: () => queued.get(id)!,
			get revision() {
				return revs.get(id) ?? '';
			},
			modify: async (change: (row: QueuedMutation) => QueuedMutation) => {
				if (!queued.has(id) || revs.get(id) !== captured) throw conflict();
				queued.set(id, change(queued.get(id)!));
				bump(id);
			},
			remove: async () => {
				if (!queued.has(id) || revs.get(id) !== captured) throw conflict();
				queued.delete(id);
				revs.delete(id);
			},
		};
	};
	return {
		bulkUpsert: async (items: QueuedMutation[]) => {
			for (const item of items) {
				queued.set(item.mutationId, item);
				bump(item.mutationId);
			}
			return { error: [] };
		},
		bulkInsert: async (items: QueuedMutation[]) => {
			const error: { documentId: string; status: number }[] = [];
			for (const item of items) {
				if (queued.has(item.mutationId)) error.push({ documentId: item.mutationId, status: 409 });
				else {
					queued.set(item.mutationId, item);
					bump(item.mutationId);
				}
			}
			return { success: [], error };
		},
		find: () => ({ exec: async () => [...queued.keys()].map((id) => docFor(id)!) }),
		bulkRemove: async (ids: string[]) => {
			for (const id of ids) {
				queued.delete(id);
				revs.delete(id);
			}
			return { error: [] };
		},
	};
}

async function enqueueCatalogPayload(
	collectionName: 'products' | 'variations' | 'customers',
	payload: Record<string, unknown>
) {
	const mutationCollection = createFakeMutationCollection();
	let residentData: Record<string, unknown> = {
		payload: { name: 'Probe' },
		sync: { revision: 'sha256:server-r1' },
		local: { dirty: false, pendingMutationIds: [] },
	};
	const resident = {
		incrementalModify: async (
			modify: (data: Record<string, unknown>) => Record<string, unknown>
		) => {
			residentData = modify(residentData);
		},
		remove: async () => undefined,
		toJSON: () => residentData,
	};
	const db = {
		collections: {
			[collectionName]: { findOne: () => ({ exec: async () => resident }) },
			recordMutations: mutationCollection,
		},
	} as unknown as RxDatabase;

	await enqueueWriteIntent({
		db,
		intent: {
			collection: collectionName,
			operation: 'update',
			recordId: 'product-1',
			payload,
		},
		mintUuid: () => 'mutation-1',
		now: () => '2026-08-14T00:00:00.000Z',
	});

	return [...mutationCollection.store.values()][0]?.mutation.payload;
}

describe('enqueueWriteIntent', () => {
	it.each(['rejected', 'pending'] as const)(
		'a pull during %s annihilation preserves the resident and queues a server delete',
		async (status) => {
			const storage = createFakeMutationCollection();
			let data: Record<string, unknown> = { payload: { id: 0 }, sync: {} };
			let removed = false;
			const resident = {
				toJSON: () => data,
				remove: async () => {
					removed = true;
				},
				incrementalModify: async (modify: (row: typeof data) => typeof data) => {
					data = modify(data);
				},
			};
			const db = {
				collections: {
					orders: { findOne: () => ({ exec: async () => (removed ? null : resident) }) },
					recordMutations: storage,
				},
			} as unknown as RxDatabase;
			const queue = queueFor(db);
			await storage.bulkUpsert([
				{
					mutationId: 'create',
					collectionName: 'orders',
					recordId: 'order',
					operation: 'create',
					origin: 'minted',
					payload: { id: 0 },
					baseRevision: null,
					queuedAt: '2026-09-18T00:00:00.000Z',
					status,
				},
			]);
			const mark = queue.markForAnnihilation.bind(queue);
			vi.spyOn(queue, 'markForAnnihilation').mockImplementationOnce(async (...args) => {
				const marked = await mark(...args);
				data = { ...data, remoteId: '42', sync: { revision: 'pulled-revision' } };
				return marked;
			});
			const receipt = await enqueueWriteIntent({
				db,
				intent: { collection: 'orders', operation: 'delete', recordId: 'order' },
				mintUuid: () => 'delete',
				now: () => '2026-09-18T00:00:01.000Z',
			});
			expect(removed).toBe(false);
			expect(receipt.annihilated).not.toBe(true);
			expect(await queue.all()).toEqual([
				expect.objectContaining({ mutationId: 'create', status }),
				expect.objectContaining({ operation: 'delete', baseRevision: 'pulled-revision' }),
			]);
			expect((await queue.all()).every((row) => !row.supersededBy)).toBe(true);
			expect(storage.store.has('orders/order')).toBe(false);
		}
	);

	it.each([false, true, 'renewal'])('slow dirty mark: failed=%s', async (failed) => {
		const storage = createFakeMutationCollection();
		let now = Date.now();
		let data: Record<string, unknown> = { payload: { id: 0 }, sync: {} };
		const resident = {
			toJSON: () => data,
			incrementalModify: async (modify: (row: typeof data) => typeof data) => {
				now += 30_001;
				if (failed) throw new Error('dirty mark failed');
				data = modify(data);
			},
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: storage,
			},
		} as unknown as RxDatabase;
		const queue = queueFor(db);
		if (failed === 'renewal') {
			const enqueue = queue.enqueue.bind(queue);
			vi.spyOn(queue, 'enqueue').mockImplementationOnce(async (row) => {
				const appended = await enqueue(row);
				now += 30_001;
				return appended;
			});
		}
		const writing = enqueueWriteIntent({
			db,
			mintUuid: () => 'slow',
			now: () => new Date(now).toISOString(),
			intent: {
				collection: 'orders',
				operation: 'create',
				recordId: 'order',
				payload: { id: 0 },
			},
		});
		if (failed) await expect(writing).rejects.toThrow();
		else {
			expect(await writing).toMatchObject({ mutationId: 'slow', recordId: 'order' });
			expect(data.local).toMatchObject({ dirty: true, pendingMutationIds: ['slow'] });
		}
		const push = vi.fn(async (mutation) => ({
			outcome: 'created' as const,
			mutation,
			document: { id: 1 },
			currentRevision: 'r1',
		}));
		expect(await drainMutationQueue({ queue, push, now: () => now })).toMatchObject({
			pushed: failed ? 0 : 1,
			rejected: [],
		});
		expect(push).toHaveBeenCalledTimes(failed ? 0 : 1);
		expect(await queue.all()).toEqual([]);
	});

	it('a late append after admission loss survives as a dead letter, not a resurrected sale', async () => {
		const storage = createFakeMutationCollection();
		let present = true;
		let now = Date.now();
		const resident = {
			toJSON: () => ({ payload: { id: 0 }, sync: {} }),
			remove: async () => {
				present = false;
			},
			incrementalModify: vi.fn(),
		};
		const collections = {
			orders: { findOne: () => ({ exec: async () => (present ? resident : null) }) },
			recordMutations: storage,
		};
		const db = { collections } as unknown as RxDatabase;
		const otherDb = { collections } as unknown as RxDatabase;
		const queue = queueFor(db);
		const other = queueFor(otherDb);
		const enqueue = queue.enqueue.bind(queue);
		const fence = other.fenceForVoid.bind(other);
		vi.spyOn(queue, 'enqueue').mockImplementationOnce(async (mutation) => {
			now += 30_001;
			let appended: QueuedMutation;
			vi.spyOn(other, 'fenceForVoid').mockImplementationOnce(async (...args) => {
				const held = await fence(...args);
				appended = await enqueue(mutation);
				return held;
			});
			await enqueueWriteIntent({
				db: otherDb,
				intent: { collection: 'orders', operation: 'delete', recordId: 'order' },
				mintUuid: () => 'void',
				now: () => new Date(now).toISOString(),
			});
			return appended!;
		});
		await expect(
			enqueueWriteIntent({
				db,
				intent: {
					collection: 'orders',
					operation: 'create',
					recordId: 'order',
					payload: { id: 0 },
				},
				mintUuid: () => 'late',
				now: () => new Date(now).toISOString(),
			})
		).rejects.toMatchObject({ reason: 'void-in-progress' });
		expect(present).toBe(false);
		expect(await queue.pendingResetCount(now)).toBe(1);
		const push = vi.fn();
		await drainMutationQueue({ queue, push, now: () => now });
		expect(push).not.toHaveBeenCalled();
		expect(await queue.all()).toMatchObject([
			{
				mutationId: 'late',
				admittedBy: 'late',
				status: 'rejected',
				rejectedReason: 'admission-lost',
			},
		]);
	});

	it.each([
		'void between read and admission',
		'expired admission',
		'ordinary edit',
		'write and release fail',
	])(
		'preserves resident and queued work while handling the admission interleaving: %s',
		async (race) => {
			const storage = createFakeMutationCollection();
			let present = true;
			let edited = false;
			let now = Date.now();
			const resident = {
				toJSON: () => ({ payload: { id: 0, edited }, sync: {} }),
				remove: async () => {
					present = false;
				},
				incrementalModify: vi.fn(),
			};
			const db = {
				collections: {
					orders: { findOne: () => ({ exec: async () => (present ? resident : null) }) },
					recordMutations: storage,
				},
			} as unknown as RxDatabase;
			const queue = queueFor(db);
			const other = new RecordMutationQueue(new RxRecordMutationStorage(() => storage));
			const admit = queue.admitWriter.bind(queue);
			let id = 0;
			const deps = { db, mintUuid: () => `race-${++id}`, now: () => new Date(now).toISOString() };
			vi.spyOn(queue, 'admitWriter').mockImplementationOnce(async (name, record, token, time) => {
				if (race === 'void between read and admission') {
					await enqueueWriteIntent({
						...deps,
						intent: { collection: 'orders', recordId: record, operation: 'delete' },
					});
					return admit(name, record, token, time);
				}
				const admitted = await admit(name, record, token, time);
				if (race === 'ordinary edit') {
					edited = true;
					return admitted;
				}
				if (race === 'write and release fail') {
					vi.spyOn(queue, 'releaseWriter').mockRejectedValue(new Error('release failed'));
					vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('write failed'));
					return admitted;
				}
				now += 30_001;
				await other.clearExpiredAnnihilation(now);
				expect(await other.fenceForVoid(name, record, 'other-void', now)).toBe(true);
				return admitted;
			});
			const writing = enqueueWriteIntent({
				...deps,
				intent: {
					collection: 'orders',
					recordId: 'order-1',
					operation: 'create',
					payload: { id: 0 },
				},
			});
			if (race === 'ordinary edit') {
				await expect(writing).resolves.toMatchObject({ recordId: 'order-1' });
				expect(await queue.all()).toHaveLength(1);
				return;
			}
			if (race === 'write and release fail') await expect(writing).rejects.toThrow('write failed');
			else await expect(writing).rejects.toMatchObject({ status: 428 });
			expect(await queue.all()).toEqual([]);
			expect(resident.incrementalModify).not.toHaveBeenCalled();
		}
	);

	it.each(['foreign admission', 'owned committed fence'])(
		'a refused fence releases only uncommitted marks: %s',
		async (owner) => {
			const mutationCollection = createFakeMutationCollection();
			const resident = { toJSON: () => ({ payload: { id: 0 }, sync: {} }) };
			const db = {
				collections: {
					orders: { findOne: () => ({ exec: async () => resident }) },
					recordMutations: mutationCollection,
				},
			} as unknown as RxDatabase;
			const queue = queueFor(db);
			const other = new RecordMutationQueue(new RxRecordMutationStorage(() => mutationCollection));
			await queue.enqueue({
				mutationId: 'create',
				collectionName: 'orders',
				recordId: 'order-1',
				operation: 'create',
				origin: 'minted',
				payload: { id: 0 },
				baseRevision: null,
				queuedAt: '2026-09-18T00:00:00.000Z',
			});
			const fence = queue.fenceForVoid.bind(queue);
			vi.spyOn(queue, 'fenceForVoid').mockImplementationOnce(async (name, id, token, now) => {
				if (owner === 'foreign admission') {
					await other.admitWriter(name, id, 'other-writer', now);
					return fence(name, id, token, now);
				}
				await fence(name, id, token, now);
				await queue.setVoidPhase(name, id, token, 'committed');
				// A failed rollback CAS must leave the durable committed instruction intact.
				const find = mutationCollection.find.bind(mutationCollection);
				vi.spyOn(mutationCollection, 'find').mockImplementation(() => ({
					exec: async () =>
						(await find().exec()).map((doc) => {
							if (!('toJSON' in doc)) return doc;
							return {
								...doc,
								modify: async (change) => {
									if (doc.toJSON().payload.phase === 'committed')
										throw Object.assign(new Error('CONFLICT'), { status: 409 });
									await doc.modify!(change);
								},
							};
						}),
				}));
				return false;
			});
			await expect(
				enqueueWriteIntent({
					db,
					intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
					mintUuid: () => 'void',
					now: () => '2026-09-18T00:00:01.000Z',
				})
			).rejects.toMatchObject({ status: 428, reason: 'void-in-progress' });
			expect((await queue.all())[0].supersededBy).toBe(
				owner === 'foreign admission' ? undefined : 'void'
			);
			expect(mutationCollection.store.get('orders/order-1')?.mutation).toMatchObject(
				owner === 'foreign admission'
					? { admittedBy: 'other-writer' }
					: { payload: { phase: 'committed' } }
			);
		}
	);

	it.each([
		{ name: 'legacy rejected create', legacy: true, id: 0, rejected: true, annihilated: true },
		{ name: 'rejected born-local create', id: 0, rejected: true, annihilated: true },
		{ name: 'born-local record with no queue rows', id: 0, rejected: false, annihilated: true },
		{ name: 'bare-ack server record', id: 0, remoteId: '42', rejected: false, annihilated: false },
		{ name: 'server record with no revision', id: 42, rejected: false, annihilated: false },
		{
			// `identity-ambiguous`: the push adapter matched MORE than one server record,
			// so a server-side sale may exist — the resident and its dead letter stay.
			name: 'rejected create the server may already hold',
			id: 0,
			rejected: true,
			reason: 'identity-ambiguous',
			annihilated: false,
		},
	])('deletes $name only when it is born-local', async (testCase) => {
		const { id, remoteId, rejected, reason, annihilated, legacy } = testCase;
		const mutationCollection = Object.assign(createFakeMutationCollection(), {
			schema: { version: legacy ? 5 : 7 },
		});
		const insert = mutationCollection.bulkInsert.bind(mutationCollection);
		mutationCollection.bulkInsert = async (rows) => {
			if (legacy) for (const row of rows) expect(row).not.toHaveProperty('expiresAt');
			return insert(rows);
		};
		if (rejected) {
			await mutationCollection.bulkUpsert([
				{
					mutationId: 'create-1',
					collectionName: 'orders',
					recordId: 'order-1',
					operation: 'create',
					origin: 'minted',
					payload: { id: 0, status: 'pos-open' },
					baseRevision: null,
					queuedAt: '2026-09-18T00:00:00.000Z',
					status: 'rejected',
					attempts: 1,
					...(reason ? { rejectedReason: reason } : {}),
				},
			]);
		}
		let removed = false;
		const resident = {
			toJSON: () => ({ remoteId, payload: { id, status: 'pos-open' }, sync: {} }),
			remove: async () => {
				if (!legacy)
					expect(mutationCollection.store.get('orders/order-1')?.mutation.payload.phase).toBe(
						'committed'
					);
				removed = true;
			},
		};
		const orders = { findOne: () => ({ exec: async () => (removed ? null : resident) }) };
		const db = {
			collections: { orders, recordMutations: mutationCollection },
		} as unknown as RxDatabase;
		const observe = vi.fn();
		const result = enqueueWriteIntent({
			db,
			intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
			mintUuid: () => 'delete-1',
			now: () => '2026-09-18T00:00:01.000Z',
			observe,
		});

		if (annihilated) {
			await expect(result).resolves.toEqual({
				mutationId: 'delete-1',
				recordId: 'order-1',
				annihilated: true,
			});
			expect(await orders.findOne().exec()).toBeNull();
			expect(observe).toHaveBeenCalledWith({
				type: 'queue.write.annihilate',
				level: 'info',
				collection: 'orders',
				fields: { recordId: 'order-1', removed: rejected ? 1 : 0, deadLetters: rejected ? 1 : 0 },
			});
		} else {
			await expect(result).rejects.toThrow('baseRevision is required');
			expect(await orders.findOne().exec()).toBe(resident);
			expect(observe).not.toHaveBeenCalled();
		}
		// A dead letter survives only when the void was refused because of it.
		expect(mutationCollection.store.size).toBe(rejected && !annihilated ? 1 : 0);
	});

	it('refuses a late writer admission after the void final guard', async () => {
		const mutationCollection = createFakeMutationCollection();
		let releaseAppend!: () => void;
		let appendStarted!: () => void;
		const heldAppend = new Promise<void>((resolve) => {
			releaseAppend = resolve;
		});
		const started = new Promise<void>((resolve) => {
			appendStarted = resolve;
		});
		const insert = mutationCollection.bulkInsert.bind(mutationCollection);
		mutationCollection.bulkInsert = async (rows) => {
			if (rows.some((row) => row.admittedBy === 'late-writer')) {
				appendStarted();
				await heldAppend;
			}
			return insert(rows);
		};
		const append = mutationCollection.bulkUpsert.bind(mutationCollection);
		mutationCollection.bulkUpsert = async (rows) => {
			if (rows.some((row) => row.mutationId === 'late-writer')) {
				appendStarted();
				await heldAppend;
			}
			return append(rows);
		};
		let removed = false;
		let writerOutcome: Promise<unknown>;
		let data: Record<string, unknown> = { payload: { id: 0 }, sync: {} };
		const resident = {
			toJSON: () => data,
			incrementalModify: async (
				change: (row: Record<string, unknown>) => Record<string, unknown>
			) => {
				data = change(data);
			},
			remove: async () => {
				// The void has fenced and passed its last guard. Resume the OTHER
				// queue instance at its admission CAS (the append on the old implementation).
				releaseAppend();
				await writerOutcome;
				removed = true;
			},
		};
		const collections = {
			orders: { findOne: () => ({ exec: async () => (removed ? null : resident) }) },
			recordMutations: mutationCollection,
		};
		const db = { collections } as unknown as RxDatabase;
		const otherDb = { collections } as unknown as RxDatabase;
		const now = () => '2026-09-18T00:00:01.000Z';
		writerOutcome = enqueueWriteIntent({
			db: otherDb,
			now,
			mintUuid: () => 'late-writer',
			intent: {
				collection: 'orders',
				operation: 'create',
				recordId: 'order-1',
				payload: { id: 0 },
			},
		}).then(
			(receipt) => ({ receipt }),
			(error: unknown) => ({ error })
		);
		await started;
		await enqueueWriteIntent({
			db,
			now,
			mintUuid: () => 'void',
			intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
		});
		expect(await writerOutcome).toMatchObject({
			error: { status: 428, reason: 'void-in-progress' },
		});
		expect(await queueFor(db).all()).toEqual([]);
		// The create producer reinserts its born-local resident after the void.
		removed = false;
		await enqueueWriteIntent({
			db: otherDb,
			now,
			mintUuid: () => 'after-void',
			intent: {
				collection: 'orders',
				operation: 'create',
				recordId: 'order-1',
				payload: { id: 0 },
			},
		});
		expect(await queueFor(db).pending()).toMatchObject([{ mutationId: 'after-void' }]);
	});

	it('an admitted writer blocks a void and a second writer then succeeds in order', async () => {
		const mutationCollection = createFakeMutationCollection();
		let release!: () => void;
		let started!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const writing = new Promise<void>((resolve) => {
			started = resolve;
		});
		const append = mutationCollection.bulkUpsert.bind(mutationCollection);
		mutationCollection.bulkUpsert = async (rows) => {
			if (rows.some((row) => row.mutationId === 'first')) {
				started();
				await held;
			}
			return append(rows);
		};
		let removed = false;
		let data: Record<string, unknown> = { payload: { id: 0 }, sync: {} };
		const resident = {
			toJSON: () => data,
			incrementalModify: async (
				change: (row: Record<string, unknown>) => Record<string, unknown>
			) => {
				data = change(data);
			},
			remove: async () => {
				removed = true;
			},
		};
		const collections = {
			orders: { findOne: () => ({ exec: async () => (removed ? null : resident) }) },
			recordMutations: mutationCollection,
		};
		const db = { collections } as unknown as RxDatabase;
		const otherDb = { collections } as unknown as RxDatabase;
		const now = () => '2026-09-18T00:00:01.000Z';
		const write = (database: RxDatabase, id: string) =>
			enqueueWriteIntent({
				db: database,
				now,
				mintUuid: () => id,
				canCoalesce: false,
				intent: {
					collection: 'orders',
					operation: 'create',
					recordId: 'order-1',
					payload: { id: 0 },
				},
			});
		const first = write(db, 'first');
		await writing;
		try {
			await expect(
				enqueueWriteIntent({
					db: otherDb,
					now,
					mintUuid: () => 'void',
					intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
				})
			).rejects.toMatchObject({ status: 428, reason: 'void-in-progress' });
			expect(removed).toBe(false);
			const otherQueue = queueFor(otherDb);
			const admit = otherQueue.admitWriter.bind(otherQueue);
			let contended = false;
			// Release the paused first append only AFTER the second writer's real
			// admission CAS has observed it. The retry must then enqueue second.
			let refusals = 0;
			vi.spyOn(otherQueue, 'admitWriter').mockImplementation(async (...args) => {
				const accepted = await admit(...args);
				contended ||= !accepted;
				if (!accepted && ++refusals === 12) release();
				return accepted;
			});
			const second = write(otherDb, 'second');
			await expect(Promise.all([first, second])).resolves.toMatchObject([
				{ mutationId: 'first' },
				{ mutationId: 'second' },
			]);
			expect(contended).toBe(true);
		} finally {
			release();
		}
		expect((await queueFor(db).pending()).map((row) => row.mutationId)).toEqual([
			'first',
			'second',
		]);
		expect(mutationCollection.store.size).toBe(2);
	});

	it('a born-local void takes a same-record edit that lands after the queue read with it', async () => {
		// An update enqueued between the decision's `pending()` read and the resident's
		// removal must not be left targeting a missing record: it is consumed through
		// the queue's conditional removal, like a never-pushed chain's successors.
		const mutationCollection = createFakeMutationCollection();
		let reads = 0;
		const originalFind = mutationCollection.find;
		mutationCollection.find = () => {
			reads += 1;
			if (reads === 2) {
				// After the decision's read (1) and during the dead-letter scan (2), an
				// edit for the same record lands; the successor sweep (3) must see it.
				void mutationCollection.bulkUpsert([
					{
						mutationId: 'update-1',
						collectionName: 'orders',
						recordId: 'order-1',
						operation: 'update',
						origin: 'existing',
						payload: { id: 0, status: 'pos-open', customer_note: 'late' },
						baseRevision: null,
						queuedAt: '2026-09-18T00:00:00.500Z',
					},
				]);
			}
			return originalFind();
		};
		let removed = false;
		const resident = {
			toJSON: () => ({ payload: { id: 0, status: 'pos-open' }, sync: {} }),
			remove: async () => {
				removed = true;
			},
		};
		const orders = { findOne: () => ({ exec: async () => (removed ? null : resident) }) };
		const db = {
			collections: { orders, recordMutations: mutationCollection },
		} as unknown as RxDatabase;
		const observe = vi.fn();
		const receipt = await enqueueWriteIntent({
			db,
			intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
			mintUuid: () => 'delete-1',
			now: () => '2026-09-18T00:00:01.000Z',
			observe,
		});
		expect(receipt.annihilated).toBe(true);
		expect(removed).toBe(true);
		expect(mutationCollection.store.size).toBe(0);
		expect(observe).toHaveBeenCalledWith(
			expect.objectContaining({ fields: { recordId: 'order-1', removed: 1, deadLetters: 0 } })
		);
	});

	it.each([
		'claimed successor',
		'claimed dead letter',
		'late replacement',
		'chain claim',
		'settlement refusal',
		'late dead-letter claim',
		'coalesced replacement',
		'chain replacement',
		'failed resident removal',
	])('a refused void preserves resident and queued work: %s', async (scenario) => {
		const mutationCollection = createFakeMutationCollection();
		const row: QueuedMutation = {
			mutationId: 'dead',
			collectionName: 'orders',
			recordId: 'order-1',
			operation: 'create',
			origin: 'minted',
			payload: { id: 0 },
			baseRevision: null,
			queuedAt: '2026-09-18T00:00:00.000Z',
			status: 'rejected',
			attempts: 1,
			seq: 1,
		};
		const claimedSuccessor = scenario === 'claimed successor';
		const chain = scenario === 'chain claim' || scenario === 'chain replacement';
		const claimedDeadLetter = scenario === 'claimed dead letter' || scenario === 'chain claim';
		const older: QueuedMutation = {
			...row,
			mutationId: 'older',
			operation: chain ? 'create' : 'update',
			status: claimedSuccessor ? 'claimed' : 'pending',
			attempts: 0,
			seq: 2,
		};
		const newer: QueuedMutation = {
			...older,
			mutationId: 'newer',
			operation: 'update',
			status: 'pending',
			seq: 3,
		};
		await mutationCollection.bulkUpsert([
			{
				...row,
				...(claimedDeadLetter
					? {
							resolutionClaimBy: 'other-window',
							resolutionClaimUntil: '2026-09-18T00:01:00.000Z',
						}
					: {}),
			},
			older,
			newer,
		]);
		const local = { dirty: true, pendingMutationIds: ['older', 'newer'] };
		let removed = false;
		const resident = {
			toJSON: () => ({ payload: { id: 0 }, sync: {}, local }),
			remove: async () => {
				if (scenario === 'failed resident removal') throw new Error('resident removal failed');
				removed = true;
			},
		};
		const orders = { findOne: () => ({ exec: async () => (removed ? null : resident) }) };
		const db = {
			collections: { orders, recordMutations: mutationCollection },
		} as unknown as RxDatabase;
		const queue = queueFor(db);
		const replacement: QueuedMutation = {
			...newer,
			mutationId: 'replacement',
			coalesced: 1,
			status: 'claimed',
			claimedBy: 'other-window',
		};
		if (scenario === 'coalesced replacement' || scenario === 'chain replacement') {
			const otherQueue = new RecordMutationQueue(
				new RxRecordMutationStorage(() => mutationCollection)
			);
			const all = queue.all.bind(queue);
			let inserted = false;
			vi.spyOn(queue, 'all').mockImplementation(async () => {
				const snapshot = await all();
				const prior = snapshot.find((item) => item.mutationId === 'newer');
				if (!inserted && (!prior || prior.supersededBy)) {
					inserted = true;
					// A second instance inserts work after the void's sweep, before its guard.
					await otherQueue.replace(replacement);
				}
				return all();
			});
		}
		if (scenario === 'late replacement') {
			const pending = queue.pending.bind(queue);
			vi.spyOn(queue, 'pending').mockImplementationOnce(async () => {
				const snapshot = await pending();
				await queue.replace({ ...older, mutationId: 'replacement', operation: 'create', seq: 4 });
				return snapshot;
			});
		}
		if (scenario === 'late dead-letter claim') {
			const all = queue.all.bind(queue);
			let reads = 0;
			vi.spyOn(queue, 'all').mockImplementation(async () => {
				const snapshot = await all();
				if (++reads === 3)
					await queue.replace({
						...row,
						resolutionClaimBy: 'other-window',
						resolutionClaimUntil: '2026-09-18T00:01:00.000Z',
					});
				return snapshot;
			});
		}
		if (scenario === 'settlement refusal') {
			// The dead letter changes status after the guard, before its conditional mark.
			const mark = queue.markForAnnihilation.bind(queue);
			vi.spyOn(queue, 'markForAnnihilation').mockImplementation(async (id, token, now, status) => {
				if (id === 'dead') await queue.replace({ ...row, status: 'pending' });
				return mark(id, token, now, status);
			});
		}
		const result = enqueueWriteIntent({
			db,
			intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
			mintUuid: () => 'delete-1',
			now: () => '2026-09-18T00:00:01.000Z',
		});
		if (scenario === 'failed resident removal') {
			await expect(result).rejects.toThrow('resident removal failed');
			expect(mutationCollection.store.get('dead')?.mutation).toEqual(row);
		} else if (claimedSuccessor) {
			await expect(result).rejects.toThrow('mutation queue kept changing');
		} else {
			await expect(result).rejects.toMatchObject({
				status: 428,
				reason: 'dead-letter-resolution-in-progress',
			});
		}
		expect(await orders.findOne().exec()).toBe(resident);
		if (scenario === 'coalesced replacement' || scenario === 'chain replacement') {
			expect(mutationCollection.store.get('newer')?.mutation).toEqual(newer);
			expect(mutationCollection.store.get('replacement')?.mutation).toEqual(replacement);
		} else {
			expect(mutationCollection.store.get('newer')?.mutation).toEqual(newer);
		}
		expect(mutationCollection.store.get('older')?.mutation).toEqual(older);
		expect(resident.toJSON().local.pendingMutationIds).toEqual(['older', 'newer']);
		expect(mutationCollection.store.has('dead')).toBe(true);
		if (scenario === 'late replacement') {
			expect(mutationCollection.store.get('replacement')?.mutation.operation).toBe('create');
		}
	});

	it.each(['remoteId', 'revision', 'a push attempt'])(
		'a void preserves queued work when %s prevents annihilation',
		async (scenario) => {
			const mutationCollection = createFakeMutationCollection();
			const create: QueuedMutation = {
				mutationId: 'create',
				collectionName: 'orders',
				recordId: 'order-1',
				operation: 'create',
				origin: 'minted',
				payload: { id: 0 },
				baseRevision: null,
				queuedAt: '2026-09-18T00:00:00.000Z',
				status: 'pending',
				attempts: 0,
				seq: 1,
			};
			const edit: QueuedMutation = {
				...create,
				mutationId: 'edit',
				operation: 'update',
				explicit: true,
				seq: 2,
			};
			await mutationCollection.bulkUpsert([create, edit]);
			let data: Record<string, unknown> = {
				remoteId: scenario === 'remoteId' ? '42' : undefined,
				payload: { id: 0 },
				sync: { revision: scenario === 'revision' ? 'rev-1' : undefined },
				local: { pendingMutationIds: ['create', 'edit'] },
			};
			let removed = false;
			const resident = {
				toJSON: () => data,
				remove: async () => {
					removed = true;
				},
				incrementalModify: async (modify: (value: typeof data) => typeof data) => {
					data = modify(data);
				},
			};
			const orders = { findOne: () => ({ exec: async () => (removed ? null : resident) }) };
			const db = {
				collections: { orders, recordMutations: mutationCollection },
			} as unknown as RxDatabase;
			if (scenario === 'a push attempt') {
				const queue = queueFor(db);
				const all = queue.all.bind(queue);
				vi.spyOn(queue, 'all').mockImplementationOnce(async () => {
					const snapshot = await all();
					await queue.reschedule({ ...create, attempts: 1 });
					return snapshot;
				});
			}
			const receipt = await enqueueWriteIntent({
				db,
				intent: { collection: 'orders', operation: 'delete', recordId: 'order-1' },
				mintUuid: () => 'delete',
				now: () => '2026-09-18T00:00:01.000Z',
			});
			expect(receipt.annihilated).not.toBe(true);
			expect(await orders.findOne().exec()).toBe(resident);
			expect(mutationCollection.store.get('create')?.mutation).toEqual({
				...create,
				attempts: scenario === 'a push attempt' ? 1 : 0,
			});
			expect(mutationCollection.store.get('edit')?.mutation).toEqual(edit);
			expect(mutationCollection.store.get('delete')?.mutation.operation).toBe('delete');
			expect(data.local).toEqual({ dirty: true, pendingMutationIds: ['create', 'edit', 'delete'] });
		}
	);

	it('carries an own `__proto__` payload key through as ordinary data', async () => {
		// `sanitize_key` keeps `_`, so a Woo payload key literally spelled `__proto__`
		// survives parsing and reaches the queue — JSON.parse mints it as an OWN data
		// property. The same case `filterPayloadFields` guards in fakePullServer:
		// rebuilding the payload with `plain[key] = …` would run Object.prototype's
		// setter, silently dropping the field and re-parenting the object.
		const payload = await enqueueCatalogPayload(
			'customers',
			JSON.parse('{"first_name":"Ada","__proto__":{"polluted":"yes"}}') as Record<string, unknown>
		);

		expect(Object.prototype.hasOwnProperty.call(payload, '__proto__')).toBe(true);
		expect((payload as Record<string, unknown>)['__proto__']).toEqual({ polluted: 'yes' });
		// The accumulator itself must not have been re-parented, and the row must
		// still survive the storage clone.
		expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
		expect(() => structuredSerialize(payload)).not.toThrow();
	});

	it('stores a plain payload even when the caller hands over an RxDB proxy', async () => {
		// Every queue row crosses a structured-clone boundary — a Worker on web, IPC
		// on Electron. `RxDocument.get()` returns a *Proxy* for object-valued paths,
		// and a Proxy is not cloneable: the write dies with "#<Object> could not be
		// cloned". Orders and products are laundered incidentally by their outbound
		// sanitizers rewriting the object; customers had nothing in the way, so the
		// seam normalizes every payload itself.
		const proxied = new Proxy(
			{ first_name: 'Ada', billing: { email: 'ada@example.com' } },
			{}
		) as Record<string, unknown>;

		const payload = await enqueueCatalogPayload('customers', proxied);

		expect(() => structuredSerialize(payload)).not.toThrow();
		// The nested object matters: the proxy's traps are what break the clone, and
		// a shallow copy at the seam would leave a nested one intact.
		expect(payload).toMatchObject({
			first_name: 'Ada',
			billing: { email: 'ada@example.com' },
		});
	});

	it.each(['products', 'variations'] as const)(
		'strips null cost_of_goods_sold values from %s payloads',
		async (collectionName) => {
			const payload = await enqueueCatalogPayload(collectionName, {
				name: 'Renamed probe',
				cost_of_goods_sold: {
					values: [{ defined_value: null, effective_value: 0 }],
					total_value: 0,
				},
			});

			expect(payload).not.toHaveProperty('cost_of_goods_sold');
			expect(payload).toMatchObject({ name: 'Renamed probe' });
		}
	);

	it('keeps finite product cost_of_goods_sold values in their writable shape', async () => {
		const payload = await enqueueCatalogPayload('products', {
			cost_of_goods_sold: {
				values: [{ defined_value: 8.5, effective_value: 8.5 }],
				total_value: 8.5,
			},
		});

		expect(payload?.cost_of_goods_sold).toEqual({ values: [{ defined_value: 8.5 }] });
	});

	it.each([
		['explicit create then plain update', true, false],
		['plain create then explicit update', false, true],
		['plain create then plain update', false, false],
	])('preserves awaited identities for %s', async (_label, priorExplicit, incomingExplicit) => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		let residentData: Record<string, unknown> = {
			payload: { status: 'pos-open' },
			sync: { revision: '' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const deps = {
			db,
			mintUuid: () => `mutation-${++nextMutationId}`,
			now: () => '2026-08-04T00:00:00.000Z',
		};

		await enqueueWriteIntent({
			...deps,
			intent: {
				collection: 'orders',
				operation: 'create',
				recordId: 'order-1',
				payload: { status: 'pos-open' },
				...(priorExplicit ? { explicit: true } : {}),
			} as never,
		});
		await enqueueWriteIntent({
			...deps,
			now: () => '2026-08-04T00:00:05.000Z',
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { total: '10.00' },
				...(incomingExplicit ? { explicit: true } : {}),
			} as never,
		});
		// An explicit write is stamped with its own time even when it coalesces (the drain's
		// backoff release keys on it); an ordinary coalesce keeps the original queue time.
		expect(queued.get('mutation-2')?.queuedAt).toBe(
			priorExplicit || incomingExplicit ? '2026-08-04T00:00:05.000Z' : '2026-08-04T00:00:00.000Z'
		);

		expect([...queued.values()].map((row) => row.mutationId)).toEqual(
			priorExplicit ? ['mutation-1', 'mutation-2'] : ['mutation-2']
		);
		expect(queued.get('mutation-2')?.explicit).toBe(incomingExplicit || undefined);
		if (priorExplicit) expect(queued.get('mutation-1')?.explicit).toBe(true);
	});

	it.each([false, true])('born-twice preserves admissions: released=%s', async (released) => {
		const storage = createFakeMutationCollection();
		let data = { local: { dirty: false, pendingMutationIds: [] as string[] } };
		const resident = {
			incrementalModify: async (modify: (row: typeof data) => typeof data) => {
				data = modify(data);
			},
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: storage,
			},
		} as unknown as RxDatabase;
		const queue = queueFor(db);
		const now = () => new Date().toISOString();
		const mutation: QueuedMutation = {
			mutationId: 'create',
			collectionName: 'orders',
			recordId: 'order',
			operation: 'create',
			origin: 'minted',
			payload: { status: 'pos-open' },
			baseRevision: null,
			queuedAt: now(),
		};
		await queue.admitWriter('orders', 'order', 'writer', Date.now());
		const edit: QueuedMutation = { ...mutation, mutationId: 'edit', admittedBy: 'writer' };
		await queue.enqueue(edit);
		const finishWrite = async () => {
			data.local.dirty = true;
			data.local.pendingMutationIds.push('edit');
			await queue.releaseWriter('orders', 'order', 'writer');
		};
		if (released) await finishWrite();
		await requeueBornTwiceSnapshot({
			db,
			mutation,
			ackRevision: 'r1',
			mintUuid: () => 'follow-up',
			now,
		});
		const rows = await queue.all();
		expect(rows.every((row) => !row.supersededBy)).toBe(true);
		const ids = rows.map((row) => row.mutationId);
		expect(ids).toEqual(released ? ['follow-up'] : ['edit', 'follow-up']);
		if (!released) await finishWrite();
		expect(data.local.pendingMutationIds.sort()).toEqual(ids.sort());
		expect(await queue.admissionState((await queue.all()).at(-1)!, Date.now())).toBe('released');
	});

	it('strips non-string order meta display fields after coalescing over resident payload', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		let residentData: Record<string, unknown> = {
			payload: {
				line_items: [
					{
						meta_data: [
							{
								key: '_woocommerce_pos_data',
								value: { price: '45' },
								display_value: { price: '45' },
							},
						],
					},
				],
			},
			sync: { revision: 'sha256:base-r1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const mintUuid = () => `mutation-${++nextMutationId}`;
		const now = () => '2026-07-27T00:00:00.000Z';

		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { status: 'completed' },
			},
			mintUuid,
			now,
		});
		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { customer_note: 'ring twice' },
			},
			mintUuid,
			now,
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.payload).toMatchObject({
			line_items: [
				{
					meta_data: [{ key: '_woocommerce_pos_data', value: { price: '45' } }],
				},
			],
		});
		expect(
			(
				(
					[...queued.values()][0]?.payload.line_items as {
						meta_data: Record<string, unknown>[];
					}[]
				)[0]?.meta_data[0] ?? {}
			).display_value
		).toBeUndefined();
	});

	/**
	 * #1507. The settlement's aggregate never enters the queue on its own, but it
	 * IS on the resident record — and a coalesced snapshot re-layers that record.
	 * Without the strip on this seam, every second cart edit would put the
	 * aggregate back on the wire behind a caller that only asked to send a line.
	 */
	it('keeps the server-authored money off a coalesced payload it inherited from the resident', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
		};
		let residentData: Record<string, unknown> = {
			payload: {
				status: 'pos-open',
				total: '36.68',
				total_tax: '6.71',
				cart_tax: '6.71328',
				discount_total: '0.00',
				discount_tax: '0.00',
				shipping_total: '0.00',
				shipping_tax: '0.00',
				tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
				line_items: [{ id: 3, subtotal: '30.00', total: '30.00' }],
			},
			sync: { revision: 'sha256:base-r1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const mintUuid = () => `mutation-${++nextMutationId}`;
		const now = () => '2026-08-23T00:00:00.000Z';

		for (const payload of [
			{ line_items: [{ id: 3, quantity: 2 }] },
			{ customer_note: 'ring twice' },
		]) {
			await enqueueWriteIntent({
				db,
				intent: { collection: 'orders', operation: 'update', recordId: 'order-1', payload },
				mintUuid,
				now,
			});
		}

		expect([...queued.values()]).toHaveLength(1);
		const payload = [...queued.values()][0]!.payload;
		expect(payload).toMatchObject({
			status: 'pos-open',
			customer_note: 'ring twice',
			line_items: [{ id: 3, quantity: 2 }],
		});
		for (const field of [
			'total',
			'total_tax',
			'cart_tax',
			'discount_total',
			'discount_tax',
			'shipping_total',
			'shipping_tax',
			'tax_lines',
		]) {
			expect(payload).not.toHaveProperty(field);
		}
	});

	it('strips non-string order meta display fields from a born-twice follow-up', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: {
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: { price: '45' },
							display_value: { price: '45' },
						},
					],
				},
				baseRevision: null,
				queuedAt: '2026-07-27T00:00:00.000Z',
				explicit: true,
			} as never,
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-07-27T00:00:01.000Z',
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.explicit).toBe(true);
		expect([...queued.values()][0]?.payload.meta_data).toEqual([
			{ key: '_woocommerce_pos_data', value: { price: '45' } },
		]);
	});

	it('preserves explicit when a born-twice snapshot coalesces into a plain successor', async () => {
		const queued = new Map<string, QueuedMutation>([
			[
				'successor-1',
				{
					mutationId: 'successor-1',
					collectionName: 'orders',
					operation: 'update',
					recordId: 'order-1',
					origin: 'existing',
					payload: { customer_note: 'ring twice' },
					baseRevision: 'sha256:server-r1',
					queuedAt: '2026-08-04T00:00:01.000Z',
					seq: 2,
					status: 'pending',
				},
			],
		]);
		const mutationCollection = revCollectionOverMap(queued);
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: { status: 'pos-open', total: '25.00' },
				baseRevision: null,
				queuedAt: '2026-08-04T00:00:00.000Z',
				explicit: true,
			} as never,
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-08-04T00:00:02.000Z',
		});

		// The aggregate the original create carried is gone: the requeue passes
		// through the same outbound sanitizer (#1507), so a rebuilt payload cannot
		// smuggle back money the server discards unread.
		expect([...queued.values()]).toEqual([
			expect.objectContaining({
				mutationId: 'follow-up-1',
				explicit: true,
				payload: {
					status: 'pos-open',
					customer_note: 'ring twice',
				},
			}),
		]);
	});

	it.each(['claimed', 'pending'] as const)(
		'preserves a %s explicit born-twice successor and appends the snapshot',
		async (status) => {
			const queued = new Map<string, QueuedMutation>([
				[
					'successor-1',
					{
						mutationId: 'successor-1',
						collectionName: 'orders',
						operation: 'update',
						recordId: 'order-1',
						origin: 'existing',
						payload: { customer_note: 'ring twice' },
						baseRevision: 'sha256:server-r1',
						queuedAt: '2026-08-04T00:00:01.000Z',
						seq: 2,
						status,
						explicit: true,
					},
				],
			]);
			const mutationCollection = revCollectionOverMap(queued);
			const db = {
				collections: {
					orders: { findOne: () => ({ exec: async () => null }) },
					recordMutations: mutationCollection,
				},
			} as unknown as RxDatabase;

			await requeueBornTwiceSnapshot({
				db,
				mutation: {
					mutationId: 'create-1',
					collectionName: 'orders',
					operation: 'create',
					recordId: 'order-1',
					origin: 'minted',
					payload: { status: 'pos-open', total: '25.00' },
					baseRevision: null,
					queuedAt: '2026-08-04T00:00:00.000Z',
				} as never,
				ackRevision: 'sha256:server-r1',
				mintUuid: () => 'follow-up-1',
				now: () => '2026-08-04T00:00:02.000Z',
			});

			// An explicit successor cannot coalesce, so the snapshot tail-appends —
			// and inherits the successor's release: its payload rides the follow-up.
			expect(queued.get('successor-1')).toMatchObject({ status, explicit: true });
			expect([...queued.keys()]).toEqual(['successor-1', 'follow-up-1']);
			expect(queued.get('follow-up-1')).toEqual(
				expect.objectContaining({ mutationId: 'follow-up-1', explicit: true })
			);
		}
	);
});

describe('admission crash recovery', () => {
	const prior: QueuedMutation = {
		mutationId: 'prior',
		collectionName: 'orders',
		recordId: 'order',
		operation: 'update',
		origin: 'existing',
		payload: { id: 1 },
		baseRevision: 'r0',
		queuedAt: new Date().toISOString(),
	};
	const fixture = () => {
		const storage = createFakeMutationCollection();
		let data: Record<string, unknown> = { payload: { id: 0 }, sync: {} };
		const resident = {
			toJSON: () => data,
			incrementalModify: async (modify: (row: typeof data) => typeof data) => {
				data = modify(data);
			},
		};
		const collections = {
			orders: { findOne: () => ({ exec: async () => resident }) },
			recordMutations: storage,
		};
		const db = { collections } as unknown as RxDatabase;
		return { storage, resident, collections, db, queue: queueFor(db) };
	};
	it('delivers a committed receipt when expiry swept its holder during the dirty mark', async () => {
		const { resident, collections, db, queue } = fixture();
		let now = Date.now();
		const modify = resident.incrementalModify;
		vi.spyOn(resident, 'incrementalModify').mockImplementationOnce(async (change) => {
			now += 30_001;
			await queueFor({ collections } as unknown as RxDatabase).clearExpiredAnnihilation(now);
			await modify(change);
		});
		const receipt = await enqueueWriteIntent({
			db,
			mintUuid: () => 'receipt',
			now: () => new Date(now).toISOString(),
			intent: { collection: 'orders', operation: 'create', recordId: 'order', payload: {} },
		});
		expect(receipt.mutationId).toBe('receipt');
		const delivered: string[] = [];
		expect(
			await drainMutationQueue({
				queue,
				now: () => now,
				push: async (mutation) => {
					delivered.push(mutation.mutationId);
					return { outcome: 'created', mutation, document: { id: 1 }, currentRevision: 'r1' };
				},
			})
		).toMatchObject({ pushed: 1, rejected: [] });
		expect(delivered).toEqual(['receipt']);
	});

	it('settles an admission-lost dead letter with a born-local void', async () => {
		const { resident, db, queue } = fixture();
		let removed = false;
		Object.assign(resident, {
			remove: async () => {
				removed = true;
			},
		});
		await queue.replace({
			...prior,
			mutationId: 'orphan',
			admittedBy: 'swept',
			status: 'rejected',
			rejectedReason: 'admission-lost',
			payload: { id: 0 },
			baseRevision: null,
		});
		expect(
			await enqueueWriteIntent({
				db,
				mintUuid: () => 'void',
				now: () => new Date().toISOString(),
				intent: { collection: 'orders', operation: 'delete', recordId: 'order' },
			})
		).toMatchObject({ annihilated: true });
		expect(removed).toBe(true);
		expect(await queue.all()).toEqual([]);
	});

	it.each([false, true, 'expired'] as const)(
		'recovers a committed receipt when release fails persistently=%s',
		async (persistent) => {
			const { storage, collections, db, queue } = fixture();
			await queue.enqueue(prior);
			const release = vi.spyOn(queue, 'releaseWriter');
			if (persistent) release.mockRejectedValue(new Error('release storage unavailable'));
			else release.mockRejectedValueOnce(new Error('release storage unavailable'));
			const now = Date.now();
			expect(
				await enqueueWriteIntent({
					db,
					mintUuid: () => 'receipt',
					now: () => new Date(now).toISOString(),
					intent: {
						collection: 'orders',
						operation: 'create',
						recordId: 'order',
						payload: { id: 0 },
					},
				})
			).toMatchObject({ mutationId: 'receipt' });
			if (!persistent) expect(storage.store.has('orders/order')).toBe(false);
			const restarted = queueFor({ collections } as unknown as RxDatabase);
			const delivered: string[] = [];
			expect(
				await drainMutationQueue({
					queue: restarted,
					now: () => now + (persistent === 'expired' ? 30_001 : 0),
					push: async (mutation) => {
						delivered.push(mutation.mutationId);
						return { outcome: 'created', mutation, document: { id: 1 }, currentRevision: 'r1' };
					},
				})
			).toMatchObject({ pushed: 1, rejected: [] });
			expect(delivered).toEqual(['receipt']);
			await restarted.clearExpiredAnnihilation(now + 30_001);
			expect(await restarted.all()).toEqual([]);
			expect(storage.store.has('orders/order')).toBe(false);
		}
	);

	it('restores resident ids after a crash following the coalesced dirty mark', async () => {
		const { resident, collections, db, queue } = fixture();
		const now = Date.now();
		await queue.enqueue(prior);
		await queue.admitWriter('orders', 'order', 'replacement', now);
		await queue.coalesceInto(
			'prior',
			{ ...prior, mutationId: 'replacement', admittedBy: 'replacement' },
			now
		);
		await resident.incrementalModify((row) => ({
			...row,
			local: { dirty: true, pendingMutationIds: ['replacement'] },
		}));
		const restarted = queueFor({ collections } as unknown as RxDatabase);
		await restarted.clearExpiredAnnihilation(now + 30_001);
		expect(
			(resident.toJSON().local as { pendingMutationIds: string[] }).pendingMutationIds
		).toEqual(['prior']);
		expect(
			await drainMutationQueue({
				queue: restarted,
				now: () => now + 30_001,
				push: async (mutation) => ({
					outcome: 'updated',
					mutation,
					document: null,
					currentRevision: 'r1',
				}),
				applyAck: async (mutation) =>
					writeFacetFor('orders')!.reconcile(db, {
						recordId: 'order',
						remoteId: null,
						mutation,
						currentRevision: 'r1',
						document: null,
					}),
			})
		).toMatchObject({ pushed: 1, rejected: [] });
		expect(resident.toJSON().local).toEqual({ dirty: false, pendingMutationIds: [] });
		const pull = [{ uuid: 'order' }];
		const source = { findByIds: () => ({ exec: async () => new Map([['order', resident]]) }) };
		expect(await withoutLocallyProtected(source, pull)).toEqual(pull);
	});
});
