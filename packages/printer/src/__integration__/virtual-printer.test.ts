// @vitest-environment node
// Integration bench: the real identify/print code against the virtual printer over real sockets
// on 127.0.0.1. Every assertion here is about what the app DECIDES, never about how it decides it.
// A merchant report ("nothing prints since I turned Secure Printing on") becomes a scenario name.
import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

// A plain .mjs dev tool: no build step, JSDoc types only — vitest and tsc both resolve it directly.
import { createVirtualPrinter } from '../../../virtual-printer/lib.mjs';
import { identifyPrinter } from '../discovery/identify';
import { EpsonEposAdapter } from '../transport/epson-epos-adapter';
import { StarWebPrntAdapter } from '../transport/star-webprnt-adapter';
import {
	createScenarioProbes,
	type ScenarioTls,
	type VirtualPrinterPorts,
} from './scenario-probes';

const { debug, info, warn } = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('../logger', () => ({ printerLogger: { debug, info, warn } }));

interface VirtualPrinter {
	ports: VirtualPrinterPorts;
	jobs: { lane: string; held: boolean; xml?: string; bytes?: Buffer; status?: number }[];
	events: { lane: string; path?: string }[];
	tls: ScenarioTls;
	close: () => Promise<void>;
}

const running: VirtualPrinter[] = [];
afterEach(async () => {
	await Promise.all(running.splice(0).map((printer) => printer.close()));
	debug.mockClear();
});

async function start(scenario: string): Promise<VirtualPrinter> {
	const printer: VirtualPrinter = await createVirtualPrinter({ scenario });
	running.push(printer);
	return printer;
}

/** Raw 9100 is what Electron and native send bytes on; there is no HTTP in this lane. */
async function sendRaw(port: number, bytes: number[]): Promise<void> {
	const socket = net.connect(port, '127.0.0.1');
	socket.on('error', () => {});
	await new Promise((resolve) => socket.on('connect', resolve));
	socket.end(Buffer.from(bytes));
	await new Promise((resolve) => socket.on('close', resolve));
}

describe('identify against the virtual printer', () => {
	it('default: picks the ePOS lane and records the status that decided it', async () => {
		const printer = await start('default');
		const probes = createScenarioProbes(printer.ports, [], printer.tls);

		const identity = await identifyPrinter('127.0.0.1', { name: 'Virtual WCPOS Printer' }, probes);

		expect(identity.vendor).toBe('epson');
		expect(identity.lane).toEqual({ port: 80, protocol: 'epos-print', encrypted: false });
		expect(identity.ports).toContainEqual({
			port: 80,
			state: 'open',
			protocol: 'epos-print',
			httpStatus: 200,
		});
	});

	it('secure-printing: TLS-only ePOS is flagged, and 9100 is never touched', async () => {
		const printer = await start('secure-printing');
		const probes = createScenarioProbes(printer.ports, [], printer.tls);

		const identity = await identifyPrinter('127.0.0.1', { name: 'EPSON TM-m30III' }, probes);

		expect(identity.securePrinting).toBe(true);
		expect(identity.lane).toEqual({ port: 443, protocol: 'epos-print', encrypted: true });
		// The whole point of #1597: a raw touch quarantines every lane for minutes.
		expect(probes.touched).not.toContain(9100);
		expect(printer.events.filter((event) => event.lane === 'raw')).toEqual([]);
	});

	it('held-503: the endpoint is found even though every job is refused', async () => {
		const printer = await start('held-503');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'EPSON TM-T88VII' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		// A held printer answers 503 to everything: no ePOS lane, but the 503 is on the port row,
		// which is the signature the setup flow turns into "The printer is holding jobs".
		expect(identity.lane?.protocol).not.toBe('epos-print');
		expect(
			identity.ports.some((port) => port.protocol === 'epos-print' && port.httpStatus === 503)
		).toBe(true);
		await expect(
			new EpsonEposAdapter('127.0.0.1', printer.ports.http!).printRaw(Uint8Array.from([0x1b, 0x40]))
		).rejects.toThrow(/HTTP 503/);
		expect(printer.jobs.at(-1)).toMatchObject({ lane: 'http', status: 503, held: true });
	});

	it('epos-off: falls back to the raw lane', async () => {
		const printer = await start('epos-off');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'Receipt Printer' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		expect(identity.lane).toEqual({ port: 9100, protocol: 'raw', encrypted: false });
		// The port answered (404: ePOS off) but never became a lane; the status row is kept for the report.
		expect(
			identity.ports.some(
				(port) =>
					port.protocol === 'epos-print' && port.state === 'open' && (port.httpStatus ?? 200) < 300
			)
		).toBe(false);
	});

	it('star-only: picks the WebPRNT lane', async () => {
		const printer = await start('star-only');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'Star TSP143' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		expect(identity.vendor).toBe('star');
		expect(identity.lane).toMatchObject({ port: printer.ports.http, protocol: 'webprnt' });
	});

	it('starprnt-raw-only: no web endpoints at all, raw wins', async () => {
		const printer = await start('starprnt-raw-only');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'Star TSP100' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		expect(identity.vendor).toBe('star');
		expect(identity.lane).toEqual({ port: 9100, protocol: 'raw', encrypted: false });
	});

	it('epos-device: a socket.io banner on the ePOS path is rejected', async () => {
		const printer = await start('epos-device');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'TM-DT Box' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		// The port answered (404: ePOS off) but never became a lane; the status row is kept for the report.
		expect(
			identity.ports.some(
				(port) =>
					port.protocol === 'epos-print' && port.state === 'open' && (port.httpStatus ?? 200) < 300
			)
		).toBe(false);
		expect(identity.lane?.protocol).not.toBe('epos-print');
		expect(info).toHaveBeenCalledWith(
			'ePOS endpoint rejected',
			expect.objectContaining({
				context: expect.objectContaining({ reason: expect.stringContaining('ePOS') }),
			})
		);
	});

	it('office-printer: IPP and a web UI are not a receipt printer', async () => {
		const printer = await start('office-printer');

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'HP OfficeJet Pro 9015' },
			createScenarioProbes(printer.ports, [], printer.tls)
		);

		expect(identity.lane).toBeNull();
		expect(identity.notReceiptPrinter).toBe(true);
		expect(identity.ports).toContainEqual({ port: 631, state: 'open', protocol: 'ipp' });
	});

	it('slow: every answer arrives late and identify still finishes on its own deadline', async () => {
		const printer = await start('slow');
		const startedAt = Date.now();

		const identity = await identifyPrinter(
			'127.0.0.1',
			{ name: 'Slow Printer' },
			createScenarioProbes(printer.ports, [], printer.tls),
			{ timeoutMs: 4_000 }
		);

		expect(Date.now() - startedAt).toBeLessThan(6_000);
		expect(identity.lane?.protocol).toBe('epos-print');
	}, 15_000);
});

describe('printing against the virtual printer', () => {
	it('the ePOS adapter posts XML the printer records as a job', async () => {
		const printer = await start('default');

		await new EpsonEposAdapter('127.0.0.1', printer.ports.http!).printRaw(
			Uint8Array.from([0x1b, 0x40, 0x1d, 0x56, 0x00])
		);

		expect(printer.jobs).toHaveLength(1);
		expect(printer.jobs[0]).toMatchObject({ lane: 'http', status: 200, held: false });
		expect(printer.jobs[0].xml).toContain('<command>1b401d5600</command>');
	});

	it('the WebPRNT adapter posts a Star envelope the printer records as a job', async () => {
		const printer = await start('star-only');
		const url = `http://127.0.0.1:${printer.ports.http}/StarWebPRNT/SendMessage`;

		await new StarWebPrntAdapter(url).printRaw(Uint8Array.from([0x1b, 0x40]));

		expect(printer.jobs[0]).toMatchObject({ lane: 'http', status: 200 });
		expect(printer.jobs[0].xml).toContain('<rawData>');
	});

	it('a raw TCP send lands in jobs', async () => {
		const printer = await start('epos-off');

		await sendRaw(printer.ports.raw, [0x1b, 0x40, 0x1d, 0x56, 0x00]);

		expect(printer.jobs).toHaveLength(1);
		expect(printer.jobs[0]).toMatchObject({ lane: 'raw', held: false });
		expect(printer.jobs[0].bytes).toHaveLength(5);
	});

	it('secure-printing takes the raw bytes and holds them — nothing prints', async () => {
		const printer = await start('secure-printing');

		await sendRaw(printer.ports.raw, [0x1b, 0x40]);

		expect(printer.jobs[0]).toMatchObject({ lane: 'raw', held: true });
	});
});
