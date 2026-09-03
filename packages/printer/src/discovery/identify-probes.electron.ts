import { postEposHttp } from '../transport/epson-epos-adapter.electron';
import { getIpc } from '../transport/ipc-print.electron';
import { type IdentifyProbes } from './identify';
import { fetchStar } from './identify-probes-fetch';

function rawProbeErrorState(error: unknown) {
	const message = String(error).toLowerCase();
	if (message.includes('econnrefused')) return 'closed' as const;
	if (message.includes('timed out')) return 'filtered' as const;
	return 'error' as const;
}

async function connectRaw(
	channel: 'print-raw-tcp' | 'print-raw-tls',
	host: string,
	port: number,
	data: number[],
	timeoutMs: number
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			getIpc().invoke(channel, { host, port, data }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
			}),
		]);
		return 'open' as const;
	} catch (error) {
		return rawProbeErrorState(error);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
const connectTcp = (host: string, port: number, timeoutMs: number) =>
	connectRaw('print-raw-tcp', host, port, [0x10, 0x04, 0x01], timeoutMs);
const connectTls = (host: string, port: number, timeoutMs: number) =>
	connectRaw('print-raw-tls', host, port, [], timeoutMs);

export function createIdentifyProbes(): IdentifyProbes {
	return {
		// Electron prints Epson over raw TLS/ePOS and every other vendor as raw TCP.
		printableLanes: new Set(['raw-tls', 'epos-print', 'raw']),
		connectTcp,
		connectTls,
		postEpos: postEposHttp,
		fetchStar,
	};
}
