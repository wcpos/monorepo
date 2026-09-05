import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DiscoveredPrinter } from '@wcpos/printer';

import { classifyPrinter, usePrinterSetupFlow } from './use-printer-setup-flow';

jest.mock('@wcpos/printer', () => ({
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
async function scan(printers: DiscoveredPrinter[]) {
	function Harness() {
		const [found, setFound] = React.useState<DiscoveredPrinter[]>([]);
		// Test harness: expose the hook result to the test body.
		// eslint-disable-next-line react-compiler/react-compiler
		flow = usePrinterSetupFlow({
			discovery: {
				printers: found,
				isScanning: false,
				error: null,
				stopScan,
				startScan: async () => {
					setFound(printers);
				},
			},
			printerService,
			persist,
			t: (key) => key,
			printerCount: 0,
		});
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
});
afterEach(() => {
	act(() => renderer?.unmount());
});

it('auto-tests one Epson, then saves its identified profile on confirmation', async () => {
	await scan([epson, epson]);
	expect(flow.state.phase).toBe('asking');
	expect(flow.state.found).toHaveLength(1);
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
it('auto-tests unsure raw printers and handles nothing coming out', async () => {
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
	expect(flow.state.phase).toBe('asking');
	await act(async () => {
		await flow.answer('none');
	});
	expect(flow.state.phase).toBe('trouble');
	expect(flow.state.failure).toBeUndefined();
});
