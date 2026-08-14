import { describe, expect, it, vi } from 'vitest';

import {
	type BroadcastWriteOutcome,
	createWriteOutcomeBridge,
	parseWriteOutcomeEnvelope,
	type WriteOutcomeChannel,
	writeOutcomeChannelName,
} from './write-outcome-bridge';

/**
 * A faithful in-memory stand-in for `BroadcastChannel`: channels sharing a name
 * see each other's messages and NEVER their own. That no-echo rule is the one
 * the bridge leans on to stay loop-free, so a fake that echoed would make these
 * tests prove the wrong thing.
 */
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
			for (const peer of buses.get(this.name) ?? []) {
				if (peer !== this) peer.onmessage?.({ data });
			}
		}
		close(): void {
			buses.get(this.name)?.delete(this);
		}
	}
	return {
		open: (name: string): WriteOutcomeChannel => new FakeChannel(name),
		listenerCount: (name: string) => buses.get(name)?.size ?? 0,
	};
}

const rejected: BroadcastWriteOutcome = {
	type: 'write-rejected',
	collection: 'orders',
	recordId: 'order-A',
	mutationId: 'm1',
	status: 403,
	reason: 'woocommerce_rest_cannot_delete',
	serverMessage: 'Sorry, you are not allowed to delete this resource.',
};

describe('write-outcome bridge (#1209)', () => {
	it('carries an outcome from one instance to the other, and never back to the sender', () => {
		const world = channelWorld();
		const name = writeOutcomeChannelName('wcpos-store-1');
		const leader = createWriteOutcomeBridge({ openChannel: world.open });
		const follower = createWriteOutcomeBridge({ openChannel: world.open });
		leader.moveTo(name);
		follower.moveTo(name);
		const atLeader = vi.fn();
		const atFollower = vi.fn();
		leader.subscribe(atLeader);
		follower.subscribe(atFollower);

		leader.publish(rejected);

		// The verbatim event — `awaitWriteOutcome` matches on mutationId alone and
		// void.tsx's fallback keys on `reason`, so both must survive the hop.
		expect(atFollower).toHaveBeenCalledWith(rejected);
		// No echo: the leader already emitted this locally, and re-emitting would
		// double every outcome in the tab that produced it.
		expect(atLeader).not.toHaveBeenCalled();
	});

	it('keeps two scopes apart', () => {
		const world = channelWorld();
		const storeOne = createWriteOutcomeBridge({ openChannel: world.open });
		const storeTwo = createWriteOutcomeBridge({ openChannel: world.open });
		storeOne.moveTo(writeOutcomeChannelName('wcpos-store-1'));
		storeTwo.moveTo(writeOutcomeChannelName('wcpos-store-2'));
		const heard = vi.fn();
		storeTwo.subscribe(heard);

		storeOne.publish(rejected);

		expect(heard).not.toHaveBeenCalled();
	});

	it('follows a scope switch without losing its subscribers', () => {
		const world = channelWorld();
		const moving = createWriteOutcomeBridge({ openChannel: world.open });
		const peerOnTwo = createWriteOutcomeBridge({ openChannel: world.open });
		moving.moveTo(writeOutcomeChannelName('wcpos-store-1'));
		const heard = vi.fn();
		moving.subscribe(heard); // subscribed BEFORE the move
		peerOnTwo.moveTo(writeOutcomeChannelName('wcpos-store-2'));

		moving.moveTo(writeOutcomeChannelName('wcpos-store-2'));
		peerOnTwo.publish(rejected);

		expect(heard).toHaveBeenCalledWith(rejected);
		// The old channel is released, not merely ignored — a tab left listening on
		// the previous store would hear outcomes for records it no longer holds.
		expect(world.listenerCount(writeOutcomeChannelName('wcpos-store-1'))).toBe(0);
	});

	it('goes quiet after close', () => {
		const world = channelWorld();
		const name = writeOutcomeChannelName('wcpos-store-1');
		const leader = createWriteOutcomeBridge({ openChannel: world.open });
		const follower = createWriteOutcomeBridge({ openChannel: world.open });
		leader.moveTo(name);
		follower.moveTo(name);
		const heard = vi.fn();
		follower.subscribe(heard);

		follower.close();
		leader.publish(rejected);

		expect(heard).not.toHaveBeenCalled();
		expect(world.listenerCount(name)).toBe(1);
	});

	it('is an inert no-op where no channel can be opened', () => {
		// react-native, jsdom, a sandboxed context: single-window by construction,
		// so publishing must be silent rather than throwing on a write path.
		const bridge = createWriteOutcomeBridge({ openChannel: () => null });
		bridge.moveTo('wcpos-write-outcomes:anything');
		const heard = vi.fn();
		bridge.subscribe(heard);
		expect(() => bridge.publish(rejected)).not.toThrow();
		expect(heard).not.toHaveBeenCalled();
	});

	it('survives a peer that throws, and a channel that refuses the post', () => {
		const world = channelWorld();
		const name = writeOutcomeChannelName('wcpos-store-1');
		const leader = createWriteOutcomeBridge({ openChannel: world.open });
		const follower = createWriteOutcomeBridge({ openChannel: world.open });
		leader.moveTo(name);
		follower.moveTo(name);
		const second = vi.fn();
		follower.subscribe(() => {
			throw new Error('a consumer blew up');
		});
		follower.subscribe(second);

		expect(() => leader.publish(rejected)).not.toThrow();
		expect(second).toHaveBeenCalledWith(rejected);

		const refusing = createWriteOutcomeBridge({
			openChannel: () => ({
				postMessage: () => {
					throw new Error('window is closing');
				},
				onmessage: null,
				close: () => undefined,
			}),
		});
		refusing.moveTo(name);
		// Feedback is best-effort: the local emit already happened and the write
		// itself is unaffected, so a dying channel must never surface as a write error.
		expect(() => refusing.publish(rejected)).not.toThrow();
	});

	describe('envelope validation', () => {
		it('accepts our own envelope', () => {
			expect(parseWriteOutcomeEnvelope({ wcpos: 'write-outcome', v: 1, event: rejected })).toEqual(
				rejected
			);
		});

		it.each([
			['a foreign message', { hello: 'world' }],
			['a primitive', 'write-rejected'],
			['null', null],
			['a future envelope version', { wcpos: 'write-outcome', v: 99, event: rejected }],
			[
				'an unknown outcome type',
				{
					wcpos: 'write-outcome',
					v: 1,
					event: { ...rejected, type: 'write-teleported' },
				},
			],
			[
				'a payload missing its mutationId',
				{ wcpos: 'write-outcome', v: 1, event: { ...rejected, mutationId: undefined } },
			],
		])('drops %s', (_label, data) => {
			expect(parseWriteOutcomeEnvelope(data)).toBeNull();
		});

		it('reports an unreadable peer message instead of emitting it', () => {
			const world = channelWorld();
			const name = writeOutcomeChannelName('wcpos-store-1');
			const onUnreadableMessage = vi.fn();
			const follower = createWriteOutcomeBridge({ openChannel: world.open, onUnreadableMessage });
			follower.moveTo(name);
			const heard = vi.fn();
			follower.subscribe(heard);
			// A tab running a build this one does not understand.
			world.open(name).postMessage({ wcpos: 'write-outcome', v: 99, event: rejected });

			expect(heard).not.toHaveBeenCalled();
			expect(onUnreadableMessage).toHaveBeenCalledTimes(1);
		});
	});
});
