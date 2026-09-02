import { afterEach, describe, expect, it, vi } from 'vitest';

import { identifyPrinter } from '../identify';

import type { IdentifyProbes } from '../identify';

const EPOS_RESPONSE =
	'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="0" />';

function probes(overrides: Partial<IdentifyProbes> = {}): IdentifyProbes {
	return {
		connectTcp: async () => 'closed',
		postEpos: async () => {
			throw new Error('closed');
		},
		fetchStar: async () => null,
		...overrides,
	};
}

describe('identifyPrinter', () => {
	afterEach(() => vi.useRealTimers());

	it('prefers secure Epson ePOS over an open raw port', async () => {
		const identity = await identifyPrinter(
			'192.168.1.30',
			{ name: 'EPSON TM-m30III' },
			probes({
				connectTcp: async (_host, port) => (port === 9100 ? 'open' : 'closed'),
				postEpos: async (_host, port) => {
					if (port === 443) return { status: 200, body: EPOS_RESPONSE };
					throw new Error('closed');
				},
			})
		);

		expect(identity).toMatchObject({
			vendor: 'epson',
			model: 'TM-m30III',
			lane: { port: 443, protocol: 'epos-print', encrypted: true },
			securePrinting: true,
			columns: 48,
		});
		expect(identity.ports).toContainEqual(
			expect.objectContaining({ port: 443, state: 'open', protocol: 'epos-print' })
		);
		expect(identity.ports).toContainEqual({
			port: 80,
			state: 'closed',
			protocol: 'epos-print',
		});
	});

	it('records refused and timed-out ePOS candidates before the successful lane', async () => {
		const identity = await identifyPrinter(
			'192.168.1.30',
			{},
			probes({
				postEpos: async (_host, port) => {
					if (port === 443) throw new Error('ECONNREFUSED');
					if (port === 8043) throw new Error('timed out');
					if (port === 80) return { status: 200, body: EPOS_RESPONSE };
					throw new Error('closed');
				},
			})
		);

		expect(identity.ports).toEqual(
			expect.arrayContaining([
				{ port: 443, state: 'closed', protocol: 'epos-print' },
				{ port: 8043, state: 'filtered', protocol: 'epos-print' },
				{ port: 80, state: 'open', protocol: 'epos-print' },
			])
		);
	});

	it('never touches raw 9100 when an ePOS lane answers (a raw touch quarantines a Secure Printing Epson)', async () => {
		const connectTcp = vi.fn(async () => 'open' as const);
		await identifyPrinter(
			'192.168.1.30',
			{ name: 'EPSON TM-m30III' },
			probes({
				connectTcp,
				postEpos: async (_host, port) => {
					if (port === 443) return { status: 200, body: EPOS_RESPONSE };
					throw new Error('closed');
				},
			})
		);

		expect(connectTcp).not.toHaveBeenCalled();
	});

	it('reports secure printing off when Epson ePOS answers on 443 and 80', async () => {
		const identity = await identifyPrinter(
			'192.168.1.31',
			{},
			probes({
				postEpos: async (_host, port) => {
					if (port === 443 || port === 80) return { status: 200, body: EPOS_RESPONSE };
					throw new Error('closed');
				},
			})
		);

		expect(identity.lane).toEqual({ port: 443, protocol: 'epos-print', encrypted: true });
		expect(identity.securePrinting).toBe(false);
		expect(identity.ports).toContainEqual({ port: 80, state: 'open', protocol: 'epos-print' });
	});

	it('uses a Star WebPRNT endpoint as the printing lane', async () => {
		const identity = await identifyPrinter(
			'192.168.1.32',
			{ name: 'Star TSP143' },
			probes({ fetchStar: async () => ({ port: 80, protocol: 'http' }) })
		);

		expect(identity).toMatchObject({
			vendor: 'star',
			model: 'TSP143',
			lane: { port: 80, protocol: 'webprnt', encrypted: false },
			columns: 48,
		});
	});

	it('marks an IPP-only host as not a receipt printer', async () => {
		const identity = await identifyPrinter(
			'192.168.1.33',
			{ name: 'Office Printer' },
			probes({ connectTcp: async (_host, port) => (port === 631 ? 'open' : 'closed') })
		);

		expect(identity.lane).toBeNull();
		expect(identity.notReceiptPrinter).toBe(true);
		expect(identity.ports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ port: 631, state: 'open', protocol: 'ipp' }),
			])
		);
	});

	it('uses raw 9100 for an otherwise generic printer', async () => {
		const identity = await identifyPrinter(
			'192.168.1.34',
			{},
			probes({ connectTcp: async (_host, port) => (port === 9100 ? 'open' : 'closed') })
		);

		expect(identity).toMatchObject({
			vendor: 'generic',
			lane: { port: 9100, protocol: 'raw', encrypted: false },
		});
		expect(identity.model).toBeUndefined();
		expect(identity.columns).toBeUndefined();
	});

	it('does not classify a fully filtered host as a non-receipt printer', async () => {
		const identity = await identifyPrinter(
			'192.168.1.35',
			{},
			probes({ connectTcp: async () => 'filtered' })
		);

		expect(identity.lane).toBeNull();
		expect(identity.notReceiptPrinter).toBe(false);
	});

	it('returns when the whole-host budget expires', async () => {
		vi.useFakeTimers();
		const never = () => new Promise<never>(() => undefined);
		const result = identifyPrinter(
			'192.168.1.36',
			{},
			probes({ connectTcp: never, postEpos: never, fetchStar: never }),
			{ timeoutMs: 4_000 }
		);

		await vi.advanceTimersByTimeAsync(4_000);
		await expect(result).resolves.toMatchObject({ lane: null, notReceiptPrinter: false });
	});
});
