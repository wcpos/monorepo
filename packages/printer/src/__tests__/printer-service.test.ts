import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleReceiptData } from '../encoder/__tests__/fixtures';
import { isVerboseDiagnostics, printerLogger } from '../logger';
import { PrinterService } from '../printer-service';

import type { PrinterProfile, PrinterTransport } from '../types';

vi.mock('../logger', () => ({
	isVerboseDiagnostics: vi.fn(() => false),
	printerLogger: { debug: vi.fn() },
}));

const {
	buildReceiptMarkupJobMock,
	buildThermalTemplateMarkupJobMock,
	encodeReceiptMock,
	encodeThermalTemplateForPrintMock,
} = vi.hoisted(() => ({
	buildReceiptMarkupJobMock: vi.fn(() => ({
		template: '<receipt><text>receipt</text></receipt>',
		data: { receipt: true },
		options: {},
	})),
	buildThermalTemplateMarkupJobMock: vi.fn(() =>
		Promise.resolve({
			template: '<receipt><image src="logo"/></receipt>',
			data: { template: true },
			options: { imageAssets: { logo: undefined }, barcodeImages: {}, barcodeMode: 'image' },
		})
	),
	encodeReceiptMock: vi.fn(() => new Uint8Array([1, 2, 3])),
	encodeThermalTemplateForPrintMock: vi.fn(() => Promise.resolve(new Uint8Array([4, 5, 6]))),
}));

const { epsonNativePrintRawMock, starNativePrintRawMock } = vi.hoisted(() => ({
	epsonNativePrintRawMock: vi.fn().mockResolvedValue(undefined),
	starNativePrintRawMock: vi.fn().mockResolvedValue(undefined),
}));

const { epsonNativeCtorMock, starNativeCtorMock } = vi.hoisted(() => ({
	epsonNativeCtorMock: vi.fn(),
	starNativeCtorMock: vi.fn(),
}));

vi.mock('../encoder/encode-receipt', () => ({
	buildReceiptMarkupJob: buildReceiptMarkupJobMock,
	encodeReceipt: encodeReceiptMock,
}));

vi.mock('../encoder/thermal-print', () => ({
	buildThermalTemplateMarkupJob: buildThermalTemplateMarkupJobMock,
	encodeThermalTemplateForPrint: encodeThermalTemplateForPrintMock,
}));

vi.mock('../transport/system-print-adapter', () => ({
	SystemPrintAdapter: class {
		printRaw = vi.fn().mockResolvedValue(undefined);
		printHtml = vi.fn().mockResolvedValue(undefined);
	},
}));

vi.mock('../transport/epson-native-adapter', () => ({
	EpsonNativeAdapter: class {
		constructor(...args: any[]) {
			epsonNativeCtorMock(...args);
		}

		name = 'epson-native';
		printRaw = epsonNativePrintRawMock;
		printHtml = vi.fn().mockResolvedValue(undefined);
		disconnect = vi.fn().mockResolvedValue(undefined);
	},
}));

vi.mock('../transport/star-native-adapter', () => ({
	StarNativeAdapter: class {
		constructor(...args: any[]) {
			starNativeCtorMock(...args);
		}

		name = 'star-native';
		printRaw = starNativePrintRawMock;
		printHtml = vi.fn().mockResolvedValue(undefined);
		disconnect = vi.fn().mockResolvedValue(undefined);
	},
}));

function networkProfile(overrides: Partial<PrinterProfile> = {}): PrinterProfile {
	return {
		id: 'markup-printer',
		name: 'Markup Printer',
		connectionType: 'network',
		vendor: 'epson',
		address: '127.0.0.1',
		port: 443,
		language: 'esc-pos',
		columns: 48,
		fullReceiptRaster: false,
		autoCut: true,
		autoOpenDrawer: false,
		isDefault: true,
		isBuiltIn: false,
		...overrides,
	};
}

function markupTransport() {
	return {
		name: 'markup',
		printRaw: vi.fn().mockResolvedValue(undefined),
		printHtml: vi.fn().mockResolvedValue(undefined),
		supportsMarkup: vi.fn(() => true),
		printMarkup: vi.fn().mockResolvedValue(undefined),
	};
}

describe('PrinterService', () => {
	it.each([
		{ size: 10, hexPreview: '00010203040506070809', truncated: false },
		{ size: 8192, hexPreview: 'ab'.repeat(8192), truncated: false },
		{ size: 9000, hexPreview: 'ab'.repeat(8192), truncated: true },
	])('captures the outgoing $size-byte raw job', async ({ size, hexPreview, truncated }) => {
		const service = new PrinterService();
		const transport = markupTransport();
		const data =
			size === 10
				? Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
				: new Uint8Array(size).fill(0xab);
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));
		vi.mocked(isVerboseDiagnostics).mockReturnValue(true);

		await service.printRaw(data, networkProfile());

		expect(transport.printRaw).toHaveBeenCalledExactlyOnceWith(data);
		expect(printerLogger.debug).toHaveBeenCalledWith('Raw job dispatched', {
			context: { transport: 'markup', bytes: size, hexPreview, truncated },
		});
	});

	it('omits reversible raw bytes outside verbose diagnostics', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));

		await service.printRaw(Uint8Array.from([0xde, 0xad]), networkProfile());

		expect(printerLogger.debug).toHaveBeenCalledWith('Raw job dispatched', {
			context: { transport: 'markup', bytes: 2 },
		});
	});

	beforeEach(() => {
		vi.mocked(isVerboseDiagnostics).mockReset().mockReturnValue(false);
		vi.mocked(printerLogger.debug).mockClear();
		encodeReceiptMock.mockClear();
		buildReceiptMarkupJobMock.mockClear();
		buildThermalTemplateMarkupJobMock.mockClear();
		encodeThermalTemplateForPrintMock.mockClear();
		epsonNativePrintRawMock.mockClear();
		starNativePrintRawMock.mockClear();
		epsonNativeCtorMock.mockClear();
		starNativeCtorMock.mockClear();
	});

	it('logs the markup dispatch the raw lane would have logged', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));

		await service.printReceipt(sampleReceiptData, networkProfile());

		expect(printerLogger.debug).toHaveBeenCalledWith('Markup job dispatched', {
			context: { transport: 'markup', kind: 'receipt', dataKeys: ['receipt'] },
		});
	});

	it('previews the serialised markup job in verbose diagnostics', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));
		vi.mocked(isVerboseDiagnostics).mockReturnValue(true);

		await service.printReceipt(sampleReceiptData, networkProfile());

		expect(printerLogger.debug).toHaveBeenCalledWith('Markup job dispatched', {
			context: {
				transport: 'markup',
				kind: 'receipt',
				dataKeys: ['receipt'],
				templatePreview: '<receipt><text>receipt</text></receipt>',
				truncated: false,
			},
		});
	});

	it('settles a queued job when the service is disposed while another job runs', async () => {
		const service = new PrinterService();
		let release!: () => void;
		const blocking = new Promise<void>((resolve) => {
			release = resolve;
		});
		const transport = { name: 'slow', printRaw: vi.fn(() => blocking) };
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));
		const first = service.printRaw(new Uint8Array([1]), networkProfile());
		const second = service.printRaw(new Uint8Array([2]), networkProfile());
		await vi.waitFor(() => expect(transport.printRaw).toHaveBeenCalledTimes(1));
		const disposed = service.dispose();
		await expect(second).rejects.toThrow('Printer service is closing');
		await expect(service.printRaw(new Uint8Array([3]), networkProfile())).rejects.toThrow(
			'Printer service is closing'
		);
		release();
		await expect(first).resolves.toBeUndefined();
		await disposed;
	});

	it('separates queue wait from transport time on every job', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));

		await service.printRaw(Uint8Array.from([0x1b, 0x40]), networkProfile());

		expect(printerLogger.debug).toHaveBeenCalledWith('Print job timing', {
			context: {
				kind: 'raw',
				outcome: 'ok',
				waitMs: expect.any(Number),
				transportMs: expect.any(Number),
			},
		});
	});

	it('reports a failed outcome on the timing line', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		transport.printRaw.mockRejectedValueOnce(new Error('printer offline'));
		Reflect.set(service, 'getTransport', vi.fn().mockResolvedValue(transport));

		await expect(service.printRaw(Uint8Array.from([0x1b]), networkProfile())).rejects.toThrow(
			'printer offline'
		);

		expect(printerLogger.debug).toHaveBeenCalledWith('Print job timing', {
			context: {
				kind: 'raw',
				outcome: 'failed',
				waitMs: expect.any(Number),
				transportMs: expect.any(Number),
			},
		});
	});

	it('uses markup for built-in receipts when supported', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		await service.printReceipt(sampleReceiptData, networkProfile());

		expect(transport.printMarkup).toHaveBeenCalledWith(
			buildReceiptMarkupJobMock.mock.results[0]?.value
		);
		expect(transport.printRaw).not.toHaveBeenCalled();
	});

	it('uses markup for standalone drawer kicks when supported', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		await service.openDrawer(networkProfile({ drawerConnector: 'pin5' }));

		expect(transport.printMarkup).toHaveBeenCalledWith(
			expect.objectContaining({
				template: '<receipt><drawer/></receipt>',
				options: expect.objectContaining({ drawerConnector: 'pin5' }),
			})
		);
		expect(transport.printRaw).not.toHaveBeenCalled();
	});

	it('uses prepared markup jobs for custom thermal templates when supported', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		await service.printThermalTemplateForPrint(
			sampleReceiptData,
			networkProfile(),
			'<receipt/>',
			576
		);

		expect(transport.printMarkup).toHaveBeenCalledWith(
			await buildThermalTemplateMarkupJobMock.mock.results[0]?.value
		);
		expect(transport.printRaw).not.toHaveBeenCalled();
	});

	it('uses markup for diagnostic test prints when supported', async () => {
		const service = new PrinterService();
		const transport = markupTransport();
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		await service.testPrint(networkProfile());

		expect(transport.printMarkup).toHaveBeenCalledWith(
			expect.objectContaining({ template: expect.stringContaining('Printer Diagnostic') })
		);
		expect(transport.printRaw).not.toHaveBeenCalled();
	});

	it('forwards decimals to encodeReceipt for default thermal printing', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};

		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			printerModel: 'epson-tm-t88vi',
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};

		await (service as any).printReceipt(sampleReceiptData, profile, undefined, 3);

		expect(encodeReceiptMock).toHaveBeenCalledWith(
			sampleReceiptData,
			expect.objectContaining({
				decimals: 3,
			})
		);
		expect(transport.printRaw).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
		expect(printerLogger.debug).toHaveBeenCalledWith('Raw job dispatched', {
			context: { transport: 'test', bytes: 3 },
		});
	});

	it('queues thermal asset preparation with printing so concurrent receipts keep order', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);
		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};
		let resolveFirst: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
		let resolveSecond: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
		encodeThermalTemplateForPrintMock
			.mockImplementationOnce(
				() => new Promise<Uint8Array<ArrayBuffer>>((resolve) => void (resolveFirst = resolve))
			)
			.mockImplementationOnce(
				() => new Promise<Uint8Array<ArrayBuffer>>((resolve) => void (resolveSecond = resolve))
			);

		const first = service.printThermalTemplateForPrint(
			sampleReceiptData,
			profile,
			'<receipt />',
			384
		);
		const second = service.printThermalTemplateForPrint(
			sampleReceiptData,
			profile,
			'<receipt />',
			384
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(encodeThermalTemplateForPrintMock).toHaveBeenCalledTimes(1);
		resolveFirst?.(new Uint8Array([1]));
		await first;
		expect(transport.printRaw).toHaveBeenNthCalledWith(1, new Uint8Array([1]));
		await Promise.resolve();
		await Promise.resolve();
		expect(encodeThermalTemplateForPrintMock).toHaveBeenCalledTimes(2);
		resolveSecond?.(new Uint8Array([2]));
		await second;
		expect(transport.printRaw).toHaveBeenNthCalledWith(2, new Uint8Array([2]));
		// One dispatch line per job, in job order — the timing lines interleave between them.
		expect(
			vi
				.mocked(printerLogger.debug)
				.mock.calls.filter(([message]) => message === 'Raw job dispatched')
		).toEqual([
			['Raw job dispatched', { context: { transport: 'test', bytes: 1 } }],
			['Raw job dispatched', { context: { transport: 'test', bytes: 1 } }],
		]);
	});

	it('forwards autoOpenDrawer to encodeThermalTemplateForPrint so the setting works for thermal templates', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: true,
			isDefault: true,
			isBuiltIn: false,
		};

		await service.printThermalTemplateForPrint(sampleReceiptData, profile, '<receipt />', 576);

		expect(encodeThermalTemplateForPrintMock).toHaveBeenCalledWith(
			expect.objectContaining({
				encodeOptions: expect.objectContaining({ openDrawer: true }),
			})
		);
	});

	it('uses ESC/POS real-time kick for drawer-only opens', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			drawerConnector: 'pin5',
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};

		await service.openDrawer(profile);

		expect(transport.printRaw).toHaveBeenCalledWith(
			Uint8Array.from([0x10, 0x14, 0x01, 0x01, 0x03]),
			{ cutPaper: false }
		);
		expect(printerLogger.debug).toHaveBeenCalledWith('Raw job dispatched', {
			context: { transport: 'test', bytes: 5 },
		});
	});

	it('uses ESC/POS real-time pin2 kick by default for drawer-only opens', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};

		await service.openDrawer(profile);

		expect(transport.printRaw).toHaveBeenCalledWith(
			Uint8Array.from([0x10, 0x14, 0x01, 0x00, 0x03]),
			{ cutPaper: false }
		);
	});

	it('preserves Star drawer-only opens through the language encoder pulse path', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'star',
			address: '127.0.0.1',
			port: 9100,
			language: 'star-line',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		} as PrinterProfile;

		await service.openDrawer(profile);

		expect(transport.printRaw).toHaveBeenCalledTimes(1);
		const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
		const raw = [...bytes];
		const starPulseIndex = raw.findIndex((byte, index) => byte === 0x1b && raw[index + 1] === 0x07);
		expect(starPulseIndex).toBeGreaterThanOrEqual(0);
		expect(transport.printRaw).toHaveBeenCalledWith(bytes, { cutPaper: false });
	});

	it('testPrint includes a drawer pulse when autoOpenDrawer is enabled', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: true,
			drawerConnector: 'pin2',
			isDefault: true,
			isBuiltIn: false,
		};

		await service.testPrint(profile);

		expect(transport.printRaw).toHaveBeenCalledTimes(1);
		const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
		const raw = [...bytes];
		const pulseIndex = raw.findIndex((byte, index) => byte === 0x1b && raw[index + 1] === 0x70);
		expect(pulseIndex).toBeGreaterThanOrEqual(0);
		expect(printerLogger.debug).toHaveBeenCalledWith('Raw job dispatched', {
			context: { transport: 'test', bytes: bytes.byteLength },
		});
	});

	it('testPrint can suppress the drawer pulse for save validation', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: true,
			drawerConnector: 'pin2',
			isDefault: true,
			isBuiltIn: false,
		};

		await service.testPrint(profile, { openDrawer: false });

		expect(transport.printRaw).toHaveBeenCalledTimes(1);
		const [bytes] = vi.mocked(transport.printRaw).mock.calls[0];
		const raw = [...bytes];
		const pulseIndex = raw.findIndex((byte, index) => byte === 0x1b && raw[index + 1] === 0x70);
		expect(pulseIndex).toBe(-1);
	});

	it('rejects order-based cloud providers before opening a drawer', async () => {
		const service = new PrinterService();
		const getTransport = vi.fn();
		(service as any).getTransport = getTransport;

		const profile: PrinterProfile = {
			id: 'cloud-1',
			name: 'Cloud Printer',
			connectionType: 'cloud',
			vendor: 'epson',
			port: 0,
			cloudPrinterId: 'cloud-printer-1',
			cloudProvider: 'epson-sdp',
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await expect(service.openDrawer(profile)).rejects.toThrow(
			'Open drawer is not supported for this printer profile'
		);
		expect(getTransport).not.toHaveBeenCalled();
	});

	it('rejects system profiles before opening a drawer', async () => {
		const service = new PrinterService();

		const profile: PrinterProfile = {
			id: 'system',
			name: 'System Printer',
			connectionType: 'system',
			vendor: 'generic',
			port: 0,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: false,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: true,
		};

		await expect(service.openDrawer(profile)).rejects.toThrow(
			'Open drawer is not supported for this printer profile'
		);
	});

	it('still opens the drawer for Star CloudPRNT, whose receipts are server-rendered', async () => {
		// Star is order-based for receipts but still accepts a raw drawer kick; a
		// standalone kick has no order or template for the server to render from.
		const service = new PrinterService();
		const transport = {
			name: 'cloud',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};
		const getTransport = vi.fn().mockResolvedValue(transport);
		(service as any).getTransport = getTransport;

		const profile: PrinterProfile = {
			id: 'cloud-2',
			name: 'Star Cloud Printer',
			connectionType: 'cloud',
			vendor: 'star',
			port: 0,
			cloudPrinterId: 'cloud-printer-2',
			cloudProvider: 'star-cloudprnt',
			language: 'star-prnt',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await service.openDrawer(profile);

		expect(getTransport).toHaveBeenCalled();
		expect(transport.printRaw).toHaveBeenCalled();
	});

	it('routes Epson bluetooth profiles through the native adapter', async () => {
		const service = new PrinterService();
		const profile: PrinterProfile = {
			id: 'epson-bt-1',
			name: 'Epson BT',
			connectionType: 'bluetooth',
			vendor: 'epson',
			address: '01:23:45:67:89:ab',
			port: 0,
			language: 'esc-pos',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await service.printRaw(new Uint8Array([0x1b, 0x40]), profile);

		expect(epsonNativePrintRawMock).toHaveBeenCalledWith(new Uint8Array([0x1b, 0x40]));
		expect(starNativePrintRawMock).not.toHaveBeenCalled();
	});

	it('routes Star USB profiles through the native adapter', async () => {
		const service = new PrinterService();
		const profile: PrinterProfile = {
			id: 'star-usb-1',
			name: 'Star USB',
			connectionType: 'usb',
			vendor: 'star',
			address: 'usb:printer-1',
			port: 0,
			language: 'star-prnt',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await service.printRaw(new Uint8Array([0x1b, 0x40]), profile);

		expect(starNativePrintRawMock).toHaveBeenCalledWith(new Uint8Array([0x1b, 0x40]));
		expect(epsonNativePrintRawMock).not.toHaveBeenCalled();
	});

	it('passes preserved Star native interface types into the native adapter', async () => {
		const service = new PrinterService();
		const profile = {
			id: 'star-ble-1',
			name: 'Star BLE',
			connectionType: 'bluetooth',
			vendor: 'star',
			address: '01:23:45:67:89:AB',
			port: 9100,
			language: 'star-prnt',
			columns: 48,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
			nativeInterfaceType: 'BluetoothLE',
		} as PrinterProfile & { nativeInterfaceType: string };

		await service.printRaw(new Uint8Array([0x1b, 0x40]), profile);

		expect(starNativeCtorMock).toHaveBeenCalledWith(
			'01:23:45:67:89:AB',
			'bluetooth',
			'BluetoothLE'
		);
	});
});
