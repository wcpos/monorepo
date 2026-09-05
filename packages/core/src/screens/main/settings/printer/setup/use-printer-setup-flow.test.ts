import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DiscoveredPrinter, DiscoveryError } from '@wcpos/printer';

import { isWindowsPlatform } from '../dialog/connection/is-windows';
import { classifyPrinter, usePrinterSetupFlow } from './use-printer-setup-flow';

jest.mock('../dialog/connection/is-windows', () => ({ isWindowsPlatform: jest.fn(() => false) }));
jest.mock('@wcpos/printer', () => ({
	identifyModel: jest.requireActual('@wcpos/printer/discovery/identify-models').identifyModel,
	canPrintLane: (protocol: string) => ['epos-print', 'raw'].includes(protocol),
	createIdentifyProbes: () => ({}),
	identifyPrinter: jest.fn(),
	isPrinterConnectionError: () => false,
}));
const epson: DiscoveredPrinter = {
	id: 'epson',
	name: 'Epson',
	address: '192.168.1.10',
	connectionType: 'network',
	identity: {
		vendor: 'epson',
		columns: 48,
		ports: [],
		lane: { port: 443, protocol: 'epos-print', encrypted: true },
	},
};
let renderer: ReactTestRenderer;
let flow: ReturnType<typeof usePrinterSetupFlow>;
const printerService = { testPrint: jest.fn(async () => {}) };
const persist = jest.fn(async () => 'saved-id');
const stopScan = jest.fn();
const enumerateUsb = jest.fn<Promise<DiscoveredPrinter[]>, []>();
const enumerateSerial = jest.fn<Promise<DiscoveredPrinter[]>, []>();
const usb: DiscoveredPrinter = {
	id: 'usb-device',
	name: 'TM-m30III',
	address: 'usb:1208:3605:1:2',
	connectionType: 'usb',
	vendor: 'epson',
	nativeInterfaceType: 'USB',
};
let publishPrinters: (printers: DiscoveredPrinter[]) => void;
async function scan(printers: DiscoveredPrinter[], platform: 'electron' | 'web' = 'electron') {
	function Harness() {
		const [found, setFound] = React.useState<DiscoveredPrinter[]>([]);
		// Expose discovery updates to the test outside rendering.
		React.useEffect(() => {
			publishPrinters = setFound;
		}, []);
		const [error, setError] = React.useState<DiscoveryError | null>(null);
		// Test harness: expose the hook result to the test body.
		// eslint-disable-next-line react-compiler/react-compiler
		flow = usePrinterSetupFlow(
			{
				discovery: {
					printers: found,
					isScanning: false,
					error,
					connectUsbDevice: async () => {
						const devices = await enumerateUsb();
						setFound((prev) => [...prev, ...devices]);
					},
					connectSerialDevice: async () => {
						try {
							const devices = await enumerateSerial();
							setFound((prev) => [...prev, ...devices]);
						} catch {
							setError({ code: 'discovery-failed' });
						}
					},
					stopScan,
					startScan: async () => {
						setFound((prev) => [...prev, ...printers]);
					},
				},
				printerService,
				persist,
				t: (key) => key,
				printerCount: 0,
			},
			{ platform }
		);
		return null;
	}
	await act(async () => {
		renderer = create(React.createElement(Harness));
	});
	await act(async () => {
		await flow.start();
	});
}
beforeAll(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(isWindowsPlatform).mockReturnValue(false);
	enumerateUsb.mockResolvedValue([]);
	enumerateSerial.mockResolvedValue([]);
});
afterEach(() => {
	act(() => renderer?.unmount());
});

it('pre-selects one Epson, prints on request, then saves its identified profile', async () => {
	await scan([epson, epson]);
	expect(flow.state.phase).toBe('results');
	expect(flow.state.found).toHaveLength(1);
	expect(flow.state.selected?.address).toBe(epson.address);
	expect(printerService.testPrint).not.toHaveBeenCalled();
	await act(async () => {
		await flow.testPrint();
	});
	expect(flow.state.phase).toBe('asking');
	expect(printerService.testPrint).toHaveBeenCalledWith(
		expect.objectContaining({ port: 443, vendor: 'epson', columns: 48 }),
		{ openDrawer: false }
	);
	await act(async () => {
		await flow.answer('ok');
	});
	expect(flow.state.phase).toBe('saved');
	expect(persist).toHaveBeenCalledWith(
		expect.objectContaining({ port: 443, vendor: 'epson', columns: 48, isDefault: true })
	);
});
it('lists two printers and prints only the selected one', async () => {
	await scan([epson, { ...epson, id: 'second', address: '192.168.1.11' }]);
	expect(flow.state.phase).toBe('results');
	expect(printerService.testPrint).not.toHaveBeenCalled();
	let finish!: () => void;
	printerService.testPrint.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	act(() => {
		flow.select(epson);
		void flow.testPrint();
	});
	expect(flow.state.phase).toBe('printing');
	await act(async () => {
		finish();
	});
	expect(flow.state.phase).toBe('asking');
});
it('cycles a short ruler from 42 to 48 and prints a second page', async () => {
	await scan([{ ...epson, identity: { ...epson.identity!, columns: 42 } }]);
	await act(async () => {
		await flow.testPrint();
	});
	await act(async () => {
		await flow.answer('short');
	});
	expect(flow.state.columns).toBe(48);
	expect(flow.state.profileDraft.columns).toBe(48);
	expect(flow.state.testPages).toBe(2);
	expect(printerService.testPrint).toHaveBeenLastCalledWith(
		expect.objectContaining({ columns: 48 }),
		{ openDrawer: false }
	);
});
it('lists an office printer without testing it', async () => {
	const office = {
		...epson,
		identity: { vendor: null, lane: null, ports: [], notReceiptPrinter: true },
	};
	await scan([office]);
	expect(flow.state.phase).toBe('results');
	expect(classifyPrinter(flow.state.found[0])).toBe('notprinter');
	expect(printerService.testPrint).not.toHaveBeenCalled();
});
it('shows empty results when nothing is found', async () => {
	await scan([]);
	expect(flow.state.phase).toBe('results');
	expect(flow.state.found).toEqual([]);
	expect(printerService.testPrint).not.toHaveBeenCalled();
});
it('pre-selects unsure raw printers and handles nothing coming out', async () => {
	const raw: DiscoveredPrinter = {
		...epson,
		identity: {
			vendor: 'generic',
			ports: [],
			lane: { port: 9100, protocol: 'raw', encrypted: false },
		},
	};
	await scan([raw]);
	expect(classifyPrinter(raw)).toBe('unsure');
	expect(flow.state.selected?.address).toBe(raw.address);
	await act(async () => {
		await flow.testPrint();
	});
	expect(flow.state.phase).toBe('asking');
	await act(async () => {
		await flow.answer('none');
	});
	expect(flow.state.phase).toBe('trouble');
	expect(flow.state.failure).toBeUndefined();
});

it('lists network and USB together without auto-testing', async () => {
	enumerateUsb.mockResolvedValue([usb]);
	await scan([epson]);
	expect(flow.state.phase).toBe('results');
	expect(flow.state.found.map((p) => p.source).sort()).toEqual(['network', 'usb']);
	expect(printerService.testPrint).not.toHaveBeenCalled();
});
it('pre-selects a sole USB device using its model width and native hint', async () => {
	enumerateUsb.mockResolvedValue([usb]);
	await scan([]);
	expect(flow.state.phase).toBe('results');
	await act(async () => {
		await flow.testPrint();
	});
	expect(flow.state.phase).toBe('asking');
	expect(printerService.testPrint).toHaveBeenCalledWith(
		expect.objectContaining({
			connectionType: 'usb',
			address: 'usb:1208:3605:1:2',
			columns: 48,
			nativeInterfaceType: 'USB',
			vendor: 'epson',
		}),
		{ openDrawer: false }
	);
});
it.each([
	['bluetooth', 'serial:/dev/cu.Printer'],
	['system', 'winspool:Receipt'],
] as const)('pre-selects a sole %s printer by its device key', async (connectionType, address) => {
	jest.mocked(isWindowsPlatform).mockReturnValue(connectionType === 'system');
	const device = { id: address, name: 'Paired printer', address, connectionType };
	(connectionType === 'system' ? enumerateUsb : enumerateSerial).mockResolvedValue([device]);
	await scan([]);
	expect(flow.state.phase).toBe('results');
	expect(flow.state.selected?.source).toBe(connectionType);
	await act(async () => {
		await flow.testPrint();
	});
	expect(flow.state.phase).toBe('asking');
	if (connectionType === 'system') expect(enumerateSerial).not.toHaveBeenCalled();
	expect(printerService.testPrint).toHaveBeenCalledWith(
		expect.objectContaining({ connectionType, address, columns: 42 }),
		{ openDrawer: false }
	);
});
it.each(['usb', 'serial'])('keeps other results when %s enumeration fails', async (source) => {
	(source === 'usb' ? enumerateUsb : enumerateSerial).mockRejectedValueOnce(
		new Error('Unavailable')
	);
	await scan([epson, { ...epson, id: 'second', address: '192.168.1.11' }]);
	expect(flow.state.phase).toBe('results');
	expect(flow.state.found).toHaveLength(2);
	expect(printerService.testPrint).not.toHaveBeenCalled();
});

it('only scans the network on web without opening device pickers', async () => {
	await scan([], 'web');
	expect(flow.state.phase).toBe('results');
	expect(enumerateUsb).not.toHaveBeenCalled();
	expect(enumerateSerial).not.toHaveBeenCalled();
});
it('adopts a new web USB row after intervening discovery updates as the selected card', async () => {
	await scan([], 'web');
	await act(async () => flow.startUsbPicker());
	// A sweep update before the chooser resolves must not consume the pending picker.
	act(() => publishPrinters([{ ...epson, identity: undefined }]));
	expect(printerService.testPrint).not.toHaveBeenCalled();
	const device = { ...usb, address: 'webusb:device', vendor: 'generic' as const };
	await act(async () => publishPrinters([device]));
	expect(flow.state.phase).toBe('results');
	expect(flow.state.found.map((p) => p.address)).toContain('webusb:device');
	expect(flow.state.selected?.address).toBe('webusb:device');
	expect(classifyPrinter(device, 'web')).toBe('ready');
	await act(async () => {
		await flow.testPrint();
	});
	expect(flow.state.phase).toBe('asking');
	expect(printerService.testPrint).toHaveBeenCalledTimes(1);
	expect(printerService.testPrint).toHaveBeenCalledWith(
		expect.objectContaining({ address: 'webusb:device', connectionType: 'usb', vendor: 'epson' }),
		{ openDrawer: false }
	);
});
it.each([9100, 8123])('resolves an Epson web draft port from %s', async (port) => {
	await scan(
		[
			{
				...epson,
				identity: {
					...epson.identity!,
					lane: {
						port,
						protocol: 'epos-print',
						encrypted: false,
					},
				},
			},
		],
		'web'
	);
	expect(flow.state.profileDraft).toMatchObject({
		vendor: 'epson',
		language: 'esc-pos',
		port: port === 9100 ? 8008 : 8123,
	});
});
