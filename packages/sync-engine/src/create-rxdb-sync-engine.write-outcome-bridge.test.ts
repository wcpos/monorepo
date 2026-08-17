/**
 * WEB MULTI-TAB WRITE OUTCOMES (#1209), through two real engines.
 *
 * Since #1057 a follower tab's drain tick is a no-op and the leader owns the
 * write plane — but engine events were in-process only, so a follower's
 * `awaitWriteOutcome` waited on an event that could only ever fire in the
 * leader's window. #866's refused-delete → `convertToPending()` fallback was
 * therefore structurally unreachable off-leader and `void.tsx` showed "Order
 * removed" for an order the store had refused to delete.
 *
 * These run a LEADER engine and a FOLLOWER engine over one shared channel and
 * assert on what the follower's `events()` actually delivers. Also pinned here:
 * #1204's auto-recovery composes — a 409 that recovers must reach the follower
 * as ONE success, never an intermediate conflict.
 */

import { remoteId } from './testing';
import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import type { StoreScopeIdentity } from '@wcpos/sync-core';

import { createEngineHarness } from './testing';
import {
	createWriteOutcomeBridge,
	type WriteOutcomeChannel,
} from './write-path/write-outcome-bridge';

import type { EngineEvent, RxdbSyncEngine } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://multitab.example.test';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CHANNEL = 'wcpos-write-outcomes:test-scope';

let uniqueScope = 0;
function freshIdentity(): StoreScopeIdentity {
	uniqueScope += 1;
	return { site: SITE, storeId: 7, cashierId: `multitab-${uniqueScope}` };
}

/** BroadcastChannel semantics: same name sees each other, never itself. */
function channelWorld() {
	const buses = new Map<string, Set<FakeChannel>>();
	class FakeChannel implements WriteOutcomeChannel {
		onmessage: ((event: { data: unknown }) => void) | null = null;
		constructor(readonly name: string) {
			const bus = buses.get(name) ?? new Set<FakeChannel>();
			bus.add(this);
			buses.set(name, bus);
		}
		postMessage(data: unknown): void {
			// Structured clone, like the real thing — so a payload that would not
			// survive the hop fails here rather than in a browser.
			const cloned = structuredClone(data);
			for (const peer of buses.get(this.name) ?? []) {
				if (peer !== this) peer.onmessage?.({ data: cloned });
			}
		}
		close(): void {
			buses.get(this.name)?.delete(this);
		}
	}
	return (name: string): WriteOutcomeChannel => new FakeChannel(name);
}

async function insertServerOrder(engine: RxdbSyncEngine): Promise<void> {
	await engine.ready;
	await engine.active()!.database.collections.orders.insert({
		uuid: ORDER_ID,
		remoteId: remoteId(900),
		number: '900',
		dateCreatedGmt: '2026-08-14T00:00:00',
		// NOT 'pos-open': the drain deliberately holds an open cart's implicit
		// updates, and these tests are about what happens once a push runs.
		status: 'processing',
		total: '10.00',
		customerId: 0,
		payload: { id: 900, status: 'processing' },
		sync: { revision: 'sha256:client-held', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

/** A leader tab and a follower tab wired to one channel, as apps/main wires them. */
function twoTabs(fetch: (url: string, init?: RequestInit) => Promise<Response>) {
	const openChannel = channelWorld();
	const leaderBridge = createWriteOutcomeBridge({ openChannel });
	const followerBridge = createWriteOutcomeBridge({ openChannel });
	leaderBridge.moveTo(CHANNEL);
	followerBridge.moveTo(CHANNEL);
	const tab = (owner: () => boolean, bridge: ReturnType<typeof createWriteOutcomeBridge>) =>
		createEngineHarness({
			site: SITE,
			identity: freshIdentity(),
			mode: 'manual',
			fetch,
			routes: { '/changes/config-fingerprint': { fingerprints: {} } },
			ports: { writePlaneOwner: owner, writeOutcomeBridge: bridge },
			awaitReady: false,
		});
	let leaderOwns = true;
	const leader = tab(() => leaderOwns, leaderBridge);
	const follower = tab(() => false, followerBridge);
	return {
		leader,
		follower,
		/** The leader tab was a follower when it enqueued (no coalesce), then took
		 * the write plane — the only way a create→delete pair survives to be
		 * cancelled by the LEADER-side drain (#1059). */
		setLeaderOwns: (owns: boolean) => {
			leaderOwns = owns;
		},
		dispose: async () => {
			leaderBridge.close();
			followerBridge.close();
			await leader.dispose();
			await follower.dispose();
		},
	};
}

const outcomesFor = (events: readonly EngineEvent[], mutationId: string) =>
	events.filter((event) => 'mutationId' in event && event.mutationId === mutationId);

describe('cross-tab write outcomes (#1209)', () => {
	it('delivers a REFUSED delete to the follower, reason intact — #866 becomes reachable off-leader', async () => {
		const server = createFakeWriteServer();
		server.seed(ORDER_ID, { id: 900, revision: 'sha256:client-held', collection: 'orders' });
		server.script(() => ({ kind: 'cannot_delete' }));
		const tabs = twoTabs(server.fetch);
		try {
			await insertServerOrder(tabs.leader.engine);
			const receipt = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'delete',
				recordId: ORDER_ID,
			});
			await tabs.leader.engine.sync('write-drain');

			const heard = outcomesFor(tabs.follower.events, receipt.mutationId);
			expect(heard).toHaveLength(1);
			// void.tsx's `isCannotDelete` keys on exactly this reason to run the
			// pending fallback, so the reason — not just the failure — must cross.
			expect(heard[0]).toMatchObject({
				type: 'write-rejected',
				collection: 'orders',
				recordId: ORDER_ID,
				mutationId: receipt.mutationId,
				status: 403,
				reason: 'woocommerce_rest_cannot_delete',
			});
		} finally {
			await tabs.dispose();
		}
	});

	it('delivers an ACK to the follower exactly once', async () => {
		const server = createFakeWriteServer();
		server.seed(ORDER_ID, { id: 900, revision: 'sha256:client-held', collection: 'orders' });
		const tabs = twoTabs(server.fetch);
		try {
			await insertServerOrder(tabs.leader.engine);
			const receipt = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});
			await tabs.leader.engine.sync('write-drain');

			expect(outcomesFor(tabs.follower.events, receipt.mutationId)).toEqual([
				expect.objectContaining({ type: 'write-acknowledged', mutationId: receipt.mutationId }),
			]);
			// The leader's own subscribers still see it once — the bridge adds a
			// peer copy, it does not double the local one.
			expect(outcomesFor(tabs.leader.events, receipt.mutationId)).toHaveLength(1);
		} finally {
			await tabs.dispose();
		}
	});

	it('composes with #1204: a 409 that auto-recovers reaches the follower as ONE success', async () => {
		const server = createFakeWriteServer();
		// The server moved on without the client — the #1204 wedge, whose 409
		// carries the revision the retry re-anchors to.
		server.seed(ORDER_ID, { id: 900, revision: 'sha256:server-moved', collection: 'orders' });
		const tabs = twoTabs(server.fetch);
		try {
			await insertServerOrder(tabs.leader.engine); // resident holds the STALE revision
			const receipt = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});
			await tabs.leader.engine.sync('write-drain');

			const heard = outcomesFor(tabs.follower.events, receipt.mutationId);
			expect(heard).toEqual([
				expect.objectContaining({ type: 'write-acknowledged', mutationId: receipt.mutationId }),
			]);
			// The intermediate conflict is NOT an outcome — a follower that saw it
			// would show the cashier a failure for a sale that saved.
			expect(heard.some((event) => event.type === 'write-conflict')).toBe(false);
			expect(server.received).toHaveLength(2); // stale attempt, then re-anchored
		} finally {
			await tabs.dispose();
		}
	});

	it('tells the follower when the LEADER cancels its never-pushed create+void (#1059)', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('an annihilated chain must never reach the write transport');
		});
		const tabs = twoTabs(fetch as never);
		try {
			await tabs.leader.engine.ready;
			tabs.setLeaderOwns(false);
			await tabs.leader.engine.active()!.database.collections.orders.insert({
				uuid: ORDER_ID,
				remoteId: null,
				number: '',
				dateCreatedGmt: '2026-08-14T00:00:00',
				status: 'pos-open',
				total: '5.00',
				customerId: 0,
				payload: { status: 'pos-open' },
				sync: { revision: '', partial: true, source: 'local' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			// Fresh-appended, as a follower's writes are (no coalesce) — the pair is
			// cancelled by the LEADER at drain, where the follower cannot see it.
			const created = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: ORDER_ID,
				payload: { status: 'pos-open' },
			});
			const voided = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'delete',
				recordId: ORDER_ID,
			});
			tabs.setLeaderOwns(true);
			await tabs.leader.engine.sync('write-drain');

			// Without this the follower's void watch times out twice (15s, then
			// 120s) and its fallback never runs — the order looks stuck.
			for (const mutationId of [created.mutationId, voided.mutationId]) {
				expect(outcomesFor(tabs.follower.events, mutationId)).toEqual([
					expect.objectContaining({ type: 'write-annihilated', mutationId }),
				]);
			}
		} finally {
			await tabs.dispose();
		}
	});

	it('leaves the follower a reader: it never drains, resolves, or touches the transport', async () => {
		const server = createFakeWriteServer();
		server.seed(ORDER_ID, { id: 900, revision: 'sha256:client-held', collection: 'orders' });
		const tabs = twoTabs(server.fetch);
		try {
			await insertServerOrder(tabs.leader.engine);
			await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});
			await tabs.leader.engine.sync('write-drain');

			// The bridge is feedback plumbing: receiving an outcome must not promote
			// the follower into a writer.
			await expect(tabs.follower.engine.sync('write-drain')).resolves.toMatchObject({
				pushed: 0,
			});
			await expect(
				tabs.follower.engine.resolveConflict('anything', 'discard')
			).rejects.toMatchObject({ name: 'WritePlaneFollowerError' });
			expect(server.received).toHaveLength(1);
		} finally {
			await tabs.dispose();
		}
	});

	it('stops delivering to a disposed engine', async () => {
		const server = createFakeWriteServer();
		server.seed(ORDER_ID, { id: 900, revision: 'sha256:client-held', collection: 'orders' });
		const tabs = twoTabs(server.fetch);
		try {
			await insertServerOrder(tabs.leader.engine);
			await tabs.follower.engine.ready;
			await tabs.follower.dispose(); // the tab closed
			const receipt = await tabs.leader.engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});
			await tabs.leader.engine.sync('write-drain');

			expect(outcomesFor(tabs.follower.events, receipt.mutationId)).toEqual([]);
		} finally {
			await tabs.dispose();
		}
	});
});
