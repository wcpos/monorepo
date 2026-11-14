/**
 * ADR 0040 §1.3: `sync.adopted` certifies a WHOLE-document adoption and is bound to the revision
 * it adopted. The three writers that stamp a revision WITHOUT adopting its document (the 428
 * revision refresh, the manual rebase of a parked conflict, an acknowledgement withheld from
 * adoption because a successor is queued) must each leave `sync.adopted` exactly as it was, so the
 * stamp and the adoption disagree and the money envelope no longer treats the resident as the
 * document the server serves (query's `holdsAuthority`). Driven through the real engine.
 */

import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import type { StoreScopeIdentity } from '@wcpos/sync-core';

import { createEngineHarness, remoteId } from './testing';

import type { RxdbSyncEngine } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://naked-revision.example.test';
const UUID_A = '22222222-2222-4222-8222-222222222222';
const ADOPTED = { revision: 'sha256:r1', at: 1 };

let uniqueScope = 0;
function freshIdentity(): StoreScopeIdentity {
	uniqueScope += 1;
	return { site: SITE, storeId: 7, cashierId: `naked-${uniqueScope}` };
}

function engineWith(fetch: (url: string, init?: RequestInit) => Promise<Response>): RxdbSyncEngine {
	return createEngineHarness({
		site: SITE,
		identity: freshIdentity(),
		mode: 'manual',
		fetch,
		routes: { '/changes/config-fingerprint': { fingerprints: {} } },
		awaitReady: false,
	}).engine;
}

/**
 * A server-born order whose resident was adopted whole under `sha256:r1`. `on-hold`, not
 * `pos-open`: the open-cart hold would keep a pos-open order's note edit off the wire.
 */
async function insertAdoptedOrder(engine: RxdbSyncEngine): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		posUserId: '',
		posStoreId: '',
		uuid: UUID_A,
		remoteId: remoteId(42),
		remoteKey: String(remoteId(42) ?? ''),
		number: '1042',
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: 'on-hold',
		total: '10.00',
		customerId: 0,
		payload: {
			id: 42,
			status: 'on-hold',
			total: '10.00',
			currency: 'USD',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		},
		sync: { revision: ADOPTED.revision, partial: false, source: 'woo-rest', adopted: ADOPTED },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

async function residentSync(engine: RxdbSyncEngine) {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await scope.database.collections.orders.findOne(UUID_A).exec();
	const json = doc?.toJSON() as
		{ sync: { revision: string; adopted?: unknown }; payload: Record<string, unknown> } | undefined;
	if (!json) throw new Error('resident missing');
	return json;
}

/** Push envelopes to the fake server; targeted /orders pulls answer the server's moved document. */
function routedFetch(server: ReturnType<typeof createFakeWriteServer>, revision: () => string) {
	return async (url: string, init?: RequestInit): Promise<Response> => {
		if (url.includes('/push/')) return server.fetch(url, init as never);
		const u = new URL(url);
		if (!u.pathname.endsWith('/orders')) throw new Error(`routedFetch: unexpected ${u.pathname}`);
		const include = (u.searchParams.get('include') ?? '').split(',').map(Number).filter(Boolean);
		return Response.json(
			include.map((id) => ({
				id,
				_rxdb_revision: revision(),
				number: '1042',
				status: 'on-hold',
				total: '120.00',
				currency: 'EUR',
				date_created_gmt: '2026-07-10T00:00:00',
				date_modified_gmt: '2026-07-10T00:00:01',
				customer_id: 0,
				meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
			}))
		);
	};
}

const note = { customer_note: 'a note' };

/** The stamp moved, the adoption did not: the resident no longer certifies its document. */
function expectAuthorityRevoked(sync: { revision: string; adopted?: unknown }, revision: string) {
	expect(sync.revision).toBe(revision);
	expect(sync.adopted).toEqual(ADOPTED);
	expect(sync.revision).not.toBe(ADOPTED.revision);
}

describe('a revision written without its document leaves sync.adopted behind', () => {
	it('the 428 revision refresh', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:r2' });
		server.script((env) =>
			env.operation === 'update' ? { kind: 'precondition_required' } : undefined
		);
		const engine = engineWith(routedFetch(server, () => 'sha256:r2'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: note,
			});
			await engine.sync('write-drain');

			const resident = await residentSync(engine);
			expectAuthorityRevoked(resident.sync, 'sha256:r2');
			// Only the stamp moved: the server's 120 EUR document was never adopted.
			expect(resident.payload).toMatchObject({ total: '10.00', currency: 'USD' });
		} finally {
			await engine.dispose();
		}
	});

	it('the manual rebase of a parked conflict', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:r1' });
		let conflicts = 2; // past the one automatic recovery, so the row parks
		server.script(() =>
			conflicts-- > 0
				? { kind: 'conflict', current: { id: 42, total: '120.00' }, currentRevision: 'sha256:r3' }
				: undefined
		);
		const engine = engineWith(routedFetch(server, () => 'sha256:r3'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: note,
			});
			await engine.sync('write-drain');
			expect(await engine.conflicts()).toMatchObject([{ mutationId: receipt.mutationId }]);
			await engine.resolveConflict(receipt.mutationId, 'retry-with-server-base');

			const resident = await residentSync(engine);
			expectAuthorityRevoked(resident.sync, 'sha256:r3');
			expect(resident.payload).toMatchObject({ total: '10.00', currency: 'USD' });
		} finally {
			await engine.dispose();
		}
	});

	it('an acknowledgement withheld from adoption because a successor is queued', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:r1' });
		let release: () => void = () => undefined;
		let received: () => void = () => undefined;
		const released = new Promise<void>((resolve) => (release = resolve));
		const arrived = new Promise<void>((resolve) => (received = resolve));
		let first = true;
		const routed = routedFetch(server, () => 'unused');
		const fetch = async (url: string, init?: RequestInit) => {
			const response = await routed(url, init);
			if (first && url.includes('/push/')) {
				first = false;
				received();
				await released;
			}
			return response;
		};
		const engine = engineWith(fetch);
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: note,
			});
			const drain = engine.sync('write-drain');
			await arrived;
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'a second note' },
			});
			release();
			expect(await drain).toMatchObject({ pushed: 1 });

			const acknowledged = server.applied.get(UUID_A)?.revision;
			expect(acknowledged).toBeDefined();
			expectAuthorityRevoked((await residentSync(engine)).sync, acknowledged!);
		} finally {
			release();
			await engine.dispose();
		}
	});
});

describe("engine.orderRevision.stamp: a status poll's naked stamp", () => {
	it('moves the revision and leaves sync.adopted behind', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith(routedFetch(server, () => 'unused'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			expect(await engine.orderRevision.stamp(UUID_A, 'sha256:r2', Date.now())).toEqual({
				replaced: 'sha256:r1',
			});
			expectAuthorityRevoked((await residentSync(engine)).sync, 'sha256:r2');
		} finally {
			await engine.dispose();
		}
	});

	it('yields to an adoption newer than the answer', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith(routedFetch(server, () => 'unused'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			expect(await engine.orderRevision.stamp(UUID_A, 'sha256:r0', 0)).toEqual({ replaced: null });
			expect((await residentSync(engine)).sync).toMatchObject({
				revision: ADOPTED.revision,
				adopted: ADOPTED,
			});
		} finally {
			await engine.dispose();
		}
	});

	/** The server moved to r2 (a void the poll saw); the till edits the order's note and drains. */
	async function noteUpdateEnvelopes(stamp: boolean) {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:r2' });
		const engine = engineWith(routedFetch(server, () => 'sha256:r2'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			if (stamp) await engine.orderRevision.stamp(UUID_A, 'sha256:r2', Date.now());
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: note,
			});
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1 });
			return server.received.filter((envelope) => envelope.operation === 'update');
		} finally {
			await engine.dispose();
		}
	}

	it('the next order push goes out under the stamped revision', async () => {
		const updates = await noteUpdateEnvelopes(true);
		expect(updates).toHaveLength(1);
		expect(updates[0]?.baseRevision).toBe('sha256:r2');
	});

	it('control: without the stamp the push is refused once and re-sent', async () => {
		const updates = await noteUpdateEnvelopes(false);
		expect(updates.map((envelope) => envelope.baseRevision)).toEqual(['sha256:r1', 'sha256:r2']);
	});
});

describe("engine.orderRevision.readopt: true only when this refresh's own task adopted it", () => {
	it('re-adopts the store document under an equal stamp and reports it', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith(routedFetch(server, () => ADOPTED.revision));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			expect(await engine.orderRevision.readopt(42)).toBe(true);
			const resident = await residentSync(engine);
			expect(resident.payload).toMatchObject({ total: '120.00', currency: 'EUR' });
			expect(resident.sync.adopted).toMatchObject({ revision: ADOPTED.revision });
			expect((resident.sync.adopted as { at: number }).at).toBeGreaterThan(ADOPTED.at);
		} finally {
			await engine.dispose();
		}
	});

	// Moved from query's money-command suite ("a pull adopted in the same millisecond as the
	// answer never confirms a replayed submit"): the proof is the refresh's own task, so no stamp
	// or time on the resident can stand in for it.
	it('a pull adopted before the readopt opens is not reported when the readopt writes nothing', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith(routedFetch(server, () => 'sha256:r2'));
		try {
			await engine.ready;
			await insertAdoptedOrder(engine);
			const pull = engine.require({
				id: 'the-normal-pull',
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: [42].map(remoteId),
				forceRefresh: true,
			});
			await pull.ready;
			pull.release();
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			// Local work the drain has not pushed: the guard keeps the resident from the readopt.
			await (await scope.database.collections.orders.findOne(UUID_A).exec())!.incrementalModify(
				(data: Record<string, unknown>) => ({
					...data,
					local: { dirty: true, pendingMutationIds: ['held'] },
				})
			);
			const adoptedByPull = (await residentSync(engine)).sync.adopted;
			expect(adoptedByPull).toMatchObject({ revision: 'sha256:r2' });

			expect(await engine.orderRevision.readopt(42)).toBe(false);
			expect((await residentSync(engine)).sync.adopted).toEqual(adoptedByPull);
		} finally {
			await engine.dispose();
		}
	});
});
