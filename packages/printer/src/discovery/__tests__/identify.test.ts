import { afterEach, describe, expect, it, vi } from 'vitest';

import { identifyDiscoveredPrinters, identifyPrinter } from '../identify';

import type { IdentifyProbes } from '../identify';
import type { DiscoveredPrinter } from '../../types';

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../../logger', () => ({ printerLogger: { debug: vi.fn(), info } }));

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
		expect(info).toHaveBeenCalledWith('Printer identified', expect.any(Object));
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

	it('never touches raw 9100 on a printer named Epson even when no ePOS lane answers', async () => {
		// Seen live on a TM-m30III with Secure Printing on and ePOS-Print refusing (503): the only
		// lane left is raw, and a 3-byte touch there quarantines the printer for ~4 minutes.
		const connectTcp = vi.fn(async () => 'open' as const);
		const identity = await identifyPrinter(
			'192.168.1.30',
			{ name: 'EPSON TM-m30III' },
			probes({ connectTcp })
		);

		expect(connectTcp).not.toHaveBeenCalled();
		// Only ePOS candidates were tried and they refused; that says nothing about whether this
		// is a receipt printer, so the named-but-closed rule must not fire.
		expect(identity).toMatchObject({ vendor: 'epson', lane: null, notReceiptPrinter: false });
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

	it('recognises bare Epson model names and underscore-delimited serials', async () => {
		const identity = await identifyPrinter('192.168.1.34', { name: 'TM-m30III_055889' }, probes());

		expect(identity).toMatchObject({ vendor: 'epson', model: 'TM-m30III', columns: 48 });
	});

	it('uses a concrete name vendor when discovery reports generic', async () => {
		const connectTcp = vi.fn(async () => 'closed' as const);
		const identity = await identifyPrinter(
			'192.168.1.34',
			{ name: 'TM-m30III', vendor: 'generic' },
			probes({ connectTcp })
		);

		expect(identity).toMatchObject({ vendor: 'epson', model: 'TM-m30III', columns: 48 });
		expect(connectTcp).not.toHaveBeenCalled();
		expect(info).toHaveBeenLastCalledWith(
			'Printer identified',
			expect.objectContaining({ context: expect.objectContaining({ vendorSource: 'name' }) })
		);
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

describe('identifyDiscoveredPrinters', () => {
	const star: DiscoveredPrinter = {
		id: 'net-star',
		name: 'Star TSP143IV',
		connectionType: 'network',
		address: '192.168.1.40',
		port: 9100,
		vendor: 'generic',
	};
	const starProbes = (printableLanes?: ReadonlySet<'epos-print' | 'webprnt' | 'raw' | 'raw-tls'>) =>
		probes({
			fetchStar: async () => ({ port: 80, protocol: 'http' }),
			...(printableLanes ? { printableLanes } : {}),
		});

	it('keeps the discovered port when the platform cannot print on the identified lane', async () => {
		// Electron sends Star output as raw TCP (network-adapter.electron.ts), so WebPRNT on 80 is
		// diagnostic only: the profile must keep 9100 or the receipt bytes go to an HTTP server.
		const [identified] = await identifyDiscoveredPrinters(
			[star],
			starProbes(new Set(['epos-print', 'raw']))
		);
		expect(identified).toMatchObject({
			port: 9100,
			vendor: 'star',
			identity: { lane: { port: 80, protocol: 'webprnt' } },
		});
	});

	it('adopts the identified lane port where the platform prints on it', async () => {
		const [identified] = await identifyDiscoveredPrinters(
			[star],
			starProbes(new Set(['epos-print', 'webprnt']))
		);
		expect(identified).toMatchObject({ port: 80, vendor: 'star' });
	});

	it('preserves an Epson discovery vendor when probes only fail', async () => {
		const [identified] = await identifyDiscoveredPrinters(
			[
				{
					id: 'epson-sdk',
					name: 'TM-m30III',
					connectionType: 'network',
					address: '192.168.1.41',
					vendor: 'epson',
				},
			],
			probes({ connectTcp: async (_host, port) => (port === 9100 ? 'open' : 'closed') })
		);

		expect(identified.vendor).toBe('epson');
		expect(info).toHaveBeenLastCalledWith(
			'Printer identified',
			expect.objectContaining({ context: expect.objectContaining({ vendorSource: 'discovery' }) })
		);
	});

	it('upgrades a generic discovery vendor when ePOS answers', async () => {
		const [identified] = await identifyDiscoveredPrinters(
			[{ ...star, id: 'generic', name: 'Printer', vendor: 'generic' }],
			probes({
				postEpos: async (_host, port) => {
					if (port === 80) return { status: 200, body: EPOS_RESPONSE };
					throw new Error('closed');
				},
			})
		);

		expect(identified.vendor).toBe('epson');
	});
});
