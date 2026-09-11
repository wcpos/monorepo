export function createRepairOwnership({ channelName }) {
	let owned = new Set();
	const channel =
		channelName && typeof BroadcastChannel !== 'undefined'
			? new BroadcastChannel(channelName)
			: undefined;
	if (channel) {
		// Node's BroadcastChannel holds the event loop open; browsers have no unref.
		channel.unref?.();
		channel.onmessage = ({ data }) => {
			if (
				data?.type === 'ownership' &&
				Array.isArray(data.owned) &&
				data.owned.every((name) => typeof name === 'string')
			) {
				owned = new Set(data.owned);
			}
		};
		channel.postMessage({ type: 'hello' });
	}
	return {
		ownsRepairs: (params) => !params.multiInstance || owned.has(params.databaseName),
		close: () => channel?.close(),
	};
}
