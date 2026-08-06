import { describe, expect, it, vi } from 'vitest';

import { type SyncEvent } from './telemetry';
import { InMemoryRecordMutationStorage, RecordMutationQueue } from './recordMutationQueue';
import {
	pushEndpointResolver,
	pushRecordMutation,
	type PushResult,
	RecordPushError,
} from './recordPushAdapter';
import { drainMutationQueue } from './drainMutationQueue';
import { createFakeWriteServer } from './fakeWriteServer';

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

const ok = (mutation: RecordMutation): PushResult => ({
	outcome: 'updated',
	mutation,
	document: { id: 1 },
	currentRevision: 'sha256:r1',
});
const conflict = (mutation: RecordMutation): PushResult => ({
	outcome: 'conflict',
	mutation,
	document: null,
	currentRevision: null,
	conflict: { current: { id: 1 }, currentRevision: 'r1' },
});
const jsonResponse = (status: number, body: unknown): Response =>
	({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

async function queueWith(...mutations: RecordMutation[]) {
	const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	for (const m of mutations) await q.enqueue(m);
	return q;
}

describe('drainMutationQueue', () => {
	it('holds a mutation without claiming it or applying backoff', async () => {
		const q = await queueWith(
			mut({ mutationId: 'held' }),
			mut({ mutationId: 'ready', recordId: 'rec-B' })
		);
		const push = vi.fn(async (mutation: RecordMutation) => ok(mutation));

		const result = await drainMutationQueue({
			queue: q,
			push,
			shouldHold: async (mutation) => mutation.mutationId === 'held',
		});

		expect(result).toMatchObject({ held: 1, pushed: 1, failed: 0, deferred: 0 });
		expect(push).toHaveBeenCalledOnce();
		expect(push.mock.calls[0]?.[0].mutationId).toBe('ready');
		expect((await q.pending())[0]).toMatchObject({ mutationId: 'held' });
		expect((await q.pending())[0]).not.toHaveProperty('attempts');
		expect((await q.pending())[0]).not.toHaveProperty('nextAttemptAt');
	});

	it('pushes each pending mutation, applies the ack, and acknowledges on success', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm1', queuedAt: '..1' }),
			mut({ mutationId: 'm2', recordId: 'rec-B', queuedAt: '..2' })
		);
		const applyAck = vi.fn(async () => {});
		const result = await drainMutationQueue({ queue: q, push: async (m) => ok(m), applyAck });
		expect(result).toEqual({
			pushed: 2,
			annihilated: 0,
			held: 0,
			conflicts: [],
			failed: 0,
			deferred: 0,
			rejected: [],
		});
		expect(applyAck).toHaveBeenCalledTimes(2);
		expect(await q.pending()).toEqual([]); // fully drained
	});

	it('surfaces a conflict without acknowledging it (stays queued for resolution)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const result = await drainMutationQueue({ queue: q, push: async (m) => conflict(m) });
		expect(result.pushed).toBe(0);
		expect(result.conflicts).toHaveLength(1);
		expect(result.conflicts[0].conflict?.currentRevision).toBe('r1');
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1']); // not dropped
	});

	it('leaves a mutation queued when the push throws a retryable error (retry next drain)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw new Error('network');
			},
		});
		expect(result).toMatchObject({ pushed: 0, failed: 1, rejected: [] });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1']);
	});

	it('dead-letters a non-retryable 4xx (e.g. unsupported collection) instead of retrying forever', async () => {
		const q = await queueWith(mut({ mutationId: 'm1', recordId: 'rec-A' }));
		const err = Object.assign(new Error('unknown collection'), { status: 400 });
		const events: SyncEvent[] = [];
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw err;
			},
			observe: (e) => events.push(e),
		});
		expect(result.rejected.map(({ mutation }) => mutation.mutationId)).toEqual(['m1']);
		expect(result.failed).toBe(0);
		expect(await q.pending()).toEqual([]); // dead-lettered (removed), NOT left to retry forever
		expect(events.some((e) => e.type === 'push.rejected' && e.fields?.status === 400)).toBe(true);
	});

	it('dead-letters a cannot-delete refusal with its detail and never pushes it again', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-delete', operation: 'delete', recordId: 'rec-A' })
		);
		const push = vi.fn(async (mutation: RecordMutation) => {
			throw new RecordPushError(mutation, 403, 'woocommerce_rest_cannot_delete', true);
		});

		const result = await drainMutationQueue({ queue: q, push });

		expect(result.rejected).toEqual([
			{
				mutation: expect.objectContaining({ mutationId: 'm-delete' }),
				status: 403,
				reason: 'woocommerce_rest_cannot_delete',
			},
		]);
		expect((await q.all())[0]).toMatchObject({ mutationId: 'm-delete', status: 'rejected' });

		await drainMutationQueue({ queue: q, push });
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('dead-letters a 409 identity_ambiguous (F4a fail-closed) through the real adapter + write fake — not retried, not dropped silently', async () => {
		// The server refuses to resolve a duplicated uuid (backfill collision repair needed) — a
		// retry can NEVER succeed, so despite the 409 status (normally retryable) the mutation must
		// land in `rejected` with the failure surfaced, not loop as a transient retry or a
		// null-current "conflict" the host can't resolve.
		const q = await queueWith(
			mut({ mutationId: 'm-amb', recordId: 'rec-dup', baseRevision: 'sha256:mine' })
		);
		const server = createFakeWriteServer();
		server.seed('rec-dup', { id: 7, revision: 'sha256:mine' });
		server.script(() => ({ kind: 'identity_ambiguous' }));
		const events: SyncEvent[] = [];
		const result = await drainMutationQueue({
			queue: q,
			push: (mutation) =>
				pushRecordMutation({
					mutation,
					resolveEndpoint: pushEndpointResolver('https://shop.example/wp-json/wcpos/v2'),
					fetcher: server.fetch,
				}),
			observe: (e) => events.push(e),
		});

		expect(result.rejected.map(({ mutation }) => mutation.mutationId)).toEqual(['m-amb']); // dead-lettered + surfaced
		expect(result).toMatchObject({ pushed: 0, failed: 0, conflicts: [] }); // NOT a conflict, NOT a retryable failure
		expect(await q.pending()).toEqual([]); // removed from the queue — can't poison it
		expect(events.some((e) => e.type === 'push.rejected' && e.fields?.status === 409)).toBe(true);
	});

	it('gate2 item 4: a delete-428 with no refresh port parks as durable needs-revision — not dead-lettered, not a fake conflict', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-delete', operation: 'delete', baseRevision: null })
		);
		const events: SyncEvent[] = [];
		const fetcher = vi.fn(async () =>
			jsonResponse(428, { code: 'woo_rxdb_sync_precondition_required' })
		);
		const result = await drainMutationQueue({
			queue: q,
			push: (mutation) =>
				pushRecordMutation({
					mutation,
					resolveEndpoint: () => ({ url: 'https://x/push/products', method: 'POST' }),
					fetcher,
				}),
			observe: (e) => events.push(e),
		});

		expect(result).toMatchObject({ pushed: 0, failed: 0, rejected: [] });
		expect(result.conflicts).toHaveLength(1);
		// The HONEST distinct state: no null-truth 'conflicted' row that a
		// retry-with-server-base would loop on the same base.
		expect((await q.all())[0]).toMatchObject({ mutationId: 'm-delete', status: 'needs-revision' });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-delete']); // still local work
		expect(events.some((e) => e.type === 'queue.write.needs-revision')).toBe(true);
	});

	it('gate2 item 4: a delete-428 routes through refreshRevision and the restamped retry lands (the real adapter + write fake)', async () => {
		const q = await queueWith(
			mut({
				mutationId: 'm-del-428',
				operation: 'delete',
				recordId: 'rec-del',
				collectionName: 'products',
				baseRevision: null,
			})
		);
		const server = createFakeWriteServer();
		server.seed('rec-del', { id: 9, revision: 'sha256:server-r5' });
		let fault = true;
		server.script(() => {
			if (!fault) return undefined;
			fault = false;
			return { kind: 'precondition_required' };
		});
		const refreshRevision = vi.fn(async () => 'sha256:server-r5');
		const result = await drainMutationQueue({
			queue: q,
			push: (mutation) =>
				pushRecordMutation({
					mutation,
					resolveEndpoint: pushEndpointResolver('https://shop.example/wp-json/wcpos/v2'),
					fetcher: server.fetch,
				}),
			refreshRevision,
		});

		// Previously the delete-428 was mapped to a conflict RESULT, so this exact
		// recovery (refresh → restamp → retry) never ran for deletes.
		expect(refreshRevision).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ pushed: 1, failed: 0, rejected: [] });
		expect(server.applied.has('rec-del')).toBe(false); // the delete landed
		expect(await q.all()).toEqual([]);
	});

	it('gate2 item 4: a needs-revision row blocks later same-record mutations until resolved', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const first = await q.enqueue(mut({ mutationId: 'm-parked', queuedAt: '..1' }));
		await q.replace({ ...first, status: 'needs-revision' });
		await q.enqueue(mut({ mutationId: 'm-behind', queuedAt: '..2' }));
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({ queue: q, push });
		expect(push).not.toHaveBeenCalled(); // the successor would hit the same unknown base
		expect(result).toMatchObject({ pushed: 0, failed: 0 });
	});

	it('re-pulls and re-stamps a null-base update after 428, then retries it once', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-428', operation: 'update', baseRevision: null })
		);
		const push = vi.fn(async (mutation: RecordMutation) => {
			if (push.mock.calls.length === 1)
				throw Object.assign(new Error('revision required'), { status: 428 });
			return ok(mutation);
		});
		const refreshRevision = vi.fn(async () => 'sha256:repulled');

		const result = await drainMutationQueue({ queue: q, push, refreshRevision });

		expect(result.pushed).toBe(1);
		expect(push).toHaveBeenCalledTimes(2);
		expect(push.mock.calls[1]?.[0].baseRevision).toBe('sha256:repulled');
		expect(refreshRevision).toHaveBeenCalledOnce();
		expect(await q.pending()).toEqual([]);
	});

	it('gate2 item 4: parks a 428 as needs-revision when a targeted re-pull still finds no revision', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-428-none', operation: 'update', baseRevision: null })
		);
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw Object.assign(new Error('revision required'), { status: 428 });
			},
			refreshRevision: async () => null,
		});

		expect(result.conflicts).toHaveLength(1);
		expect((await q.all())[0]).toMatchObject({ status: 'needs-revision' });
	});

	it('dead-letters an unrefreshable born-local 428 with the server message (#832)', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-create-428', operation: 'create', origin: 'minted', baseRevision: null })
		);
		const result = await drainMutationQueue({
			queue: q,
			push: (mutation) =>
				pushRecordMutation({
					mutation,
					resolveEndpoint: () => ({ url: 'https://x/push/products', method: 'POST' }),
					fetcher: async () =>
						jsonResponse(428, {
							code: 'woo_rxdb_sync_precondition_required',
							message: 'A server revision is required.',
						}),
				}),
			refreshRevision: async () => null,
		});

		expect(result.rejected.map(({ mutation }) => mutation.mutationId)).toEqual(['m-create-428']);
		expect((await q.all())[0]).toMatchObject({
			status: 'rejected',
			rejectedStatus: 428,
			rejectedReason: 'woo_rxdb_sync_precondition_required',
			rejectedMessage: 'A server revision is required.',
		});
	});

	it('dead-letters when the one post-refresh retry still returns 428', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-428-again', operation: 'update', baseRevision: null })
		);
		const push = vi.fn(async () => {
			throw Object.assign(new Error('revision required'), { status: 428 });
		});
		const result = await drainMutationQueue({
			queue: q,
			push,
			refreshRevision: async () => 'sha256:repulled',
		});

		expect(push).toHaveBeenCalledTimes(2); // one refresh-restamped retry, then dead-letter — never a loop
		expect(result.rejected.map(({ mutation }) => mutation.mutationId)).toEqual(['m-428-again']);
		expect(result.conflicts).toEqual([]);
		expect((await q.all())[0]).toMatchObject({
			status: 'rejected',
			baseRevision: 'sha256:repulled',
		});
	});

	it('backs off a mutation when its 428 refresh throws, continues draining, and defers it on the next tick', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-refresh-fails', recordId: 'rec-A', queuedAt: '..1' }),
			mut({ mutationId: 'm-next', recordId: 'rec-B', queuedAt: '..2' })
		);
		const push = vi.fn(async (mutation: RecordMutation) => {
			if (mutation.mutationId === 'm-refresh-fails') {
				throw Object.assign(new Error('revision required'), { status: 428 });
			}
			return ok(mutation);
		});

		const first = await drainMutationQueue({
			queue: q,
			push,
			refreshRevision: async () => {
				throw new Error('refresh network failure');
			},
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});

		expect(first).toMatchObject({ pushed: 1, failed: 1, deferred: 0 });
		expect((await q.pending())[0]).toMatchObject({
			mutationId: 'm-refresh-fails',
			status: 'pending',
			attempts: 1,
			nextAttemptAt: at(2_000),
		});

		push.mockClear();
		const second = await drainMutationQueue({
			queue: q,
			push,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(second).toMatchObject({ pushed: 0, failed: 0, deferred: 1 });
		expect(push).not.toHaveBeenCalled();
	});

	it('dead-letters a non-retryable 422 returned by the post-refresh retry', async () => {
		const q = await queueWith(mut({ mutationId: 'm-refresh-422', baseRevision: null }));
		const push = vi.fn(async (_mutation: RecordMutation) => {
			if (push.mock.calls.length === 1) {
				throw Object.assign(new Error('revision required'), { status: 428 });
			}
			throw Object.assign(new Error('invalid mutation'), { status: 422 });
		});

		const result = await drainMutationQueue({
			queue: q,
			push,
			refreshRevision: async () => 'sha256:repulled',
		});

		expect(result.rejected.map(({ mutation }) => mutation.mutationId)).toEqual(['m-refresh-422']);
		expect(result).toMatchObject({ pushed: 0, failed: 0, conflicts: [] });
		expect(await q.pending()).toEqual([]);
		expect((await q.all())[0]).toMatchObject({
			mutationId: 'm-refresh-422',
			status: 'rejected',
			baseRevision: 'sha256:repulled',
		});
	});

	it('does NOT dead-letter a retryable 4xx (409/429) — those stay queued', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw Object.assign(new Error('rate limited'), { status: 429 });
			},
		});
		expect(result).toMatchObject({ failed: 1, rejected: [] });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1']); // left to retry
	});

	it('does NOT acknowledge when applyAck throws (the write is incomplete)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const result = await drainMutationQueue({
			queue: q,
			push: async (m) => ok(m),
			applyAck: async () => {
				throw new Error('write failed');
			},
		});
		expect(result).toMatchObject({ pushed: 0, failed: 1 });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1']);
	});

	it('acknowledges ONLY the pushed mutation — an edit that lands mid-drain survives', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-A', queuedAt: '..1' })
		);
		// the push for m-create also enqueues a later edit to the same record before returning
		const push = async (m: RecordMutation): Promise<PushResult> => {
			if (m.mutationId === 'm-create') {
				await q.enqueue(mut({ mutationId: 'm-edit', recordId: 'rec-A', queuedAt: '..9' }));
			}
			return ok(m);
		};
		const result = await drainMutationQueue({ queue: q, push });
		expect(result.pushed).toBe(1);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-edit']); // the edit is NOT dropped
	});

	it('does not start the loop when the signal is already aborted', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const controller = new AbortController();
		controller.abort();
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({ queue: q, push, signal: controller.signal });
		expect(push).not.toHaveBeenCalled();
		expect(result.pushed).toBe(0);
	});

	it('discards an in-flight push that resolves after an abort (does not ack into a switched scope)', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm1', queuedAt: '..1' }),
			mut({ mutationId: 'm2', recordId: 'rec-B', queuedAt: '..2' })
		);
		const controller = new AbortController();
		const applyAck = vi.fn(async () => {});
		const push = vi.fn(async (m: RecordMutation) => {
			controller.abort();
			return ok(m);
		}); // aborts mid-flight
		const result = await drainMutationQueue({
			queue: q,
			push,
			applyAck,
			signal: controller.signal,
		});
		expect(push).toHaveBeenCalledTimes(1);
		expect(applyAck).not.toHaveBeenCalled(); // the resolved-after-abort push is NOT applied
		expect(result.pushed).toBe(0);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1', 'm2']); // both still queued
	});

	it('does not dead-letter a permanent push error when the signal aborts mid-push', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm1', queuedAt: '..1' }),
			mut({ mutationId: 'm2', recordId: 'rec-B', queuedAt: '..2' })
		);
		const controller = new AbortController();
		const events: SyncEvent[] = [];
		const ackSpy = vi.spyOn(q, 'acknowledge');
		const push = vi.fn(async () => {
			controller.abort();
			throw Object.assign(new Error('identity ambiguous'), { status: 409, permanent: true });
		});
		const result = await drainMutationQueue({
			queue: q,
			push,
			signal: controller.signal,
			observe: (e) => events.push(e),
		});

		expect(push).toHaveBeenCalledTimes(1);
		expect(ackSpy).not.toHaveBeenCalled();
		expect(result).toMatchObject({ pushed: 0, failed: 0, rejected: [] });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1', 'm2']); // aborted drain leaves work queued
		expect(events.some((e) => e.type === 'push.rejected')).toBe(false);
	});

	it('does not acknowledge when the signal aborts DURING applyAck (no drop-after-cancel)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const controller = new AbortController();
		const ackSpy = vi.spyOn(q, 'acknowledge');
		const applyAck = vi.fn(async (_m: RecordMutation, _r: PushResult, signal?: AbortSignal) => {
			controller.abort(); // the scope switches while the ack is applying
			expect(signal).toBe(controller.signal); // the signal is threaded in
		});
		const result = await drainMutationQueue({
			queue: q,
			push: async (m) => ok(m),
			applyAck,
			signal: controller.signal,
		});
		expect(ackSpy).not.toHaveBeenCalled(); // never acknowledged after cancellation
		expect(result.pushed).toBe(0);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m1']); // still queued to retry
	});

	it('preserves per-record FIFO: a failed create blocks a later edit to the same record this drain', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-A', queuedAt: '..1' }),
			mut({ mutationId: 'm-edit', operation: 'update', recordId: 'rec-A', queuedAt: '..2' })
		);
		const push = vi.fn(async (m: RecordMutation) => {
			if (m.mutationId === 'm-create') throw new Error('network');
			return ok(m);
		});
		const result = await drainMutationQueue({ queue: q, push });
		expect(push).toHaveBeenCalledTimes(1); // m-edit NOT attempted — its create didn't land
		expect(result).toMatchObject({ pushed: 0, failed: 1 });
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-create', 'm-edit']);
	});

	it('treats an acknowledge (durable removal) failure as retryable, not a drain rejection', async () => {
		const storage = new InMemoryRecordMutationStorage();
		const q = new RecordMutationQueue(storage);
		await q.enqueue(mut({ mutationId: 'm1' }));
		vi.spyOn(q, 'acknowledge').mockRejectedValueOnce(new Error('storage down'));
		const result = await drainMutationQueue({ queue: q, push: async (m) => ok(m) });
		expect(result).toMatchObject({ pushed: 0, failed: 1 }); // resolved, not thrown
	});

	it('emits a queue.write.drain event', async () => {
		const events: SyncEvent[] = [];
		const q = await queueWith(mut({ mutationId: 'm1' }));
		await drainMutationQueue({
			queue: q,
			push: async (m) => ok(m),
			observe: (e) => events.push(e),
		});
		expect(events.at(-1)).toMatchObject({
			type: 'queue.write.drain',
			fields: { scanned: 1, pushed: 1, conflicts: 0, failed: 0 },
		});
	});

	it('respects limit', async () => {
		const q = await queueWith(
			mut({ mutationId: 'm1', queuedAt: '..1' }),
			mut({ mutationId: 'm2', recordId: 'rec-B', queuedAt: '..2' })
		);
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({ queue: q, push, limit: 1 });
		expect(push).toHaveBeenCalledTimes(1);
		expect(result.pushed).toBe(1);
	});
});

const NO_JITTER_BACKOFF = { baseMs: 1_000, multiplier: 2, maxMs: 60_000, jitterRatio: 0 };
const at = (ms: number): string => new Date(ms).toISOString();

describe('drainMutationQueue — retry backoff (ADR 0012)', () => {
	it('bumps attempts and sets the backoff gate on a retryable failure', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw new Error('network');
			},
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(result).toMatchObject({ pushed: 0, failed: 1, deferred: 0 });
		const [queued] = await q.pending();
		expect(queued.attempts).toBe(1);
		expect(queued.nextAttemptAt).toBe(at(1_000 + 1_000)); // now + baseMs
	});

	it('defers a mutation whose backoff window has not elapsed (does not push it)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.reschedule({ ...mut({ mutationId: 'm1' }), attempts: 1, nextAttemptAt: at(5_000) });
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({
			queue: q,
			push,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(push).not.toHaveBeenCalled();
		expect(result).toMatchObject({ pushed: 0, deferred: 1, failed: 0 });
		expect((await q.pending()).length).toBe(1); // still queued, untouched
	});

	it('pushes a mutation whose backoff window has elapsed', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.reschedule({ ...mut({ mutationId: 'm1' }), attempts: 1, nextAttemptAt: at(500) });
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({
			queue: q,
			push,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(push).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ pushed: 1, deferred: 0 });
		expect(await q.pending()).toEqual([]); // acknowledged
	});

	it('escalates the backoff on each successive failure', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.reschedule({ ...mut({ mutationId: 'm1' }), attempts: 2, nextAttemptAt: at(0) }); // ready, two prior failures
		await drainMutationQueue({
			queue: q,
			push: async () => {
				throw new Error('network');
			},
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		const [queued] = await q.pending();
		expect(queued.attempts).toBe(3);
		expect(queued.nextAttemptAt).toBe(at(1_000 + 4_000)); // now + base*multiplier^2
	});

	it('emits a warn event when persisting the backoff fails (rare double-fault)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		vi.spyOn(q, 'reschedule').mockRejectedValueOnce(new Error('storage down'));
		const events: SyncEvent[] = [];
		const result = await drainMutationQueue({
			queue: q,
			push: async () => {
				throw new Error('network');
			},
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
			observe: (e) => events.push(e),
		});
		expect(result).toMatchObject({ failed: 1 });
		expect(
			events.some((e) => e.type === 'queue.write.reschedule-failed' && e.level === 'warn')
		).toBe(true);
	});

	it('a deferred head row does not consume the limit — a ready row behind it still pushes', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.reschedule({
			...mut({ mutationId: 'm1', recordId: 'rec-A', queuedAt: '..1' }),
			attempts: 1,
			nextAttemptAt: at(9_000),
		}); // deferred
		await q.enqueue(mut({ mutationId: 'm2', recordId: 'rec-B', queuedAt: '..2' })); // ready, different record
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({
			queue: q,
			push,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
			limit: 1,
		});
		expect(push).toHaveBeenCalledTimes(1); // m2 pushed despite the deferred m1 and limit:1
		expect(result).toMatchObject({ pushed: 1, deferred: 1 });
	});

	it('backs off after an ack failure too, not only a push failure', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		vi.spyOn(q, 'acknowledge').mockRejectedValueOnce(new Error('storage down'));
		const result = await drainMutationQueue({
			queue: q,
			push: async (m) => ok(m),
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(result).toMatchObject({ pushed: 0, failed: 1 });
		const [queued] = await q.pending();
		expect(queued.attempts).toBe(1);
		expect(queued.nextAttemptAt).toBe(at(2_000)); // backed off (the push landed; don't hammer the re-push)
	});

	it('does NOT back off a push aborted by a scope switch (abort is not a failure) — and the row STAYS claimed (gate2 item 1)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const controller = new AbortController();
		const push = vi.fn(async () => {
			controller.abort();
			throw new Error('aborted');
		});
		await drainMutationQueue({
			queue: q,
			push,
			signal: controller.signal,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		const [queued] = await q.pending();
		expect(queued.attempts).toBeUndefined();
		expect(queued.nextAttemptAt).toBeUndefined();
		// The aborted push may have REACHED the server: the intent is
		// pushed-with-unknown-outcome, so the durable claim must survive — a
		// claimed row can never coalesce-with-fresh-id (the R2 replay hole), and
		// the next drain re-pushes it under the SAME mutationId (server dedupe).
		expect(queued.status).toBe('claimed');
	});

	it('a deferred mutation holds later edits to the same record (FIFO)', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.reschedule({
			...mut({ mutationId: 'm1', recordId: 'rec-A', queuedAt: '..1' }),
			attempts: 1,
			nextAttemptAt: at(9_000),
		});
		await q.enqueue(mut({ mutationId: 'm2', recordId: 'rec-A', queuedAt: '..2' })); // fresh + ready, same record
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({
			queue: q,
			push,
			now: () => 1_000,
			backoff: NO_JITTER_BACKOFF,
		});
		expect(push).not.toHaveBeenCalled(); // m1 deferred → rec-A blocked → m2 held
		expect(result).toMatchObject({ pushed: 0, deferred: 1 });
	});
});

describe('drainMutationQueue — #507 claim + conflict lifecycle', () => {
	it("re-stamps an update's baseRevision from the record's CURRENT revision at drain time (creates keep null)", async () => {
		const q = await queueWith(
			mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-A', queuedAt: '..1' }),
			mut({
				mutationId: 'm-edit',
				operation: 'update',
				recordId: 'rec-B',
				baseRevision: 'sha256:enqueue-time',
				queuedAt: '..2',
			})
		);
		const bases: (string | null)[] = [];
		const currentRevision = vi.fn(async () => 'sha256:re-anchored');
		const result = await drainMutationQueue({
			queue: q,
			push: async (m) => {
				bases.push(m.baseRevision);
				return ok(m);
			},
			currentRevision,
		});
		expect(result.pushed).toBe(2);
		expect(bases).toEqual([null, 'sha256:re-anchored']);
		expect(currentRevision).toHaveBeenCalledTimes(1); // never consulted for the create
	});

	it('falls back to the enqueue-time base when the record has no current revision', async () => {
		const q = await queueWith(mut({ mutationId: 'm-edit', baseRevision: 'sha256:enqueue-time' }));
		const bases: (string | null)[] = [];
		await drainMutationQueue({
			queue: q,
			push: async (m) => {
				bases.push(m.baseRevision);
				return ok(m);
			},
			currentRevision: async () => undefined,
		});
		expect(bases).toEqual(['sha256:enqueue-time']);
	});

	it('transitions a 409 conflict to a durable conflicted row storing server truth, and it LEAVES the drain', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const events: SyncEvent[] = [];
		const push = vi.fn(async (m: RecordMutation) => conflict(m));
		const first = await drainMutationQueue({ queue: q, push, observe: (e) => events.push(e) });
		expect(first.conflicts).toHaveLength(1);
		const [row] = await q.all();
		expect(row).toMatchObject({
			status: 'conflicted',
			conflictRevision: 'r1',
			conflictDocument: { id: 1 },
		});
		// No re-push, no backoff churn on later drains — resolution is the caller's.
		const second = await drainMutationQueue({ queue: q, push, observe: (e) => events.push(e) });
		expect(push).toHaveBeenCalledTimes(1);
		expect(second).toMatchObject({ conflicts: [], failed: 0, deferred: 0 });
		expect(events.filter((e) => e.type === 'queue.write.conflict-transition')).toHaveLength(1); // ONE event, at transition
	});

	it('holds later pending mutations for a record while one of its mutations is conflicted', async () => {
		const q = await queueWith(mut({ mutationId: 'm-first', queuedAt: '..1' }));
		const push = vi.fn(async (m: RecordMutation) =>
			m.mutationId === 'm-first' ? conflict(m) : ok(m)
		);
		await drainMutationQueue({ queue: q, push });
		await q.enqueue(mut({ mutationId: 'm-second', queuedAt: '..2' })); // same rec-A, queued after the conflict
		await drainMutationQueue({ queue: q, push });
		expect(push).toHaveBeenCalledTimes(1); // m-second held — pushing it would replay the same stale base
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-first', 'm-second']);
	});

	it('re-pushes a stale claimed row left by a crashed drain (the server dedupes on mutationId)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const [row] = await q.all();
		await q.replace({ ...row, status: 'claimed' }); // a prior drain died mid-push
		const result = await drainMutationQueue({ queue: q, push: async (m) => ok(m) });
		expect(result.pushed).toBe(1);
		expect(await q.all()).toEqual([]);
	});

	it('persists a dead-lettered row as durable status rejected — out of pending(), kept for the conflicts surface', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		await drainMutationQueue({
			queue: q,
			push: async () => {
				throw Object.assign(new Error('validation'), { status: 400 });
			},
		});
		expect(await q.pending()).toEqual([]); // the record is syncable again
		expect((await q.all()).map((m) => ({ id: m.mutationId, status: m.status }))).toEqual([
			{ id: 'm1', status: 'rejected' },
		]);
	});

	it('writes the server verdict ONTO the dead-lettered row so the recovery surface can say why (#832)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const push = vi.fn(async (mutation: RecordMutation) => {
			throw new RecordPushError(
				mutation,
				400,
				'rest_invalid_param',
				false,
				'Invalid parameter(s): billing'
			);
		});

		await drainMutationQueue({ queue: q, push, now: () => 1_767_225_600_000 });

		expect((await q.all())[0]).toMatchObject({
			status: 'rejected',
			rejectedStatus: 400,
			rejectedReason: 'rest_invalid_param',
			rejectedMessage: 'Invalid parameter(s): billing',
			rejectedAt: '2026-01-01T00:00:00.000Z',
		});
	});

	/**
	 * The dead-letter verdict write used to fail into a bare `catch {}` while the
	 * drain had ALREADY counted the row as rejected and emitted `push.rejected`.
	 * Live (dev-next smoke, 2026-08-06) that produced the worst possible shape: the
	 * log said `rejected: 1`, so everyone believed the engine had dead-lettered —
	 * while the durable row was still `pending`, `rejected` counted 0 in the Store
	 * health gate, and the recovery panel never mounted. The failure was invisible
	 * from every surface a person can actually look at.
	 *
	 * A dead letter that is not durable is not a dead letter. It must not be
	 * counted as one, and the write failure has to be loud.
	 */
	it('does NOT report a dead letter whose verdict could not be persisted — and says so loudly (#832 follow-up)', async () => {
		const q = await queueWith(mut({ mutationId: 'm1' }));
		const events: { type: string; level?: string; fields?: Record<string, unknown> }[] = [];
		// The storage refuses the status write — a worker/schema/conflict failure,
		// exactly the class the live incident looked like.
		const realReplace = q.replace.bind(q);
		q.replace = async (mutation) => {
			if (mutation.status === 'rejected') throw new Error('mutation queue append failed');
			return realReplace(mutation);
		};

		const result = await drainMutationQueue({
			queue: q,
			push: async (mutation) => {
				throw new RecordPushError(mutation, 400, 'rest_invalid_param', false, 'Invalid billing');
			},
			observe: (event) => events.push(event as never),
			now: () => 1_767_225_600_000,
		});

		// The row is NOT durably rejected…
		expect((await q.all())[0]).toMatchObject({ status: 'claimed' });
		// …so the drain must not claim it was, on any surface: not the result…
		expect(result.rejected).toEqual([]);
		// …and not the event the log pipeline classifies as a terminal rejection.
		expect(events.some((event) => event.type === 'push.rejected')).toBe(false);
		// It counts as a FAILURE and takes the backoff gate, or the lane reports a
		// clean tick and re-claims the row every cycle — an unbounded retry+log loop.
		expect(result.failed).toBe(1);
		expect((await q.all())[0]).toMatchObject({ attempts: 1 });
		expect(typeof (await q.all())[0]?.nextAttemptAt).toBe('string');
		// …and the failure is reported at error level, naming the row, instead of
		// being swallowed into a silence nobody can see.
		const unpersisted = events.find((event) => event.type === 'push.dead-letter-unpersisted');
		expect(unpersisted).toBeDefined();
		expect(unpersisted?.level).toBe('error');
		expect(unpersisted?.fields).toMatchObject({ mutationId: 'm1' });
	});

	it('preserves requeue provenance when a REQUEUED row dead-letters again — the count is the UI story (#832)', async () => {
		const q = await queueWith(mut({ mutationId: 'm-requeued', recordId: 'rec-A' }));
		const row = (await q.all())[0];
		if (!row) throw new Error('missing row');
		await q.replace({ ...row, requeuedFrom: 'm-original', requeueCount: 2 });

		await drainMutationQueue({
			queue: q,
			push: async () => {
				throw Object.assign(new Error('still refused'), { status: 400 });
			},
		});

		expect((await q.all())[0]).toMatchObject({
			status: 'rejected',
			requeuedFrom: 'm-original',
			requeueCount: 2,
		});
	});

	it('skips a row that left the queue between the scan and the claim — never resurrects or pushes it (#507 P1-2)', async () => {
		const q = await queueWith(mut({ mutationId: 'm-cancelled' }));
		const push = vi.fn(async (m: RecordMutation) => ok(m));
		const result = await drainMutationQueue({
			queue: q,
			push,
			// The scan already happened; an annihilating write intent removes the row
			// just before the drain claims it (currentRevision runs pre-claim).
			currentRevision: async () => {
				await q.remove(['m-cancelled']);
				return undefined;
			},
		});
		expect(push).not.toHaveBeenCalled(); // the refused claim skips the row
		expect(await q.all()).toEqual([]); // and does NOT re-insert it
		expect(result).toMatchObject({ pushed: 0, failed: 0, deferred: 0, rejected: [] });
	});

	describe('drain lease across two windows (task 43)', () => {
		it('two windows draining one row push it EXACTLY once', async () => {
			// Two RecordMutationQueue over one storage = two Electron windows. Both
			// drain at the same time; the lease + revision-checked claim mean only one
			// wins the row, so it is pushed once, not twice.
			const storage = new InMemoryRecordMutationStorage();
			const a = new RecordMutationQueue(storage);
			const b = new RecordMutationQueue(storage);
			await a.enqueue(mut({ mutationId: 'm-shared' }));
			const t0 = Date.parse('2026-01-01T00:00:00.000Z');

			const pushA = vi.fn(async (m: RecordMutation) => ok(m));
			const pushB = vi.fn(async (m: RecordMutation) => ok(m));
			await Promise.all([
				drainMutationQueue({ queue: a, push: pushA, drainInstanceId: 'window-A', now: () => t0 }),
				drainMutationQueue({ queue: b, push: pushB, drainInstanceId: 'window-B', now: () => t0 }),
			]);

			expect(pushA.mock.calls.length + pushB.mock.calls.length).toBe(1);
			expect(await a.all()).toEqual([]); // acked once, gone
		});

		it('a crashed window (claim never released) frees the row after the lease — the other window pushes it', async () => {
			const storage = new InMemoryRecordMutationStorage();
			const a = new RecordMutationQueue(storage);
			const b = new RecordMutationQueue(storage);
			const row = await a.enqueue(mut({ mutationId: 'm-stuck' }));
			const t0 = Date.parse('2026-01-01T00:00:00.000Z');

			// Window A claimed the row and then crashed — the row is durably 'claimed'
			// under A's lease, never acked or rescheduled.
			await a.claim(
				{ ...row, status: 'claimed', claimedBy: 'window-A', claimedUntil: iso(t0 + 60_000) },
				t0
			);

			// Within the lease, window B's drain leaves it alone…
			const early = vi.fn(async (m: RecordMutation) => ok(m));
			await drainMutationQueue({
				queue: b,
				push: early,
				drainInstanceId: 'window-B',
				now: () => t0 + 30_000,
			});
			expect(early).not.toHaveBeenCalled();

			// …past the lease, B reclaims and pushes it — crashed-drain recovery.
			const late = vi.fn(async (m: RecordMutation) => ok(m));
			await drainMutationQueue({
				queue: b,
				push: late,
				drainInstanceId: 'window-B',
				now: () => t0 + 61_000,
			});
			expect(late).toHaveBeenCalledTimes(1);
			expect(await b.all()).toEqual([]);
		});

		it('holds a records later mutations when its predecessor is claimed by another live window (FIFO)', async () => {
			// A record with a create + a following update. Window A holds a live lease
			// on the create; window B, draining, must NOT push the update out of order
			// (an update reaching the server before its create 404s).
			const storage = new InMemoryRecordMutationStorage();
			const a = new RecordMutationQueue(storage);
			const b = new RecordMutationQueue(storage);
			const t0 = Date.parse('2026-01-01T00:00:00.000Z');
			const create = await a.enqueue(
				mut({ mutationId: 'm-create', operation: 'create', recordId: 'rec-X' })
			);
			await a.enqueue(mut({ mutationId: 'm-update', operation: 'update', recordId: 'rec-X' }));
			// Window A claims the create with a live lease and is (notionally) pushing it.
			await a.claim(
				{ ...create, status: 'claimed', claimedBy: 'window-A', claimedUntil: iso(t0 + 60_000) },
				t0
			);

			const push = vi.fn(async (m: RecordMutation) => ok(m));
			await drainMutationQueue({
				queue: b,
				push,
				drainInstanceId: 'window-B',
				now: () => t0 + 10_000,
			});
			// B pushed NOTHING for rec-X: the leased create blocks its successor.
			expect(push).not.toHaveBeenCalled();
		});

		it('a stolen lease FENCES the original window: its late ack cannot resurrect or delete the thief row', async () => {
			// Window A's push outlived its lease; window B stole the row and is pushing
			// it. A's push now completes — its settlement (ack/reschedule) must be a
			// no-op, or it would delete B's claim or resurrect an already-acked row.
			const storage = new InMemoryRecordMutationStorage();
			const a = new RecordMutationQueue(storage);
			const b = new RecordMutationQueue(storage);
			const t0 = Date.parse('2026-01-01T00:00:00.000Z');
			const row = await a.enqueue(mut({ mutationId: 'm-slow' }));

			// A claims (t0, lease 60s) and starts a push that will outlive the lease.
			// B steals past the deadline and re-stamps its own claim.
			await a.claim(
				{ ...row, status: 'claimed', claimedBy: 'window-A', claimedUntil: iso(t0 + 60_000) },
				t0
			);
			await b.claim(
				{ ...row, status: 'claimed', claimedBy: 'window-B', claimedUntil: iso(t0 + 120_000) },
				t0 + 61_000
			);

			// A's slow drain finally settles — but A no longer owns the lease, so its
			// success acknowledge is fenced and does NOT remove B's claimed row.
			await drainMutationQueue({
				queue: a,
				push: async (m) => ok(m),
				drainInstanceId: 'window-A',
				now: () => t0 + 62_000,
				// The row is already 'claimed' by B; A's scan still sees it (pending()
				// includes claimed), tries to re-claim → refused (B's live lease) → A
				// never even pushes. Prove the row stays B's.
			});
			const survivor = (await a.all()).find((m) => m.mutationId === 'm-slow');
			expect(survivor?.claimedBy).toBe('window-B');
		});
	});
});

const iso = (ms: number): string => new Date(ms).toISOString();
