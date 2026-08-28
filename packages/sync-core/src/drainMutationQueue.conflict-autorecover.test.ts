import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecordMutationStorage, RecordMutationQueue } from './recordMutationQueue';
import { pushEndpointResolver, pushRecordMutation } from './recordPushAdapter';
import { createFakeWriteServer } from './fakeWriteServer';
import { drainMutationQueue } from './drainMutationQueue';

import type { RecordMutation } from './recordMutation';
import type { SyncEvent } from './telemetry';

/**
 * ORDER WRITE-CONFLICT AUTO-RECOVERY (#1204, ruled 2026-08-14).
 *
 * The wedge these pin: a refused server delete rewrote the order's stock
 * bookkeeping, which moved its canonical revision, so the NEXT push of that
 * order 409'd `woo_rxdb_sync_conflict` and parked terminally — the order could
 * then neither be voided nor saved, and the cashier's only signal was a bare
 * SYNC999. The plugin half stops manufacturing that drift (wcpos/woocommerce-pos#1593),
 * but a genuine stale-revision 409 wedged the order identically, so the client
 * re-anchors ONCE from the 409's own `currentRevision` and re-pushes the same
 * intent.
 *
 * These drive the REAL push adapter against the fake write server, so the 409
 * body is the contract's own conflict envelope rather than a hand-built result:
 * the recovery is only real if the revision the server actually returned is the
 * one the retry pushes.
 */

const SYNC_BASE = 'https://example.test/wp-json/wcpos/v2';

const mut = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm1',
	collectionName: 'orders',
	operation: 'update',
	recordId: 'order-A',
	origin: 'existing',
	payload: { id: 900, status: 'pos-open' },
	baseRevision: 'sha256:stale',
	queuedAt: '2026-08-14T00:00:00.000Z',
	...over,
});

async function harness(mutation: RecordMutation) {
	const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	await queue.enqueue(mutation);
	const server = createFakeWriteServer();
	const events: SyncEvent[] = [];
	const push = (m: RecordMutation) =>
		pushRecordMutation({
			mutation: m,
			resolveEndpoint: pushEndpointResolver(SYNC_BASE),
			fetcher: server.fetch,
		});
	return { queue, server, events, push };
}

describe('drainMutationQueue — order conflict auto-recovery (#1204)', () => {
	it('warns when recovery overwrites clashing server fields', async () => {
		const { queue, server, events, push } = await harness(
			mut({
				payload: { id: 900, status: 'completed', line_items: [{ id: 11, quantity: 1 }] },
			})
		);
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			return attempts === 1
				? {
						kind: 'conflict',
						current: {
							id: 900,
							status: 'processing',
							line_items: [
								{ id: 11, quantity: 1 },
								{ id: 12, quantity: 1 },
							],
						},
						currentRevision: 'sha256:server-moved',
					}
				: undefined;
		});

		await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(
			events.filter((event) => event.type === 'queue.write.conflict-overwrote-server')
		).toEqual([
			{
				type: 'queue.write.conflict-overwrote-server',
				level: 'warn',
				collection: 'orders',
				fields: {
					recordId: 'order-A',
					mutationId: 'm1',
					baseRevision: 'sha256:server-moved',
					overwrittenFields: ['line_items[12]', 'status'],
					overwrittenCount: 2,
				},
			},
		]);
		expect(events.some((event) => event.type === 'queue.write.conflict-recovered')).toBe(false);
	});

	it('records a compared recovery when the server differs only by money width', async () => {
		const { queue, server, events, push } = await harness(
			mut({ payload: { id: 900, total: '6.713280' } })
		);
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			return attempts === 1
				? {
						kind: 'conflict',
						current: { id: 900, total: '6.71' },
						currentRevision: 'sha256:server-moved',
					}
				: undefined;
		});

		await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(events.filter((event) => event.type === 'queue.write.conflict-recovered')).toEqual([
			expect.objectContaining({
				fields: expect.objectContaining({ serverDocumentCompared: true }),
			}),
		]);
	});

	it('never diffs a recovered DELETE — its payload is the uuid, not fields', async () => {
		const { queue, server, events, push } = await harness(
			mut({ operation: 'delete', payload: { id: 'order-A' } })
		);
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			return attempts === 1
				? {
						kind: 'conflict',
						current: { id: 900, status: 'processing' },
						currentRevision: 'sha256:server-moved',
					}
				: undefined;
		});

		await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(events.some((event) => event.type === 'queue.write.conflict-overwrote-server')).toBe(
			false
		);
		expect(events.filter((event) => event.type === 'queue.write.conflict-recovered')).toEqual([
			expect.objectContaining({
				fields: expect.objectContaining({ serverDocumentCompared: false }),
			}),
		]);
	});

	it('records an uncomputed recovery when the conflict has no server document', async () => {
		const { queue, server, events, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			return attempts === 1
				? { kind: 'conflict', current: null, currentRevision: 'sha256:server-moved' }
				: undefined;
		});

		await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(events.filter((event) => event.type === 'queue.write.conflict-recovered')).toEqual([
			expect.objectContaining({
				fields: expect.objectContaining({ serverDocumentCompared: false }),
			}),
		]);
	});

	it('re-anchors from the 409 and re-pushes once, so the order lands instead of parking', async () => {
		const { queue, server, events, push } = await harness(mut());
		// The server moved on without the client: exactly the state a refused
		// delete's stock rewrite leaves behind.
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });

		const result = await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: (mutation) => mutation.collectionName === 'orders',
			observe: (event) => events.push(event),
		});

		expect(result.pushed).toBe(1);
		expect(result.conflicts).toEqual([]);
		// The queue RELEASED it — a parked row would still be here, blocking every
		// later write to the order.
		expect(await queue.all()).toEqual([]);
		// Two envelopes: the stale attempt, then the re-anchored one carrying the
		// revision the 409 itself reported.
		expect(server.received.map((envelope) => envelope.baseRevision)).toEqual([
			'sha256:stale',
			'sha256:server-moved',
		]);
		// Same mutationId both times — the server dedupes on it, and an
		// `awaitWriteOutcome` caller holds it.
		expect(new Set(server.received.map((envelope) => envelope.mutationId))).toEqual(
			new Set(['m1'])
		);
		expect(events.filter((event) => event.type === 'queue.write.conflict-recovered')).toHaveLength(
			1
		);
		expect(events.some((event) => event.type === 'queue.write.conflict-transition')).toBe(false);
	});

	it('parks conflicted on the SECOND consecutive conflict, carrying the fresher server truth', async () => {
		const { queue, server, events, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		// Every push conflicts, including the re-anchored one — a genuinely
		// disagreeing server, not bookkeeping drift.
		server.script(() => ({
			kind: 'conflict',
			current: { id: 900 },
			currentRevision: 'sha256:newer',
		}));

		const result = await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(result.pushed).toBe(0);
		expect(result.conflicts).toHaveLength(1);
		expect(server.received).toHaveLength(2); // one recovery attempt, no more
		const [row] = await queue.all();
		expect(row).toMatchObject({
			mutationId: 'm1',
			status: 'conflicted',
			conflictRevision: 'sha256:newer',
		});
		expect(events.filter((event) => event.type === 'queue.write.conflict-transition')).toHaveLength(
			1
		);
		expect(events.some((event) => event.type === 'queue.write.conflict-recovered')).toBe(false);
	});

	it('parks a NON-order conflict immediately — the engine invariant is untouched off orders', async () => {
		const { queue, server, events, push } = await harness(
			mut({ collectionName: 'products', recordId: 'product-A', payload: { id: 12 } })
		);
		server.seed('product-A', { id: 12, revision: 'sha256:server-moved', collection: 'products' });

		const result = await drainMutationQueue({
			queue,
			push,
			// The production wiring: orders only.
			autoRecoverConflict: (mutation) => mutation.collectionName === 'orders',
			observe: (event) => events.push(event),
		});

		expect(result.conflicts).toHaveLength(1);
		expect(server.received).toHaveLength(1); // no re-anchor, no second push
		expect((await queue.all())[0]).toMatchObject({ status: 'conflicted' });
		expect(events.some((event) => event.type === 'queue.write.conflict-recovered')).toBe(false);
	});

	it('parks immediately when the 409 carries no revision to re-anchor to', async () => {
		const { queue, server, events, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		server.script(() => ({ kind: 'conflict', current: null, currentRevision: null }));

		const result = await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		expect(result.conflicts).toHaveLength(1);
		// Re-pushing the SAME stale base would be a guaranteed second 409 — a
		// pointless request against a POS's own store.
		expect(server.received).toHaveLength(1);
		expect((await queue.all())[0]).toMatchObject({ status: 'conflicted' });
	});

	it('settles a re-anchored push that is REFUSED as the refusal, never as a conflict', async () => {
		const { queue, server, events, push } = await harness(
			mut({ operation: 'delete', payload: { id: 900 } })
		);
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			// #1204's own sequence: the stale delete 409s, and the re-anchored one
			// reaches the capability gate that refuses it.
			return attempts === 1 ? undefined : { kind: 'cannot_delete' };
		});

		const result = await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			observe: (event) => events.push(event),
		});

		// The honest verdict is the 403, which is what #866's pending fallback keys
		// on — parking it 'conflicted' would hide the reason the cashier must act on.
		expect(result.conflicts).toEqual([]);
		expect(result.rejected).toHaveLength(1);
		expect(result.rejected[0]).toMatchObject({ reason: 'woocommerce_rest_cannot_delete' });
		expect((await queue.all())[0]).toMatchObject({ status: 'rejected' });
	});

	it('grants a 428 on the re-anchored push the same one-refresh retry as a first push', async () => {
		// The initial-push path spends ONE targeted refreshRevision + re-push on a
		// 428 (see this module's header contract). The auto-recovery re-push is a
		// push like any other, so a FIRST 428 there must buy the same refresh —
		// dead-lettering it spends none of the allowance and permanently rejects an
		// order write that had only hit 409-then-428.
		const { queue, server, events, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		let attempts = 0;
		server.script(() => {
			attempts += 1;
			// 1st: stale base, so the contract's own 409 runs. 2nd: the re-anchored
			// push is met with a transient precondition demand. 3rd: unscripted, so
			// the refreshed base is checked against the server for real.
			return attempts === 2 ? { kind: 'precondition_required' } : undefined;
		});

		const result = await drainMutationQueue({
			queue,
			push,
			autoRecoverConflict: () => true,
			refreshRevision: async () => 'sha256:server-moved',
			observe: (event) => events.push(event),
		});

		// Three envelopes: stale → re-anchored (428) → refreshed, which lands.
		expect(server.received.map((envelope) => envelope.baseRevision)).toEqual([
			'sha256:stale',
			'sha256:server-moved',
			'sha256:server-moved',
		]);
		expect(result.rejected).toEqual([]);
		expect(result.conflicts).toEqual([]);
		expect(result.pushed).toBe(1);
		// Released, not parked — a rejected row would block every later write to the order.
		expect(await queue.all()).toEqual([]);
	});

	it('does not recover when the host supplies no policy (every legacy caller unchanged)', async () => {
		const { queue, server, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });

		const result = await drainMutationQueue({ queue, push });

		expect(result.conflicts).toHaveLength(1);
		expect(server.received).toHaveLength(1);
		expect((await queue.all())[0]).toMatchObject({ status: 'conflicted' });
	});

	it('mutation check: without the re-anchor the same drain wedges the order', async () => {
		// The control arm for the first test — same server state, same intent, only
		// the policy withheld. If auto-recovery ever silently stops running, the
		// first test fails and THIS one still passes, which names the regression.
		const { queue, server, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		const parked = await drainMutationQueue({ queue, push, autoRecoverConflict: () => false });
		expect(parked.pushed).toBe(0);
		expect((await queue.all())[0]).toMatchObject({ status: 'conflicted' });

		// …and a later write to that order is held behind it, which is the wedge.
		await queue.enqueue(mut({ mutationId: 'm2', queuedAt: '2026-08-14T00:01:00.000Z' }));
		const later = await drainMutationQueue({ queue, push, autoRecoverConflict: () => false });
		expect(later.pushed).toBe(0);
		expect(server.received).toHaveLength(1);
	});

	it('re-pushes at most once per drain even when the conflict repeats every tick', async () => {
		const { queue, server, push } = await harness(mut());
		server.seed('order-A', { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		server.script(() => ({ kind: 'conflict', currentRevision: 'sha256:newer' }));
		const autoRecoverConflict = vi.fn(() => true);

		await drainMutationQueue({ queue, push, autoRecoverConflict });
		expect(server.received).toHaveLength(2);

		// A parked row is not re-attempted by a later drain, so the recovery cannot
		// become a loop against the merchant's store.
		await drainMutationQueue({ queue, push, autoRecoverConflict });
		expect(server.received).toHaveLength(2);
	});
});
