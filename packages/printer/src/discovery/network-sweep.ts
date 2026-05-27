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

function buildCommonLanCandidates(): string[] {
	return COMMON_SUBNET_BASES.flatMap((base) =>
		COMMON_PRINTER_HOSTS.map((hostNumber) => `${base}.${hostNumber}`)
	);
}

export function buildSweepCandidates(options: SweepCandidateOptions = {}): string[] {
	const { subnetBase, extraHosts = [] } = options;
	const hosts = new Set<string>([
		...ALWAYS_PROBE,
		...COMMON_LOCAL_NAMES,
		...buildCommonLanCandidates(),
		...extraHosts,
	]);
	const subnetOctets = subnetBase?.split('.') ?? [];
	if (
		subnetOctets.length === 3 &&
		subnetOctets.every((octet) => {
			const value = Number(octet);
			return /^\d+$/.test(octet) && Number.isInteger(value) && value >= 0 && value <= 255;
		})
	) {
		for (let i = 1; i <= 254; i++) hosts.add(`${subnetBase}.${i}`);
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
	const { hosts, probe, concurrency = 16, signal, onProgress } = options;
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
				const vendor = await probe(host).catch(() => null);
				if (signal?.aborted) return;
				tested += 1;
				onProgress?.(tested, total);
				if (!vendor) return;
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
