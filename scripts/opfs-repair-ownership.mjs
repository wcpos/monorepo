// Three refresh intervals: a closed/frozen tab or lost revocation expires on its own.
const OWNERSHIP_LEASE_TTL_MS = 3000;
const REVOCATION_DRAIN_MS = 2000; // A wedged queue must not block the ack forever.

export function createRepairOwnership({ channelName }) {
	let owned = new Set();
	let lastOwnershipAt = 0;
	const instances = new Map();
	const channel =
		channelName && typeof BroadcastChannel !== 'undefined'
			? new BroadcastChannel(channelName)
			: undefined;
	if (channel) {
		// Node's BroadcastChannel holds the event loop open; browsers have no unref.
		channel.unref?.();
		channel.onmessage = async ({ data }) => {
			if (
				data?.type === 'ownership' &&
				Array.isArray(data.owned) &&
				data.owned.every((name) => typeof name === 'string')
			) {
				const revoked = [...owned].filter((name) => !data.owned.includes(name));
				owned = new Set(data.owned);
				lastOwnershipAt = Date.now();
				const draining = revoked.flatMap((name) => [...(instances.get(name) ?? [])]);
				if (draining.length) {
					let timer;
					await Promise.race([
						Promise.allSettled(draining.map((instance) => instance.taskQueue.awaitIdle())),
						new Promise((resolve) => {
							timer = setTimeout(resolve, REVOCATION_DRAIN_MS);
						}),
					]);
					clearTimeout(timer);
				}
				channel.postMessage({ type: 'ownership-ack', seq: data.seq });
			}
		};
		channel.postMessage({ type: 'hello' });
	}
	return {
		ownsRepairs: (params) =>
			!params.multiInstance ||
			(owned.has(params.databaseName) && Date.now() - lastOwnershipAt < OWNERSHIP_LEASE_TTL_MS),
		onInstance(instance, params) {
			const live = instances.get(params.databaseName) ?? new Set();
			live.add(instance);
			instances.set(params.databaseName, live);
			const close = instance.close.bind(instance);
			instance.close = async (...args) => {
				try {
					return await close(...args);
				} finally {
					live.delete(instance);
					if (!live.size) instances.delete(params.databaseName);
				}
			};
		},
		close: () => channel?.close(),
	};
}
