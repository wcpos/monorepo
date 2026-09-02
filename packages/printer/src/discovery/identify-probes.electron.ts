import { postEposHttp } from '../transport/epson-epos-adapter.electron';
import { getIpc } from '../transport/ipc-print.electron';
import { type IdentifyProbes } from './identify';
import { fetchStar } from './identify-probes-fetch';
async function connectTcp(host: string, port: number, timeoutMs: number) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			getIpc().invoke('print-raw-tcp', { host, port, data: [0x10, 0x04, 0x01] }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
			}),
		]);
		return 'open' as const;
	} catch (error) {
		const message = String(error).toLowerCase();
		if (message.includes('econnrefused')) return 'closed' as const;
		if (message.includes('timed out')) return 'filtered' as const;
		return 'error' as const;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
export function createIdentifyProbes(): IdentifyProbes {
	return {
		// network-adapter.electron.ts prints Epson over ePOS and every other vendor as raw TCP.
		printableLanes: new Set(['epos-print', 'raw']),
		connectTcp,
		postEpos: postEposHttp,
		fetchStar,
	};
}
