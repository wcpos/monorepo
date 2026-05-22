import { describe, expect, it } from 'vitest';

import { buildSweepCandidates } from '../network-sweep';

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
