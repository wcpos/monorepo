// @vitest-environment node
/**
 * ADR 0040 PR A (Paul's ruling): a queue written by a protocol-2 till is PARKED in its own
 * generation (6), never sent and never carried over; only its receipt print counts move, so an
 * order already printed on this till still prints as a COPY after the re-sync. A failed carry is
 * retried, and only the carry. (The drain machinery itself is pinned against a real 17.4.0
 * generation-5 database in `rxdb-upgrade-pending-orders.test.ts`.)
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	FIRST_PROTOCOL_3_SCOPE_GENERATION,
	SCOPE_DATABASE_GENERATION,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { createEngineHarness, memoryEngineStorage, remoteId } from './testing';
import { queueFor } from './write-path/write-intents';
import {
	drainLegacyScopeDatabase,
	type LegacyScopeDrainPorts,
	WRITTEN_BEFORE_PROTOCOL_3,
} from './write-path/legacy-scope-drain';
import { RESYNC_RECEIPT_PRINT_COUNTS_ID } from './write-path/engine-order-repository';

setPremiumFlag();
afterEach(createEngineHarness.disposeTrackedEngines);

// One scope per test: the memory storage outlives a test.
let identity: StoreScopeIdentity;
let scopes = 0;
beforeEach(() => {
	scopes += 1;
	identity = { ...baseIdentity, site: `https://parked-${scopes}.example.test` };
});
const baseIdentity: StoreScopeIdentity = {
	site: 'https://parked.example.test',
	storeId: 1,
	cashierId: 7,
};
const PRINTED = '00000000-0000-4000-8000-0000000000a1';
const CART = '00000000-0000-4000-8000-0000000000a2';
const order = (uuid: string, id: number, status: string, local: Record<string, unknown>) => ({
	uuid,
	remoteId: id ? remoteId(id) : null,
	remoteKey: id ? String(remoteId(id)) : '',
	posUserId: '7',
	posStoreId: '1',
	number: String(id),
	dateCreatedGmt: '2026-10-19T10:00:00',
	status,
	total: '10.00',
	customerId: 0,
	payload: {
		id,
		status,
		total: '10.00',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
	},
	sync: { revision: 'sha256:r1', partial: false, source: 'woo-rest' },
	local: { dirty: false, pendingMutationIds: [], ...local },
});

/** A protocol-2 till's generation-6 database: a printed synced order, an offline cash update, a held cart. */
async function protocol2Database(storage: ReturnType<typeof memoryEngineStorage>) {
	const old = await createEngineHarness({
		identity,
		storage,
		mode: 'manual',
		ports: { scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION },
	});
	await old.seed('orders', [
		order(PRINTED, 41, 'pending', {
			receiptPrintCount: 2,
			dirty: true,
			pendingMutationIds: ['m1'],
		}),
		order(CART, 0, 'pos-open', { dirty: true, pendingMutationIds: ['m2'] }),
	]);
	const queue = queueFor(old.engine.active()!.database);
	await queue.enqueue({
		mutationId: 'm1',
		collectionName: 'orders',
		operation: 'update',
		recordId: PRINTED,
		origin: 'existing',
		// A protocol-2 offline tender: a ledger row and a copied status protocol 3 would replay.
		payload: {
			id: 41,
			status: 'completed',
			meta_data: [{ key: '_wcpos_payments', value: 'offline' }],
		},
		baseRevision: 'sha256:r1',
		queuedAt: '2026-10-19T10:00:00.000Z',
	});
	await queue.enqueue({
		mutationId: 'm2',
		collectionName: 'orders',
		operation: 'create',
		recordId: CART,
		origin: 'minted',
		payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: CART }] },
		baseRevision: null,
		queuedAt: '2026-10-19T10:01:00.000Z',
	});
	await old.dispose();
}

function ports(
	storage: ReturnType<typeof memoryEngineStorage>,
	extra: Partial<LegacyScopeDrainPorts>
): LegacyScopeDrainPorts & { sent: string[] } {
	const sent: string[] = [];
	return {
		site: {
			syncBaseUrl: `${identity.site}/wp-json/wcpos/v2`,
			wpJsonRoot: `${identity.site}/wp-json`,
		},
		storage,
		fetcher: async (url: string) => {
			sent.push(url);
			throw new Error('a parked queue sends nothing');
		},
		connectivity: () => 'online',
		...extra,
		sent,
	};
}

it('generation 7 is the first protocol-3 generation, and the drainable one is below it', () => {
	expect(SCOPE_DATABASE_GENERATION).toBe(7);
	expect(FIRST_PROTOCOL_3_SCOPE_GENERATION).toBe(7);
	expect(DRAINABLE_SCOPE_DATABASE_GENERATION).toBeLessThan(FIRST_PROTOCOL_3_SCOPE_GENERATION);
});

it('the protocol-2 queue stays parked while an already-printed synchronized order keeps its COPY count after the re-sync', async () => {
	const storage = memoryEngineStorage();
	await protocol2Database(storage);
	const app = await createEngineHarness({ identity, storage, mode: 'manual' });
	// The re-sync already brought the synced order back into generation 7.
	await app.seed('orders', [order(PRINTED, 41, 'completed', {})]);
	const drain = ports(storage, { liveEngine: app.engine });

	const outcome = await drainLegacyScopeDatabase(drain, identity);

	expect(outcome).toMatchObject({
		status: 'kept',
		reason: WRITTEN_BEFORE_PROTOCOL_3,
		retryable: false,
		pushed: 0,
		carried: 0,
		remaining: expect.objectContaining({ unsent: 1 }),
	});
	expect(drain.sent).toEqual([]);
	// No cart was carried into generation 7, and the printed order keeps its count there.
	expect(await app.collection('orders').findOne(CART).exec()).toBeNull();
	const printed = (await app.collection('orders').findOne(PRINTED).exec())!.toJSON() as {
		local: { receiptPrintCount?: number };
		status: string;
	};
	expect(printed.local.receiptPrintCount).toBe(2);
	expect(printed.status).toBe('completed');
	// A later start parks it again: never a push, never a cart.
	expect(await drainLegacyScopeDatabase(drain, identity)).toMatchObject({
		status: 'kept',
		reason: WRITTEN_BEFORE_PROTOCOL_3,
	});
	expect(drain.sent).toEqual([]);
});

it('a failed print-count carry is retried without sending or carrying any protocol-2 order work, and the next receipt remains a COPY', async () => {
	const storage = memoryEngineStorage();
	await protocol2Database(storage);
	const failed = ports(storage, {});

	// No live engine to carry into (a scope switch mid-carry): kept, retryable, nothing sent.
	expect(await drainLegacyScopeDatabase(failed, identity)).toMatchObject({
		status: 'kept',
		reason: expect.stringContaining('receipt print counts not carried over'),
		retryable: true,
		pushed: 0,
		carried: 0,
	});
	expect(failed.sent).toEqual([]);

	const app = await createEngineHarness({ identity, storage, mode: 'manual' });
	const retried = ports(storage, { liveEngine: app.engine });
	expect(await drainLegacyScopeDatabase(retried, identity)).toMatchObject({
		status: 'kept',
		reason: WRITTEN_BEFORE_PROTOCOL_3,
		retryable: false,
		pushed: 0,
		carried: 0,
	});
	expect(retried.sent).toEqual([]);
	expect(await app.collection('orders').findOne(CART).exec()).toBeNull();
	// The order is not resident yet: its count waits in the stash for the pull that lands it.
	const stash = await app.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
	expect(stash?.get('counts')).toEqual({ [PRINTED]: 2 });
});
