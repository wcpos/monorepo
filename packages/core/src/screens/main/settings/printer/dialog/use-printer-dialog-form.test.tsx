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
