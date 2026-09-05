import PQueue from 'p-queue';

import { withTargetAddressSpace } from '../utils/local-fetch';

import type { DiscoveredPrinter } from '../types';
import type { ProbedEndpoint } from '../utils/probe-vendor';

/** Signature of probeVendorEndpoint — injected so the sweep is testable without network. */
export type ProbeVendorFn = (host: string, timeoutMs?: number) => Promise<ProbedEndpoint | null>;

export interface SweepCandidateOptions {
	/** First three octets, e.g. "192.168.1" — expands to .1–.254. */
	subnetBase?: string;
	/** Detected /24 bases; expanded after common addresses for early matches. */
	subnetBases?: string[];
	/** Always-probed hosts (a manually entered IP, a `.local` name, etc.). */
	extraHosts?: string[];
}

// These are deliberate, recognizable addresses rather than a random LAN sweep.
// They cover the common home/office router ranges and printer-ish host numbers users
// can visually compare with the IP shown on their printer's network status page.
const ALWAYS_PROBE = ['localhost'];
const COMMON_LOCAL_NAMES = ['printer.local', 'epson.local', 'star.local'];
const COMMON_SUBNET_BASES = [
	'192.168.0',
	'192.168.1',
	'192.168.4',
	'192.168.10',
	'10.0.0',
	'10.0.1',
	'172.16.0',
];
const COMMON_PRINTER_HOSTS = [1, 2, 10, 20, 50, 100, 101, 200, 254];

// Gateway detection must not noticeably delay the first printer probes.
const GATEWAY_PROBE_TIMEOUT_MS = 1500;
// A fast rejection counts as live, so a network that refuses every gateway probe would sweep all
// seven /24s (~12 s each). Two live subnets cover dual-network offices without that blow-up.
const MAX_LIVE_SUBNETS = 2;
// 32 hosts per batch keeps a full /24 plus common addresses within ten batches.
const SWEEP_CONCURRENCY = 32;
// Ten batches at 1.5 seconds leave room for gateway detection within 20 seconds.
const SWEEP_PROBE_TIMEOUT_MS = 1500;

export type ProbeGatewayFn = (url: string, init: RequestInit) => Promise<Response>;

export async function detectLiveSubnets(
	probeGateway: ProbeGatewayFn = fetch,
	bases: string[] = COMMON_SUBNET_BASES,
	signal?: AbortSignal
): Promise<string[]> {
	if (signal?.aborted) return [];
	const live = await Promise.all(
		bases.map(async (base) => {
			const controller = new AbortController();
			const abort = () => controller.abort();
			const dead = new Promise<boolean>((resolve) => {
				controller.signal.addEventListener('abort', () => resolve(false), { once: true });
			});
			signal?.addEventListener('abort', abort, { once: true });
			const timer = setTimeout(abort, GATEWAY_PROBE_TIMEOUT_MS);
			try {
				const probes = [1, 254].map(async (host) => {
					const url = `http://${base}.${host}/`;
					try {
						await probeGateway(
							url,
							withTargetAddressSpace(url, {
								mode: 'no-cors',
								signal: controller.signal,
							})
						);
					} catch (error) {
						// Browsers hide refusal/CORS details: a fast rejection is a useful
						// liveness hint, like an opaque response. Only abort/timeout is dead.
						const name = error instanceof Error || error instanceof DOMException ? error.name : '';
						if (controller.signal.aborted || name === 'AbortError' || name === 'TimeoutError')
							throw error;
					}
					return true;
				});
				return await Promise.race([Promise.any(probes).catch(() => false), dead]);
			} finally {
				clearTimeout(timer);
				signal?.removeEventListener('abort', abort);
				controller.abort();
			}
		})
	);
	return signal?.aborted ? [] : bases.filter((_, index) => live[index]).slice(0, MAX_LIVE_SUBNETS);
}

function buildCommonLanCandidates(): string[] {
	return COMMON_SUBNET_BASES.flatMap((base) =>
		COMMON_PRINTER_HOSTS.map((hostNumber) => `${base}.${hostNumber}`)
	);
}

export function buildSweepCandidates(options: SweepCandidateOptions = {}): string[] {
	const { subnetBase, subnetBases = [], extraHosts = [] } = options;
	const hosts = new Set<string>([
		...ALWAYS_PROBE,
		...COMMON_LOCAL_NAMES,
		...buildCommonLanCandidates(),
		...extraHosts,
	]);
	for (const base of [...subnetBases, ...(subnetBase ? [subnetBase] : [])]) {
		const subnetOctets = base.split('.');
		if (
			subnetOctets.length === 3 &&
			subnetOctets.every((octet) => {
				const value = Number(octet);
				return /^\d+$/.test(octet) && Number.isInteger(value) && value >= 0 && value <= 255;
			})
		) {
			for (let i = 1; i <= 254; i++) hosts.add(`${base}.${i}`);
		}
	}
	return [...hosts];
}

export interface SweepOptions {
	hosts: string[];
	probe: ProbeVendorFn;
	concurrency?: number;
	signal?: AbortSignal;
	/** Fires after each host's probe settles, with the cumulative count of completed probes. */
	onProgress?: (tested: number, total: number) => void;
}

export async function sweepForPrinters(options: SweepOptions): Promise<DiscoveredPrinter[]> {
	const { hosts, probe, concurrency = SWEEP_CONCURRENCY, signal, onProgress } = options;
	const queue = new PQueue({ concurrency });
	const found = new Map<string, DiscoveredPrinter>();
	const total = hosts.length;
	let tested = 0;

	// `queue.clear()` drops queued tasks but their add()-promises never settle, so awaiting
	// Promise.all directly would hang on abort. Race the work against an abort promise instead
	// and return whatever was found so far.
	const aborted = new Promise<void>((resolve) => {
		if (!signal) return; // no signal → never resolves; the race falls through to `work`
		if (signal.aborted) {
			resolve();
			return;
		}
		signal.addEventListener(
			'abort',
			() => {
				queue.clear();
				resolve();
			},
			{ once: true }
		);
	});

	const work = Promise.all(
		hosts.map((host) =>
			queue.add(async () => {
				if (signal?.aborted) return;
				const endpoint = await probe(host, SWEEP_PROBE_TIMEOUT_MS).catch(() => null);
				if (signal?.aborted) return;
				tested += 1;
				onProgress?.(tested, total);
				if (!endpoint) return;
				// The probe succeeded over the vendor's web protocol, so report that
				// port — never raw TCP 9100, which browsers cannot reach.
				const id = `${host}:${endpoint.port}`;
				if (!found.has(id)) {
					found.set(id, {
						id,
						name: `${endpoint.vendor === 'epson' ? 'Epson' : 'Star'} printer (${host})`,
						connectionType: 'network',
						address: host,
						port: endpoint.port,
						vendor: endpoint.vendor,
					});
				}
			})
		)
	);

	await Promise.race([work, aborted]);
	return [...found.values()];
}
