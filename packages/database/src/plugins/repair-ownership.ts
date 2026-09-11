import { getLogger } from '@wcpos/utils/logger';

import type { RxDatabase, RxPlugin } from 'rxdb';

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
	const owned = new Set<string>();
	const closed = new WeakSet<RxDatabase>();
	const channel =
		typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);
	// Node's BroadcastChannel holds the event loop open (jest, node:test); browsers have no unref.
	(channel as { unref?: () => void } | undefined)?.unref?.();
	const publish = () => channel?.postMessage({ type: 'ownership', owned: [...owned] });
	if (channel)
		channel.onmessage = ({ data }) => {
			if (data?.type === 'hello') publish();
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
								owned.add(database.name);
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
				before: (database) => {
					if (!channel || !database.multiInstance) return;
					closed.add(database);
					owned.delete(database.name);
					publish();
				},
			},
		},
	};
	return plugin;
}
