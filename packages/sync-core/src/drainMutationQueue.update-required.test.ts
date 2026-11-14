/**
 * Sentry WOOCOMMERCE-POS-30B repro (2026-11-10): a till older than the store's plugin
 * pushes an order create and the store answers the protocol gate's deliberate refusal
 * (426 `wcpos_update_required`, SYNC341). The SYNC341 copy tells the cashier "Unsent sales
 * stay on this device and send after the update", so the refusal must leave the sale
 * queued (a verdict on the APP, not on the order), never dead-letter it like a 4xx payload
 * verdict. The refusal also walls the rest of the pass: every later push would get it too.
 */
import { describe, expect, it, vi } from 'vitest';

import { type SyncEvent } from './telemetry';
import { InMemoryRecordMutationStorage, RecordMutationQueue } from './recordMutationQueue';
import { pushRecordMutation, RecordPushError } from './recordPushAdapter';
import { drainMutationQueue } from './drainMutationQueue';

import type { RecordMutation } from './recordMutation';

const orderCreate = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm-sale',
	collectionName: 'orders',
	operation: 'create',
	recordId: 'order-uuid-1',
	origin: 'minted',
	payload: { uuid: 'order-uuid-1', status: 'processing' },
	baseRevision: null,
	queuedAt: '2026-11-10T12:17:00.000Z',
	...over,
});

const REFUSAL = {
	code: 'wcpos_update_required',
	message: 'This store requires a newer version of WCPOS.',
	data: { status: 426, min_protocol: 3, server_protocol: 3, plugin_version: '2.0.0' },
};

const jsonResponse = (status: number, body: unknown): Response =>
	({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

/** One order create, drained once against a push that always throws `error`. */
async function drainOneRefused(error: (mutation: RecordMutation) => Error) {
	const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	await q.enqueue(orderCreate());
	const events: SyncEvent[] = [];
	const push = vi.fn(async (mutation: RecordMutation) => {
		throw error(mutation);
	});
	const result = await drainMutationQueue({ queue: q, push, observe: (e) => events.push(e) });
	return { q, events, push, result };
}

describe('drainMutationQueue — protocol-gate refusal (POS-30B)', () => {
	it('keeps a sale queued when the store answers 426 wcpos_update_required, instead of dead-lettering it', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(orderCreate());
		const events: SyncEvent[] = [];
		const fetcher = vi.fn(async () => jsonResponse(426, REFUSAL));

		const result = await drainMutationQueue({
			queue: q,
			push: (mutation) =>
				pushRecordMutation({
					mutation,
					resolveEndpoint: () => ({
						url: 'https://store.example/wp-json/wcpos/v2/orders',
						method: 'POST',
					}),
					fetcher,
				}),
			observe: (e) => events.push(e),
		});

		// The sale is still unsent work on this device, waiting for the app update.
		expect(result.rejected).toEqual([]);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-sale']);
		expect((await q.all())[0]).not.toMatchObject({ status: 'rejected' });
		expect(events.some((e) => e.type === 'push.rejected')).toBe(false);
	});

	it('walls the rest of the pass after a 426 refusal: later rows stay pending and unpushed', async () => {
		const q = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		await q.enqueue(orderCreate());
		await q.enqueue(
			orderCreate({
				mutationId: 'm-sale-2',
				recordId: 'order-uuid-2',
				payload: { uuid: 'order-uuid-2', status: 'processing' },
				queuedAt: '2026-11-10T12:18:00.000Z',
			})
		);
		const push = vi.fn(async (mutation: RecordMutation) => {
			throw new RecordPushError(mutation, 426, 'wcpos_update_required');
		});

		const result = await drainMutationQueue({ queue: q, push });

		expect(push).toHaveBeenCalledTimes(1);
		const pending = await q.pending();
		expect(pending.map((m) => m.mutationId).sort()).toEqual(['m-sale', 'm-sale-2']);
		const second = (await q.all()).find((m) => m.mutationId === 'm-sale-2');
		expect(second?.attempts ?? 0).toBe(0);
		expect(result.updateRequired).toBe(true);
		expect(result.sessionExpired).toBe(false);
		expect(result.rejected).toEqual([]);
	});

	it('keys the refusal on the body code when a middlebox rewrote the status to 400', async () => {
		const { q, events, result } = await drainOneRefused(
			(mutation) => new RecordPushError(mutation, 400, 'wcpos_update_required')
		);

		expect(result.rejected).toEqual([]);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-sale']);
		expect((await q.all())[0]).not.toMatchObject({ status: 'rejected' });
		expect(events.some((e) => e.type === 'push.rejected')).toBe(false);
		expect(result.updateRequired).toBe(true);
	});

	it('does not dead-letter a 426 refusal even when the adapter marked it permanent', async () => {
		const { q, result } = await drainOneRefused(
			(mutation) => new RecordPushError(mutation, 426, 'wcpos_update_required', true)
		);

		expect(result.rejected).toEqual([]);
		expect((await q.pending()).map((m) => m.mutationId)).toEqual(['m-sale']);
		expect((await q.all())[0]).not.toMatchObject({ status: 'rejected' });
	});

	it('still dead-letters a plain 400 rest_invalid_param (control)', async () => {
		const { result } = await drainOneRefused(
			(mutation) => new RecordPushError(mutation, 400, 'rest_invalid_param')
		);

		expect(result.rejected).toHaveLength(1);
		expect(result.updateRequired).toBe(false);
	});
});
