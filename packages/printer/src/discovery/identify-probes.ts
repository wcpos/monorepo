import { type IdentifyProbes } from './identify';
import { fetchStar, postEposFetch } from './identify-probes-fetch';
async function connectTcp(host: string, port: number, timeoutMs: number) {
	const TcpSocket = (await import('react-native-tcp-socket')).default;
	return new Promise<'open' | 'closed' | 'filtered'>((resolve) => {
		let settled = false;
		let socket: ReturnType<typeof TcpSocket.createConnection> | undefined;
		const finish = (state: 'open' | 'closed' | 'filtered') => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket?.destroy();
			resolve(state);
		};
		const timer = setTimeout(() => finish('filtered'), timeoutMs);
		try {
			socket = TcpSocket.createConnection({ host, port }, () => finish('open'));
			socket.on('error', () => finish('closed'));
		} catch {
			finish('closed');
		}
	});
}
export function createIdentifyProbes(): IdentifyProbes {
	return {
		// network-adapter.ts (native) writes raw bytes to the profile port whatever the vendor.
		printableLanes: new Set(['raw']),
		connectTcp,
		postEpos: postEposFetch,
		fetchStar,
	};
}
