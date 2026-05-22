import { describe, expect, it } from 'vitest';

import { buildSweepCandidates, sweepForPrinters } from '../network-sweep';

describe('buildSweepCandidates', () => {
	it('always includes localhost so the dev virtual printer is found without a flag', () => {
		expect(buildSweepCandidates()).toContain('localhost');
	});

	it('merges and de-duplicates extra hosts', () => {
		const hosts = buildSweepCandidates({ extraHosts: ['192.168.1.50', 'localhost'] });
		expect(hosts).toContain('192.168.1.50');
		expect(hosts.filter((h) => h === 'localhost')).toHaveLength(1);
	});

	it('expands a valid subnet base to .1–.254', () => {
		const hosts = buildSweepCandidates({ subnetBase: '192.168.1' });
		expect(hosts).toContain('192.168.1.1');
		expect(hosts).toContain('192.168.1.254');
		expect(hosts).not.toContain('192.168.1.255');
	});

	it('ignores an invalid subnet base', () => {
		expect(buildSweepCandidates({ subnetBase: 'not-a-subnet' })).toEqual(['localhost']);
	});
});

describe('sweepForPrinters', () => {
	it('returns a DiscoveredPrinter for each probed host that matches a vendor', async () => {
		const probe = async (host: string) => (host === 'localhost' ? 'epson' : null);
		const result = await sweepForPrinters({ hosts: ['localhost', '10.0.0.5'], probe });
		expect(result).toEqual([
			{
				id: 'localhost:9100',
				name: 'Epson printer (localhost)',
				connectionType: 'network',
				address: 'localhost',
				port: 9100,
				vendor: 'epson',
			},
		]);
	});

	it('treats a probe rejection as "no printer" rather than throwing', async () => {
		const probe = async () => {
			throw new Error('network down');
		};
		await expect(sweepForPrinters({ hosts: ['10.0.0.5'], probe })).resolves.toEqual([]);
	});

	it('does not probe when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;
		const probe = async () => {
			calls += 1;
			return 'star' as const;
		};
		const result = await sweepForPrinters({
			hosts: ['10.0.0.5'],
			probe,
			signal: controller.signal,
		});
		expect(calls).toBe(0);
		expect(result).toEqual([]);
	});

	it('resolves with an array instead of hanging when aborted mid-flight', async () => {
		const controller = new AbortController();
		const probe = (host: string) =>
			host === 'fast'
				? Promise.resolve('epson' as const)
				: new Promise<'epson' | 'star' | null>(() => {}); // 'slow' never settles
		const promise = sweepForPrinters({
			hosts: ['fast', 'slow'],
			probe,
			concurrency: 2,
			signal: controller.signal,
		});
		await Promise.resolve();
		controller.abort();
		await expect(promise).resolves.toBeInstanceOf(Array);
	});
});
