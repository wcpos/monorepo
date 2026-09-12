import { getLogger } from '@wcpos/utils/logger';

import type { RxDatabase, RxPlugin } from 'rxdb';

// Bounded so a dead worker cannot hang close.
const REVOCATION_ACK_TIMEOUT_MS = 250;
const storageLogger = getLogger(['wcpos', 'db', 'storage']);
let channelName: string;
let plugin: RxPlugin | undefined;

export function getRepairOwnershipChannelName(): string {
	return (channelName ??=
		'wcpos.repair-ownership:' +
		(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)));
}

export function createRepairOwnershipPlugin({ channelName }: { channelName: string }): RxPlugin {
	if (plugin) return plugin;
	const owned = new Map<string, Set<RxDatabase>>();
	let seq = 0;
	const pendingAcks = new Map<number, () => void>();
	const closed = new WeakSet<RxDatabase>();
	const channel =
		typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);
	// Node's BroadcastChannel holds the event loop open (jest, node:test); browsers have no unref.
	(channel as { unref?: () => void } | undefined)?.unref?.();
	const publish = () => {
		channel?.postMessage({ type: 'ownership', owned: [...owned.keys()], seq: ++seq });
		return seq;
	};
	if (channel)
		channel.onmessage = ({ data }) => {
			if (data?.type === 'hello') publish();
			if (data?.type === 'ownership-ack') pendingAcks.get(data.seq)?.();
		};
	plugin = {
		name: 'wcpos-repair-ownership',
		rxdb: true,
		prototypes: {},
		overwritable: {},
		hooks: {
			createRxDatabase: {
				after: ({ database }) => {
					if (!channel || !database.multiInstance) return;
					void Promise.resolve()
						.then(() => database.waitForLeadership())
						.then(() => {
							if (!closed.has(database)) {
								const leaders = owned.get(database.name) ?? new Set<RxDatabase>();
								leaders.add(database);
								owned.set(database.name, leaders);
								publish();
							}
						})
						.catch((error: unknown) =>
							storageLogger.warn(`Repair ownership failed: ${String(error)}`, {
								context: { databaseName: database.name },
							})
						);
				},
			},
			preCloseRxDatabase: {
				// RxDB awaits pre-close hooks despite their void return type.
				// eslint-disable-next-line @typescript-eslint/no-misused-promises
				before: async (database) => {
					if (!channel || !database.multiInstance) return;
					closed.add(database);
					const leaders = owned.get(database.name);
					leaders?.delete(database);
					if (!leaders?.size) owned.delete(database.name);
					const revokedSeq = publish();
					await new Promise<void>((resolve) => {
						const done = () => {
							clearTimeout(timer);
							pendingAcks.delete(revokedSeq);
							resolve();
						};
						const timer = setTimeout(done, REVOCATION_ACK_TIMEOUT_MS);
						pendingAcks.set(revokedSeq, done);
					});
				},
			},
		},
	};
	return plugin;
}
