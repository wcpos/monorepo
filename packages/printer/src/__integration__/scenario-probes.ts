// Electron's identify probes, pointed at a virtual printer instead of a real one.
//
// identify-probes.electron.ts talks to the Electron main process over IPC, and the ports it
// probes (443/8043/80/8008, 9100, 631) are hard-coded because real printers use them. These
// probes keep the same behaviour — the same DLE EOT status byte on raw, the same
// present/absent rule for WebPRNT — but map each real port onto the scenario's ephemeral one,
// so scenarios can run in parallel without root and without fighting over ports.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

import { type IdentifyProbes } from '../discovery/identify';

export interface VirtualPrinterPorts {
	raw: number;
	http: number | null;
	https: number | null;
	ipp: number | null;
}

/** Real-world port → the scenario's port. `null` means nothing is listening there. */
function mapPort(ports: VirtualPrinterPorts, port: number): number | null {
	if (port === 443 || port === 8043) return ports.https;
	if (port === 80 || port === 8008) return ports.http;
	if (port === 9100) return ports.raw;
	if (port === 631) return ports.ipp;
	return null;
}

export interface ScenarioTls {
	cert: string;
	fingerprint256: string;
}
/** Chain-verify against the scenario's own certificate and pin its fingerprint (it names no host). */
function tlsOptions(tls?: ScenarioTls): https.RequestOptions {
	if (!tls) return {};
	return {
		ca: tls.cert,
		checkServerIdentity: (_host, peer) =>
			peer.fingerprint256 === tls.fingerprint256
				? undefined
				: new Error('unexpected virtual printer certificate'),
	};
}
function request(
	secure: boolean,
	options: https.RequestOptions,
	body?: string,
	tls?: ScenarioTls
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		// Secure Printing presents a self-signed certificate: trust exactly that one (`ca`).
		const send = secure ? https.request : http.request;
		const req = send({ ...options, ...(secure ? tlsOptions(tls) : {}) }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () =>
				resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
			);
		});
		req.on('error', reject);
		req.on('timeout', () => req.destroy(new Error('timed out')));
		req.end(body);
	});
}

/**
 * @param ports the virtual printer's `ports`
 * @param touched every real-world port the probes actually opened a socket to
 */
export function createScenarioProbes(
	ports: VirtualPrinterPorts,
	touched: number[] = [],
	tls?: ScenarioTls
): IdentifyProbes & { touched: number[] } {
	const postEpos: IdentifyProbes['postEpos'] = async (host, port, path, xml, timeoutMs) => {
		const target = mapPort(ports, port);
		if (target === null) throw new Error(`connect ECONNREFUSED ${host}:${port}`);
		touched.push(port);
		const secure = port === 443 || port === 8043;
		return request(
			secure,
			{
				host: '127.0.0.1',
				port: target,
				path,
				method: 'POST',
				headers: { 'Content-Type': 'text/xml' },
				timeout: Math.max(1, timeoutMs),
			},
			xml,
			tls
		);
	};

	// identify-probes.electron.ts sends DLE EOT n (0x10 0x04 0x01) — three bytes that a
	// Secure-Printing Epson counts as a job. The scenario records the touch either way.
	const connectTcp: NonNullable<IdentifyProbes['connectTcp']> = async (_host, port, timeoutMs) => {
		const target = mapPort(ports, port);
		if (target === null) return 'closed';
		touched.push(port);
		return new Promise((resolve) => {
			const socket = net.connect(target, '127.0.0.1');
			socket.setTimeout(Math.max(1, timeoutMs));
			socket.on('connect', () => socket.end(Buffer.from([0x10, 0x04, 0x01])));
			socket.on('timeout', () => {
				socket.destroy();
				resolve('filtered');
			});
			socket.on('error', (error) =>
				resolve(String(error).includes('ECONNREFUSED') ? 'closed' : 'error')
			);
			socket.on('close', (hadError) => resolve(hadError ? 'error' : 'open'));
		});
	};

	// probe-vendor.ts's Star branch: HTTPS first, then plain HTTP; 404 or 5xx means "not there".
	const fetchStar: IdentifyProbes['fetchStar'] = async () => {
		const path = '/StarWebPRNT/SendMessage';
		for (const [port, protocol] of [
			[ports.https, 'https'],
			[ports.http, 'http'],
		] as const) {
			if (port === null) continue;
			try {
				const { status } = await request(protocol === 'https', {
					host: '127.0.0.1',
					port,
					path,
					method: 'GET',
					timeout: 3_000,
				});
				if (status !== 404 && status < 500) return { port, protocol, status };
			} catch {
				// keep trying the next endpoint, exactly as probeVendorEndpoint does
			}
		}
		return null;
	};

	return {
		// network-adapter.electron.ts prints Epson over ePOS and every other vendor as raw TCP.
		printableLanes: new Set(['epos-print', 'raw'] as const),
		connectTcp,
		postEpos,
		fetchStar,
		touched,
	};
}
