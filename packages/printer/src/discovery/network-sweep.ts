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
