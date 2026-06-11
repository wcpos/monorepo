import { describe, expect, it } from 'vitest';

import { buildSweepCandidates, sweepForPrinters } from '../network-sweep';

describe('buildSweepCandidates', () => {
	it('includes localhost and recognizable common LAN printer addresses by default', () => {
		const hosts = buildSweepCandidates();
		expect(hosts).toEqual(
			expect.arrayContaining([
				'localhost',
				'printer.local',
				'epson.local',
				'star.local',
				'192.168.0.100',
				'192.168.1.100',
				'10.0.0.100',
				'172.16.0.100',
			])
		);
		expect(hosts.length).toBeLessThan(100);
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
		const hosts = buildSweepCandidates({ subnetBase: 'not-a-subnet' });
		expect(hosts).toContain('localhost');
		expect(hosts).not.toContain('not-a-subnet.1');
	});

	it('ignores subnet bases with out-of-range octets', () => {
		const hosts = buildSweepCandidates({ subnetBase: '999.168.1' });
		expect(hosts).toContain('localhost');
		expect(hosts).not.toContain('999.168.1.1');
	});
});

const epsonHttp = { vendor: 'epson', port: 8008, protocol: 'http' } as const;
const starHttps = { vendor: 'star', port: 443, protocol: 'https' } as const;

describe('sweepForPrinters', () => {
	// Regression: results used to claim raw TCP port 9100, which browsers cannot
	// reach — the discovered port must be the web endpoint that actually answered.
	it('returns a DiscoveredPrinter with the probed web endpoint port', async () => {
		const probe = async (host: string) => (host === 'localhost' ? epsonHttp : null);
		const result = await sweepForPrinters({ hosts: ['localhost', '10.0.0.5'], probe });
		expect(result).toEqual([
			{
				id: 'localhost:8008',
				name: 'Epson printer (localhost)',
				connectionType: 'network',
				address: 'localhost',
				port: 8008,
				vendor: 'epson',
			},
		]);
	});

	it('reports the Star HTTPS port when that endpoint answered', async () => {
		const probe = async () => starHttps;
		const result = await sweepForPrinters({ hosts: ['192.168.1.50'], probe });
		expect(result).toEqual([
			expect.objectContaining({ id: '192.168.1.50:443', port: 443, vendor: 'star' }),
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
			return starHttps;
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
			host === 'fast' ? Promise.resolve(epsonHttp) : new Promise<typeof epsonHttp | null>(() => {}); // 'slow' never settles
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

	it('reports cumulative progress for every probed host', async () => {
		const probe = async () => null;
		const seen: [number, number][] = [];
		await sweepForPrinters({
			hosts: ['a', 'b', 'c'],
			probe,
			onProgress: (tested, total) => seen.push([tested, total]),
		});
		expect(seen.sort((a, b) => a[0] - b[0])).toEqual([
			[1, 3],
			[2, 3],
			[3, 3],
		]);
	});

	it('does not report progress for probes that never settle before abort', async () => {
		const controller = new AbortController();
		const probe = () => new Promise<typeof epsonHttp | null>(() => {}); // never settles
		const seen: number[] = [];
		const promise = sweepForPrinters({
			hosts: ['a', 'b'],
			probe,
			concurrency: 2,
			signal: controller.signal,
			onProgress: (tested) => seen.push(tested),
		});
		controller.abort();
		await promise;
		expect(seen).toEqual([]);
	});

	it('counts a probe that settles before abort but not one still in flight', async () => {
		const controller = new AbortController();
		const probe = (host: string) =>
			host === 'fast' ? Promise.resolve(null) : new Promise<typeof epsonHttp | null>(() => {}); // 'slow' never settles
		const seen: number[] = [];
		const promise = sweepForPrinters({
			hosts: ['fast', 'slow'],
			probe,
			concurrency: 2,
			signal: controller.signal,
			onProgress: (tested) => seen.push(tested),
		});
		// A macrotask fires after all microtasks drain, so 'fast' has settled and
		// reported by now while 'slow' is still in flight; only then do we abort.
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await promise;
		expect(seen).toEqual([1]); // 'fast' counted once; 'slow' never settled, so never counted
	});
});
