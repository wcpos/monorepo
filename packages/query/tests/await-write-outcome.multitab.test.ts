import { createWriteOutcomeBridge } from '@wcpos/sync-engine';
import type { EngineEvent, RxdbSyncEngine, WriteOutcomeBridge } from '@wcpos/sync-engine';

import { awaitWriteOutcome, WriteOutcomeError } from '../src/await-write-outcome';

/**
 * #1209 from the CALLER's side: `awaitWriteOutcome` in a FOLLOWER tab.
 *
 * The engine-level proof (two engines, one channel) lives in
 * packages/sync-engine; this pins the half every consumer depends on — that a
 * bridged outcome settles the promise `void.tsx`, the orders-page delete and
 * save-to-server all await, with the same verdict the leader got. Before the
 * bridge these could only ever time out off-leader, which is why the refused
 * delete showed an optimistic "Order removed".
 */

const CHANNEL = 'wcpos-write-outcomes:test-scope';

/** BroadcastChannel semantics: same name sees each other, never itself. */
function channelWorld() {
	const buses = new Map<string, Set<FakeChannel>>();
	class FakeChannel {
		onmessage: ((event: { data: unknown }) => void) | null = null;
		constructor(readonly name: string) {
			const bus = buses.get(name) ?? new Set<FakeChannel>();
			bus.add(this);
			buses.set(name, bus);
		}
		postMessage(data: unknown): void {
			for (const peer of buses.get(this.name) ?? []) {
				if (peer !== this) peer.onmessage?.({ data });
			}
		}
		close(): void {
			buses.get(this.name)?.delete(this);
		}
	}
	return (name: string) => new FakeChannel(name);
}

/** A tab whose engine re-emits whatever the bridge hands it — the engine's own
 * wiring, reduced to the one behaviour this test is about. */
function followerTab(bridge: WriteOutcomeBridge) {
	const listeners = new Set<(event: EngineEvent) => void>();
	bridge.subscribe((event) => {
		for (const listener of [...listeners]) listener(event);
	});
	const engine = {
		events: (callback: (event: EngineEvent) => void) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
		// A follower's drain tick is a no-op (#1057) — that is the whole problem.
		sync: jest.fn().mockResolvedValue({ lane: 'write-drain', status: 'ran', pushed: 0 }),
	} as unknown as RxdbSyncEngine;
	return { engine };
}

describe('awaitWriteOutcome in a follower tab (#1209)', () => {
	const openChannel = channelWorld();

	function twoTabs() {
		const leader = createWriteOutcomeBridge({ openChannel });
		const followerBridge = createWriteOutcomeBridge({ openChannel });
		leader.moveTo(CHANNEL);
		followerBridge.moveTo(CHANNEL);
		return {
			leader,
			follower: followerTab(followerBridge),
			close: () => {
				leader.close();
				followerBridge.close();
			},
		};
	}

	it('settles with the leader refusal, so the #866 pending fallback runs off-leader', async () => {
		const { leader, follower, close } = twoTabs();
		try {
			const outcome = awaitWriteOutcome(follower.engine, 'mutation-1', {
				timeoutMs: 1_000,
			});
			leader.publish({
				type: 'write-rejected',
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-1',
				status: 403,
				reason: 'woocommerce_rest_cannot_delete',
			});

			// void.tsx branches on exactly this: a WriteOutcomeError whose reason is
			// `woocommerce_rest_cannot_delete` converts the order to `pending`. A
			// TIMEOUT — the pre-#1209 behaviour — is a plain Error and takes the
			// optimistic "Order removed" path instead.
			await expect(outcome).rejects.toMatchObject({
				name: 'WriteOutcomeError',
				eventType: 'write-rejected',
				status: 403,
				reason: 'woocommerce_rest_cannot_delete',
			});
			await expect(outcome).rejects.toBeInstanceOf(WriteOutcomeError);
		} finally {
			close();
		}
	});

	it('settles success for the leader ack', async () => {
		const { leader, follower, close } = twoTabs();
		try {
			const outcome = awaitWriteOutcome(follower.engine, 'mutation-2', {
				timeoutMs: 1_000,
			});
			leader.publish({
				type: 'write-acknowledged',
				collection: 'orders',
				recordId: 'order-2',
				mutationId: 'mutation-2',
				currentRevision: 'sha256:r2',
			});
			await expect(outcome).resolves.toBe('success');
		} finally {
			close();
		}
	});

	it('settles success-local when the leader cancels a never-pushed chain', async () => {
		const { leader, follower, close } = twoTabs();
		try {
			const outcome = awaitWriteOutcome(follower.engine, 'mutation-3', {
				timeoutMs: 1_000,
			});
			leader.publish({
				type: 'write-annihilated',
				collection: 'orders',
				recordId: 'order-3',
				mutationId: 'mutation-3',
			});
			await expect(outcome).resolves.toBe('success-local');
		} finally {
			close();
		}
	});

	it('ignores another mutation entirely', async () => {
		const { leader, follower, close } = twoTabs();
		try {
			const outcome = awaitWriteOutcome(follower.engine, 'mine', {
				timeoutMs: 50,
			});
			leader.publish({
				type: 'write-acknowledged',
				collection: 'orders',
				recordId: 'order-4',
				mutationId: 'someone-elses',
				currentRevision: 'sha256:r4',
			});
			await expect(outcome).rejects.toThrow(/Timed out/);
		} finally {
			close();
		}
	});
});
