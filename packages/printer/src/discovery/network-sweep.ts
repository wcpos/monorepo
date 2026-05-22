import PQueue from 'p-queue';

import type { DiscoveredPrinter } from '../types';

/** Signature of probeVendor — injected so the sweep is testable without network. */
export type ProbeVendorFn = (host: string) => Promise<'epson' | 'star' | null>;

export interface SweepCandidateOptions {
	/** First three octets, e.g. "192.168.1" — expands to .1–.254. */
	subnetBase?: string;
	/** Always-probed hosts (a manually entered IP, a `.local` name, etc.). */
	extraHosts?: string[];
}

// Loopback is always probed: in dev the virtual printer answers on localhost:8008,
// in production a user's own machine simply 404s (no match). No sim flag needed.
const ALWAYS_PROBE = ['localhost'];

export function buildSweepCandidates(options: SweepCandidateOptions = {}): string[] {
	const { subnetBase, extraHosts = [] } = options;
	const hosts = new Set<string>([...ALWAYS_PROBE, ...extraHosts]);
	if (subnetBase && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnetBase)) {
		for (let i = 1; i <= 254; i++) hosts.add(`${subnetBase}.${i}`);
	}
	return [...hosts];
}

export interface SweepOptions {
	hosts: string[];
	probe: ProbeVendorFn;
	concurrency?: number;
	signal?: AbortSignal;
}

export async function sweepForPrinters(options: SweepOptions): Promise<DiscoveredPrinter[]> {
	const { hosts, probe, concurrency = 16, signal } = options;
	const queue = new PQueue({ concurrency });
	const found = new Map<string, DiscoveredPrinter>();

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
				const vendor = await probe(host).catch(() => null);
				if (!vendor || signal?.aborted) return;
				const id = `${host}:9100`;
				if (!found.has(id)) {
					found.set(id, {
						id,
						name: `${vendor === 'epson' ? 'Epson' : 'Star'} printer (${host})`,
						connectionType: 'network',
						address: host,
						port: 9100,
						vendor,
					});
				}
			})
		)
	);

	await Promise.race([work, aborted]);
	return [...found.values()];
}
