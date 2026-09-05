import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PrinterSetupDialog } from './printer-setup-dialog';
import { createTestT } from '../../../../../../jest/translate';

jest.mock('react-native', () => ({
	ActivityIndicator: 'Spinner',
	Pressable: 'Pressable',
	View: 'View',
}));
jest.mock('@wcpos/components/button', () => ({ Button: 'Button' }));
jest.mock('@wcpos/components/text', () => ({ Text: 'Text' }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: 'Stack' }));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: 'Dialog',
	DialogBody: 'Body',
	DialogContent: 'Content',
	DialogHeader: 'Header',
	DialogTitle: 'Title',
}));
jest.mock('@wcpos/components/form', () => ({ Form: 'Form', FormField: () => null }));
jest.mock('@wcpos/components/select', () => ({ OptionSelect: 'Select' }));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: 'Collapsible',
	CollapsibleTrigger: 'Trigger',
	CollapsibleContent: 'Options',
}));
jest.mock('../dialog/connection/web-vendor-segmented', () => ({ WebVendorSegmented: () => null }));
jest.mock('../components/vendor-select', () => ({ VendorSelect: () => null }));
jest.mock('../dialog/printer-toggle-group', () => ({ PrinterToggleGroup: () => null }));
jest.mock('../dialog/test-print-error', () => ({ TestPrintError: () => null }));
jest.mock('../persist-printer-profile', () => ({ persistPrinterProfile: jest.fn() }));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: {} }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => createTestT() }));
let mockWebScanning = false;
const mockConnectUsb = jest.fn();
const mockTestPrint = jest.fn(async () => {});
const mockUsbPrinters: { id: string; name: string; address: string; connectionType: 'usb' }[] = [];
jest.mock('@wcpos/printer', () => ({
	isWebUsbSupported: () => true,
	isWebBluetoothSupported: () => true,
	PrinterService: class {
		testPrint = mockTestPrint;
		async dispose() {}
	},
	usePrinterDiscovery: function useDiscovery() {
		const [ble, setBle] = React.useState<
			{ id: string; name: string; address: string; connectionType: 'bluetooth' }[]
		>([]);
		const [isBluetoothScanning, setScanning] = React.useState(false);
		return {
			isBluetoothScanning: mockWebScanning ? undefined : isBluetoothScanning,
			connectUsbDevice: mockConnectUsb,
			scanProgress: { tested: 3, total: 20 },
			connectBluetoothDevice: () => setScanning(true),
			bluetoothCandidates: [{ id: 'ble', name: 'TM-P20' }],
			selectBluetoothCandidate: () => {
				setBle([
					{ id: 'ble', name: 'TM-P20', address: 'webbluetooth:ble', connectionType: 'bluetooth' },
				]);
				setScanning(false);
			},
			printers: [
				...mockUsbPrinters,
				...ble,
				{
					id: 'epson',
					name: 'Counter',
					address: '192.168.1.10',
					connectionType: 'network',
					identity: {
						vendor: 'epson',
						columns: 48,
						lane: { port: 443, protocol: 'epos-print' },
						ports: [],
					},
				},
			],
			isScanning: mockWebScanning,
			error: null,
			startScan: async () => {},
			stopScan: jest.fn(),
		};
	},
	identifyModel: jest.requireActual('@wcpos/printer/discovery/identify-models').identifyModel,
	canPrintLane: () => true,
	createIdentifyProbes: () => ({}),
	isPrinterConnectionError: () => false,
}));
it('renders the asking screen with all three answers and the test page footer', async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	let renderer!: ReactTestRenderer;
	await act(async () => {
		renderer = create(<PrinterSetupDialog open onOpenChange={jest.fn()} onSave={jest.fn()} />);
	});
	const t = createTestT();
	for (const key of ['setup_ok', 'setup_short', 'setup_nothing']) {
		const button = renderer.root.findByProps({ testID: `printer-setup-${key}` });
		expect(button.props.disabled).toBe(false);
		expect(button.findByType('Text' as React.ElementType).props.children).toBe(
			t(`settings.${key}`)
		);
	}
	expect(renderer.root.findByProps({ testID: 'printer-setup-footer' }).props.children).toBe(
		'Test page 1 · 48 characters per line'
	);
	act(() => renderer.unmount());
});

it('shows source labels on result cards', async () => {
	mockUsbPrinters.push({
		id: 'usb',
		name: 'USB printer',
		address: 'usb:1:2:3:4',
		connectionType: 'usb',
	});
	let renderer!: ReactTestRenderer;
	await act(async () => {
		renderer = create(<PrinterSetupDialog open onOpenChange={jest.fn()} onSave={jest.fn()} />);
	});
	for (const [address, label] of [
		['192.168.1.10', 'Wi-Fi'],
		['usb:1:2:3:4', 'USB'],
	]) {
		const card = renderer.root.findByProps({ testID: `printer-setup-result-${address}` });
		expect(card.findAllByType('Text' as React.ElementType).map((n) => n.props.children)).toContain(
			label
		);
	}
	act(() => renderer.unmount());
	mockUsbPrinters.length = 0;
});

it('keeps the Bluetooth button in view and tests the device the chooser resolves', async () => {
	// Two printable candidates: the results screen stays up, with the Bluetooth button beside the cards.
	mockUsbPrinters.push({
		id: 'usb',
		name: 'USB printer',
		address: 'usb:1:2:3:4',
		connectionType: 'usb',
	});
	let renderer!: ReactTestRenderer;
	await act(async () => {
		renderer = create(<PrinterSetupDialog open onOpenChange={jest.fn()} onSave={jest.fn()} />);
	});
	mockTestPrint.mockClear();
	await act(async () => {
		renderer.root.findByProps({ testID: 'printer-setup-setup_add_ble' }).props.onPress();
	});
	// The chooser renders beside the button, never inside the collapsed Options section.
	expect(
		renderer.root
			.findByType('Options' as React.ElementType)
			.findAllByProps({ testID: 'electron-bt-device-ble' })
	).toHaveLength(0);
	await act(async () => {
		renderer.root.findByProps({ testID: 'electron-bt-device-ble' }).props.onPress();
	});
	expect(mockTestPrint).toHaveBeenCalledTimes(1);
	expect(mockTestPrint).toHaveBeenCalledWith(
		expect.objectContaining({
			address: 'webbluetooth:ble',
			connectionType: 'bluetooth',
			columns: 32,
		}),
		{ openDrawer: false }
	);
	expect(renderer.root.findByProps({ testID: 'printer-setup-footer' }).props.children).toBe(
		'Test page 1 · 32 characters per line'
	);
	act(() => renderer.unmount());
	mockUsbPrinters.length = 0;
});

it('offers gesture-only web pickers beside the web scanning status and sweep progress', async () => {
	mockWebScanning = true;
	mockConnectUsb.mockClear();
	let renderer!: ReactTestRenderer;
	await act(async () => {
		renderer = create(
			<PrinterSetupDialog platform="web" open onOpenChange={jest.fn()} onSave={jest.fn()} />
		);
	});
	expect(mockConnectUsb).not.toHaveBeenCalled();
	const texts = renderer.root
		.findAllByType('Text' as React.ElementType)
		.map((n) => n.props.children);
	expect(texts).toContain('Looking for printers on Wi-Fi… USB or Bluetooth? Tap below.');
	expect(texts).toContain('3 of 20 addresses');
	for (const key of ['setup_add_usb', 'setup_add_ble']) {
		expect(renderer.root.findByProps({ testID: `printer-setup-${key}` }).props.disabled).toBe(
			false
		);
	}
	act(() => {
		renderer.root.findByProps({ testID: 'printer-setup-setup_add_usb' }).props.onPress();
		// Assert before yielding: deferring the picker loses the browser click gesture.
		expect(mockConnectUsb).toHaveBeenCalledTimes(1);
	});
	expect(renderer.root.findAllByProps({ testID: 'electron-bt-device-ble' })).toHaveLength(0);
	expect(texts).not.toContain(createTestT()('settings.web_printer_limitation'));
	act(() => renderer.unmount());
	mockWebScanning = false;
});
