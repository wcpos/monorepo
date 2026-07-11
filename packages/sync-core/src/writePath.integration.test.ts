import { describe, expect, it, vi } from 'vitest';

import { RECORD_UUID_META_KEY } from './recordIdentity';
import { buildCreateMutation, buildUpdateMutation } from './recordMutation';
import { InMemoryRecordMutationStorage, RecordMutationQueue } from './recordMutationQueue';
import {
	pushEndpointResolver,
	pushRecordMutation,
	type PushResult,
	reconcileCreateAck,
} from './recordPushAdapter';
import { drainMutationQueue } from './drainMutationQueue';

/**
 * Integration: the generic write path assembled end to end — buildMutation → durable
 * queue → drain → push (via the canonical /push/{collection} resolver) → reconcile.
 * Proves the units (#220 model, #221 queue, #222 adapter, #223 drain, #225/#226
 * revision) compose into a working loop against a fake server honoring the contract.
 */

let n = 0;
const deps = {
	mintUuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
	now: () => `2026-06-26T00:00:0${n}.000Z`,
};

/** A fake server: echoes the client uuid back, assigns a numeric id, returns a revision. */
const fakeServer = (assignedId: number, revision: string) =>
	vi.fn(async (_url: string, init?: RequestInit) => {
		const env = JSON.parse((init?.body as string) ?? '{}');
		const body = {
			document: { id: assignedId, meta_data: [{ key: RECORD_UUID_META_KEY, value: env.recordId }] },
			currentRevision: revision,
		};
		return { status: 201, ok: true, json: async () => body } as unknown as Response;
	});

describe('write path integration', () => {
	it('build → enqueue → drain → push → reconcile, with identity + revision round-trip', async () => {
		n = 0;
		const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const resolve = pushEndpointResolver('https://shop.example/wp-json/');

		// a born-local create
		const create = buildCreateMutation(
			{ collectionName: 'customers', payload: { email: 'a@b.c' } },
			deps
		);
		await queue.enqueue(create);

		const fetcher = fakeServer(555, 'sha256:rev1');
		const reconciled: { recordId: string; remoteId: unknown; revision: string | null }[] = [];

		const result = await drainMutationQueue({
			queue,
			push: (m) => pushRecordMutation({ mutation: m, resolveEndpoint: resolve, fetcher }),
			applyAck: async (m, res: PushResult) => {
				const ack = reconcileCreateAck(m, res.document);
				reconciled.push({ ...ack, revision: res.currentRevision });
			},
		});

		expect(result.pushed).toBe(1);
		expect(await queue.pending()).toEqual([]); // fully drained + acknowledged

		// the resolver targeted the per-collection endpoint
		expect(fetcher.mock.calls[0][0]).toBe(
			'https://shop.example/wp-json/wc-rxdb-sync/v1/push/customers'
		);
		// the envelope carried the born-local uuid + idempotency key
		const sent = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
		expect(sent.recordId).toBe(create.recordId);
		expect(sent.operation).toBe('create');

		// reconciliation: stable uuid kept, server id captured, revision available for the next update
		expect(reconciled).toEqual([
			{ recordId: create.recordId, remoteId: 555, revision: 'sha256:rev1' },
		]);
	});

	it('an update uses the prior revision as baseRevision and conflicts are surfaced, not acknowledged', async () => {
		n = 0;
		const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const resolve = pushEndpointResolver('https://shop.example/wp-json');

		// an update built with the revision the server last returned
		const update = buildUpdateMutation(
			{
				collectionName: 'products',
				recordId: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d',
				payload: { regular_price: '9' },
				baseRevision: 'sha256:rev1',
			},
			deps
		);
		await queue.enqueue(update);

		// the server rejects it as stale (someone else moved the record)
		const conflictFetcher = vi.fn(
			async () =>
				({
					status: 409,
					ok: false,
					json: async () => ({
						code: 'woo_rxdb_sync_conflict',
						current: { id: 9 },
						currentRevision: 'sha256:rev2',
					}),
				}) as unknown as Response
		);

		const result = await drainMutationQueue({
			queue,
			push: (m) =>
				pushRecordMutation({ mutation: m, resolveEndpoint: resolve, fetcher: conflictFetcher }),
		});

		expect(result.pushed).toBe(0);
		expect(result.conflicts).toHaveLength(1);
		expect(result.conflicts[0].conflict?.currentRevision).toBe('sha256:rev2');
		expect((await queue.pending()).map((m) => m.mutationId)).toEqual([update.mutationId]); // left queued to resolve
	});
});
