import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecordMutationStorage, RecordMutationQueue } from './recordMutationQueue';
import { drainMutationQueue } from './drainMutationQueue';

import type { PushResult } from './recordPushAdapter';
import type { RecordMutation } from './recordMutation';
import type { QueuedMutation } from './recordMutationQueue';

/**
 * LEADER-SIDE DRAIN ANNIHILATION (#1059).
 *
 * The web follower model (#1057): each tab of the same store runs its own OPFS
 * worker with its own `_rev` cache, so a follower's `write()` cannot CAS an
 * existing queue row — it FRESH-APPENDS (canCoalesce=false). A cashier who
 * creates then voids an order in a FOLLOWER tab therefore leaves TWO durable
 * rows — a never-pushed create and a never-pushed delete — that the single
 * write-plane LEADER later drains. Without drain-time annihilation the leader
 * pushes a real WooCommerce order (number consumed, hooks/emails/stock fired)
 * and then deletes it: a phantom.
 *
 * These tests drive the leader's drain directly. Seeding the queue with two
 * plain `enqueue`s IS the follower's fresh-append: both tabs share one durable
 * disk (last-writer-wins), so the leader's queue is exactly the rows the
 * follower appended, in order, uncoalesced. `push` is a spy that MUST NOT be
 * called for an annihilated chain; `removeResident` stands in for the local
 * doc removal the write-drain lane wires to `onDeleteAck`.
 */

const create = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm-create',
	collectionName: 'orders',
	operation: 'create',
	recordId: 'order-A',
	origin: 'minted',
	payload: { status: 'processing' },
	baseRevision: null,
	queuedAt: '2026-08-07T00:00:00.000Z',
	...over,
});

const update = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm-update',
	collectionName: 'orders',
	operation: 'update',
	recordId: 'order-A',
	origin: 'existing',
	payload: { status: 'on-hold' },
	baseRevision: null,
	queuedAt: '2026-08-07T00:00:01.000Z',
	...over,
});

const del = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm-delete',
	collectionName: 'orders',
	operation: 'delete',
	recordId: 'order-A',
	origin: 'existing',
	payload: { id: 'order-A' },
	baseRevision: null,
	queuedAt: '2026-08-07T00:00:02.000Z',
	...over,
});

const ok = (mutation: RecordMutation): PushResult => ({
	outcome: mutation.operation === 'delete' ? 'deleted' : 'created',
	mutation,
	document: { id: 1 },
	currentRevision: 'sha256:r1',
});

async function queueWith(...mutations: RecordMutation[]): Promise<RecordMutationQueue> {
	const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	for (const m of mutations) await q.enqueue(m); // fresh-append, exactly a follower's write()
	return q;
}

describe('drainMutationQueue — leader-side annihilation (#1059)', () => {
	it('annihilates a never-pushed follower create+void: ZERO pushes, no phantom order', async () => {
		const q = await queueWith(create(), del());
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const removeResident = vi.fn(async (_m: QueuedMutation) => {});

		const result = await drainMutationQueue({ queue: q, push, removeResident });

		// The core guarantee: the create never reaches the server, so no order
		// number is consumed and no create→delete round-trip happens.
		expect(push).not.toHaveBeenCalled();
		expect(result.annihilated).toBe(1);
		expect(result.pushed).toBe(0);
		expect(await q.pending()).toEqual([]); // both rows gone
		// The resident local order is removed (the cashier asked for deletion) — the
		// same net effect enqueue-time annihilation has on a single tab.
		expect(removeResident).toHaveBeenCalledOnce();
		expect(removeResident.mock.calls[0]?.[0]).toMatchObject({
			operation: 'create',
			recordId: 'order-A',
		});
	});

	it('annihilates the WHOLE never-pushed chain (create + edits + delete)', async () => {
		const q = await queueWith(
			create(),
			update({ mutationId: 'm-u1', payload: { status: 'on-hold' } }),
			update({ mutationId: 'm-u2', payload: { note: 'x' } }),
			del()
		);
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push });

		expect(push).not.toHaveBeenCalled();
		expect(result.annihilated).toBe(1);
		expect(await q.pending()).toEqual([]);
	});

	it('does NOT need removeResident to cancel the pushes (pure queue model)', async () => {
		const q = await queueWith(create(), del());
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push });

		expect(push).not.toHaveBeenCalled();
		expect(result.annihilated).toBe(1);
		expect(await q.pending()).toEqual([]);
	});

	it('does NOT annihilate a delete of an order whose create ALREADY pushed (real void)', async () => {
		// The create reached the server and was acked (removed); only the delete
		// remains. This is a REAL void of a REAL order and must push.
		const q = await queueWith(del({ baseRevision: 'sha256:server-r1' }));
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push, applyAck: async () => {} });

		expect(result.annihilated).toBe(0);
		expect(push).toHaveBeenCalledOnce();
		expect(push.mock.calls[0]?.[0]).toMatchObject({ operation: 'delete' });
	});

	it('does NOT annihilate when the create was pushed then errored back (attempts>0)', async () => {
		// A create that pushed and failed carries attempts>0 — the server MAY hold
		// it. Annihilating would drop a delete the server still needs. The chain
		// pushes normally instead (create retried, then the delete).
		const q = await queueWith(create(), del());
		const [head] = await q.pending();
		await q.replace({ ...(head as QueuedMutation), attempts: 1 });
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push, applyAck: async () => {} });

		expect(result.annihilated).toBe(0);
		expect(push).toHaveBeenCalled();
		expect(push.mock.calls[0]?.[0]).toMatchObject({ operation: 'create' });
	});

	it('does NOT annihilate when the create is in flight (claimed) — annihilation vs handoff race', async () => {
		// The leader claimed the create and a follower appended a void while the push
		// was in flight (or a handoff left a claimed create). The create may already
		// be at the server, so the pair must NOT annihilate.
		const q = await queueWith(create(), del());
		// Simulate the in-flight claim durably on the row.
		await q.replace({ ...(await q.pending())[0], status: 'claimed' } as QueuedMutation);
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push, applyAck: async () => {} });

		expect(result.annihilated).toBe(0);
		// The claimed create is re-pushed (server dedupes on mutationId); nothing is
		// silently dropped.
		expect(push).toHaveBeenCalled();
	});

	it('does NOT annihilate a re-create after the delete (delete is not the terminal op)', async () => {
		// create → delete → create again: the record should EXIST afterwards, so
		// annihilating the leading pair and leaving a dangling create would be wrong.
		// Left entirely to the normal drain.
		const q = await queueWith(
			create({ mutationId: 'm-c1' }),
			del({ mutationId: 'm-d1' }),
			create({ mutationId: 'm-c2', queuedAt: '2026-08-07T00:00:03.000Z' })
		);
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push, applyAck: async () => {} });

		expect(result.annihilated).toBe(0);
		expect(push).toHaveBeenCalled();
	});

	it('does NOT touch a different record with independent work', async () => {
		const q = await queueWith(
			create(),
			del(),
			update({ mutationId: 'm-other', recordId: 'order-B', baseRevision: 'sha256:b' })
		);
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push, applyAck: async () => {} });

		expect(result.annihilated).toBe(1);
		// order-A annihilated (no push); order-B's edit still pushes.
		expect(push).toHaveBeenCalledOnce();
		expect(push.mock.calls[0]?.[0]).toMatchObject({ recordId: 'order-B' });
	});

	it('restores the chain and drains normally when the resident removal fails (partial annihilation)', async () => {
		const q = await queueWith(create(), del());
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const removeResident = vi.fn(async () => {
			throw new Error('resident removal failed');
		});

		const result = await drainMutationQueue({
			queue: q,
			push,
			removeResident,
			applyAck: async () => {},
		});

		// The chain is put back (never left with removed rows AND a resident), and
		// the drain falls back to the pre-#1059 behaviour: it pushes the create then
		// the delete. Net-neutral phantom, but no data loss.
		expect(result.annihilated).toBe(0);
		const pushedOps = push.mock.calls.map((c) => c[0].operation);
		expect(pushedOps).toEqual(['create', 'delete']);
	});

	it('is a no-op when the pair was already annihilated at enqueue (single tab / Electron)', async () => {
		// On a leader, write(delete) coalesces and annihilates at enqueue, so the
		// drain sees an EMPTY queue — the drain-time pass must not double-annihilate
		// or invent work.
		const q = await queueWith();
		const push = vi.fn(async (m: RecordMutation) => ok(m));

		const result = await drainMutationQueue({ queue: q, push });

		expect(result.annihilated).toBe(0);
		expect(result.pushed).toBe(0);
		expect(push).not.toHaveBeenCalled();
	});
});
