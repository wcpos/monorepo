import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { canOpenDrawer, identifyPrinter, type PrinterProfile, probeVendor } from '@wcpos/printer';

import { usePrinterDialogForm, type VendorDefaults } from './use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, nativePrinterSchema, type PrinterFormValues } from '../schema';

jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));

jest.mock('@wcpos/printer', () => ({
	PrinterService: class {
		setCloudEnqueueFactory() {}
		dispose() {
			return Promise.resolve();
		}
	},
	probeVendor: jest.fn().mockResolvedValue(null),
	identifyPrinter: jest.fn().mockResolvedValue({ vendor: null, lane: null, ports: [] }),
	canPrintLane: jest.fn(() => true),
	createIdentifyProbes: jest.fn(() => ({})),
	canOpenDrawer: jest.fn((profile: PrinterProfile) => profile.connectionType === 'network'),
	isPrinterConnectionError: jest.fn(() => false),
}));

jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: { collections: { printer_profiles: {} } } }),
}));

jest.mock('../../../../../contexts/translations', () => {
	const t = (key: string) => key;
	return { useT: () => t };
});

jest.mock('uuid', () => ({ v4: () => 'printer-id' }));

const deriveVendorDefaults = (vendor: PrinterFormValues['vendor']): VendorDefaults => ({
	language: vendor === 'star' ? 'star-line' : 'esc-pos',
	port: 9100,
});

const defaultValues: PrinterFormValues = {
	...DEFAULT_FORM_VALUES,
	connectionType: 'usb',
	vendor: 'epson',
};
const onSave = jest.fn();

const printer: PrinterProfile = {
	id: 'star-printer',
	name: 'Star printer',
	connectionType: 'network',
	vendor: 'star',
	address: '192.168.1.23',
	port: 9100,
	language: 'star-line',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: true,
	isDefault: true,
	isBuiltIn: false,
};

describe('usePrinterDialogForm', () => {
	beforeAll(() => {
		(
			globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
	});

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		jest.mocked(probeVendor).mockImplementation(() => new Promise(() => {}));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('subscribes native watches before publishing initial printer values', () => {
		let renderer!: ReactTestRenderer;

		function Snapshot(_props: { value: ReturnType<typeof usePrinterDialogForm> }) {
			return null;
		}

		function Harness() {
			const value = usePrinterDialogForm({
				open: true,
				schema: nativePrinterSchema,
				defaultValues,
				deriveVendorDefaults,
				printer,
				printerCount: 1,
				onSave,
			});
			return <Snapshot value={value} />;
		}

		act(() => {
			renderer = create(<Harness />);
		});
		act(() => {
			jest.advanceTimersByTime(500);
		});
		const latest = renderer.root.findByType(Snapshot).props.value as ReturnType<
			typeof usePrinterDialogForm
		>;

		expect(latest.form.getValues('language')).toBe('star-line');
		expect(identifyPrinter).toHaveBeenCalledWith(
			'192.168.1.23',
			expect.anything(),
			expect.anything()
		);
		expect(canOpenDrawer).toHaveBeenLastCalledWith(
			expect.objectContaining({ connectionType: 'network' })
		);
		expect(latest.canOpenDrawer).toBe(true);

		act(() => renderer.unmount());
	});
});

// Ports differ per vendor so a rewrite is visible; the shared helper above keeps them equal.
const deriveDistinctDefaults = (vendor: PrinterFormValues['vendor']): VendorDefaults => ({
	language: vendor === 'star' ? 'star-line' : 'esc-pos',
	port: vendor === 'star' ? 9100 : 8043,
});

describe('usePrinterDialogForm detection and port rewrites', () => {
	let renderer: ReactTestRenderer;

	function Snapshot(_props: { value: ReturnType<typeof usePrinterDialogForm> }) {
		return null;
	}

	function mount() {
		function Harness() {
			const value = usePrinterDialogForm({
				open: true,
				schema: nativePrinterSchema,
				defaultValues,
				deriveVendorDefaults: deriveDistinctDefaults,
				printer,
				printerCount: 1,
				onSave,
			});
			return <Snapshot value={value} />;
		}
		act(() => {
			renderer = create(<Harness />);
		});
		return () =>
			renderer.root.findByType(Snapshot).props.value as ReturnType<typeof usePrinterDialogForm>;
	}

	async function runProbe() {
		await act(async () => {
			jest.advanceTimersByTime(500);
		});
	}

	beforeAll(() => {
		(
			globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
	});

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
	});

	afterEach(() => {
		act(() => renderer?.unmount());
		jest.useRealTimers();
	});

	it('does not claim a detection from a vendor the probe only guessed (#20)', async () => {
		jest
			.mocked(identifyPrinter)
			.mockResolvedValue({ vendor: 'epson', lane: null, ports: [] } as never);
		const latest = mount();
		await runProbe();

		expect(latest().detectedVendor).toBeNull();
		expect(latest().form.getValues('vendor')).toBe('star');
		expect(latest().form.getValues('port')).toBe(9100);
	});

	it('clears the detection when the probe fails (#20)', async () => {
		jest.mocked(identifyPrinter).mockResolvedValue({
			vendor: 'epson',
			lane: { port: 8043, protocol: 'epos-print', encrypted: true },
			ports: [],
		} as never);
		const latest = mount();
		await runProbe();
		expect(latest().detectedVendor).toBe('epson');

		jest.mocked(identifyPrinter).mockRejectedValue(new Error('Connection timed out'));
		act(() => {
			latest().form.setValue('address', '192.168.1.24');
		});
		await runProbe();

		expect(latest().detectedVendor).toBeNull();
	});

	it('rewrites the port when the cashier picks the vendor (#18)', async () => {
		jest
			.mocked(identifyPrinter)
			.mockResolvedValue({ vendor: null, lane: null, ports: [] } as never);
		const latest = mount();
		await runProbe();

		act(() => {
			latest().setManualVendor();
			latest().form.setValue('vendor', 'epson');
		});

		expect(latest().form.getValues('port')).toBe(8043);
	});

	it('leaves an existing port alone when nothing confirmed the vendor (#18)', async () => {
		jest
			.mocked(identifyPrinter)
			.mockResolvedValue({ vendor: null, lane: null, ports: [] } as never);
		const latest = mount();
		await runProbe();

		act(() => {
			latest().form.setValue('vendor', 'epson');
		});

		expect(latest().form.getValues('port')).toBe(9100);
	});
});
