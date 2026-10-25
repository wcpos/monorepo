import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { savePrinterProfile } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { canOpenDrawer, identifyPrinter, type PrinterProfile, probeVendor } from '@wcpos/printer';

import { usePrinterDialogForm, type VendorDefaults } from './use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, nativePrinterSchema, type PrinterFormValues } from '../schema';

const mockMarkSaved = jest.fn();
jest.mock('@wcpos/components/form', () => ({
	useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
		.useFormChangeHandler,
	useMarkSaved: () => mockMarkSaved,
}));
jest.mock('@wcpos/query', () => ({
	savePrinterProfile: jest.fn().mockResolvedValue({ id: 'star-printer' }),
}));

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
const onClose = jest.fn();

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

// Hoisted: a fresh object per render would re-fire the reset effect on every commit.
const starPrntPrinter: PrinterProfile = { ...printer, language: 'star-prnt' };

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

	// The fixture above is saved as 'star-line', which is also the vendor default — so it cannot
	// tell a preserved value from a re-derived one. A star printer saved as StarPRNT can.
	it('keeps a saved language the vendor default would overwrite', () => {
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
				printer: starPrntPrinter,
				printerCount: 1,
				onClose,
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

		expect(latest.form.getValues('language')).toBe('star-prnt');
	});

	// Codex review on #2010: an earlier fix latched the reset's vendor and cleared the latch only
	// on seeing that exact value. `add-printer.tsx` has an effect that corrects generic → epson
	// when the lane cannot take a generic profile, and it can land in the same passive-effect
	// batch as the reset — so the watch never publishes the latched vendor, the latch never
	// clears, and NO later vendor change derives anything. Comparing against `form.getValues`
	// has no in-flight state to get stuck.
	it('still derives after an external vendor correction lands before the watch publishes', () => {
		let renderer!: ReactTestRenderer;

		function Snapshot(_props: { value: ReturnType<typeof usePrinterDialogForm> }) {
			return null;
		}

		function Harness() {
			const corrected = React.useRef(false);
			const value = usePrinterDialogForm({
				open: true,
				schema: nativePrinterSchema,
				defaultValues,
				deriveVendorDefaults,
				printer: starPrntPrinter,
				printerCount: 1,
				onClose,
			});
			// Mirrors add-printer.tsx's vendor correction: a sibling effect in the same component,
			// so it runs in the same passive-effect batch as the hook's reset and moves the vendor
			// off the value that reset just wrote — before the watch has published it.
			React.useEffect(() => {
				if (corrected.current) return;
				corrected.current = true;
				// Any vendor other than the one reset just wrote; add-printer.tsx uses epson, but the
				// form's own default here IS epson, and a correction back to the watch's current value
				// would not re-trigger this effect at all.
				value.form.setValue('vendor', 'generic');
			});
			return <Snapshot value={value} />;
		}

		act(() => {
			renderer = create(<Harness />);
		});
		act(() => {
			jest.advanceTimersByTime(500);
		});
		const latest = () =>
			renderer.root.findByType(Snapshot).props.value as ReturnType<typeof usePrinterDialogForm>;

		// The correction is a real vendor change, so its defaults apply...
		expect(latest().form.getValues('vendor')).toBe('generic');
		expect(latest().form.getValues('language')).toBe('esc-pos');

		// ...and, critically, the NEXT change still derives. Under the latch this stayed
		// 'esc-pos' forever, because the latch was waiting for a 'star' the watch never published.
		act(() => {
			latest().form.setValue('vendor', 'star');
		});
		expect(latest().form.getValues('language')).toBe('star-line');
	});

	// The latch must not swallow a real vendor change that follows the reset.
	it('still derives the language when the cashier changes vendor', () => {
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
				printer: starPrntPrinter,
				printerCount: 1,
				onClose,
			});
			return <Snapshot value={value} />;
		}

		act(() => {
			renderer = create(<Harness />);
		});
		act(() => {
			jest.advanceTimersByTime(500);
		});
		const latest = () =>
			renderer.root.findByType(Snapshot).props.value as ReturnType<typeof usePrinterDialogForm>;

		act(() => {
			latest().form.setValue('vendor', 'epson');
		});

		expect(latest().form.getValues('language')).toBe('esc-pos');
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
				onClose,
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
				onClose,
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

describe('usePrinterDialogForm autosave', () => {
	let renderer: ReactTestRenderer;
	function Snapshot(_props: { value: ReturnType<typeof usePrinterDialogForm> }) {
		return null;
	}
	const latest = () =>
		renderer.root.findByType(Snapshot).props.value as ReturnType<typeof usePrinterDialogForm>;
	function Harness() {
		const value = usePrinterDialogForm({
			open: true,
			schema: nativePrinterSchema,
			defaultValues,
			deriveVendorDefaults,
			printer,
			printerCount: 1,
			onClose,
		});
		return <Snapshot value={value} />;
	}
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		jest.mocked(savePrinterProfile).mockResolvedValue({ id: printer.id } as never);
		jest
			.mocked(identifyPrinter)
			.mockResolvedValue({ vendor: null, lane: null, ports: [] } as never);
		act(() => {
			renderer = create(<Harness />);
		});
	});
	afterEach(() => {
		act(() => renderer.unmount());
		jest.useRealTimers();
	});
	it('persists a valid name change as a whole profile and marks name', async () => {
		await act(async () => {
			latest().form.setValue('name', 'Counter printer');
			jest.advanceTimersByTime(300);
		});
		expect(savePrinterProfile).toHaveBeenCalledTimes(1);
		expect(savePrinterProfile).toHaveBeenCalledWith(
			expect.anything(),
			{
				name: 'Counter printer',
				address: printer.address,
				port: 9100,
				emitEscPrintMode: true,
				fullReceiptRaster: false,
				drawerConnector: 'pin2',
				vendor: printer.vendor,
				connectionType: printer.connectionType,
				language: printer.language,
				columns: printer.columns,
				autoCut: printer.autoCut,
				autoOpenDrawer: printer.autoOpenDrawer,
				isDefault: printer.isDefault,
			},
			{ id: printer.id, reuseByAddress: true }
		);
		expect(mockMarkSaved).toHaveBeenCalledWith(['name']);
	});
	it('holds a whole draft with an empty network address and returns false', async () => {
		const trigger = jest.spyOn(latest().form, 'trigger');
		await act(async () => {
			latest().form.setValue('address', '');
			latest().form.setValue('name', 'Held name');
			expect(await latest().flush()).toBe(false);
		});
		expect(trigger).toHaveBeenCalledWith();
		expect(savePrinterProfile).not.toHaveBeenCalled();
		expect(mockMarkSaved).not.toHaveBeenCalled();
	});
	it('reports a rejected persist once with a toast and returns false without a mark', async () => {
		const error = new Error('disk full');
		jest.mocked(savePrinterProfile).mockRejectedValueOnce(error);
		await act(async () => {
			latest().form.setValue('name', 'Unsaved name');
			expect(await latest().flush()).toBe(false);
		});
		const logger = getLogger(['wcpos', 'printer', 'dialog']);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
			context: { printerId: printer.id, root: 'name', error: 'disk full' },
		});
		expect(mockMarkSaved).not.toHaveBeenCalled();
	});
	it('serializes overlapping writes: the second persist starts after the first settles', async () => {
		let releaseFirst: (value: { id: string }) => void = () => {};
		jest
			.mocked(savePrinterProfile)
			.mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)) as never);
		await act(async () => {
			latest().form.setValue('name', 'First');
			jest.advanceTimersByTime(300);
		});
		await act(async () => {
			latest().form.setValue('columns', 48);
		});
		expect(savePrinterProfile).toHaveBeenCalledTimes(1);
		await act(async () => {
			releaseFirst({ id: printer.id });
		});
		expect(savePrinterProfile).toHaveBeenCalledTimes(2);
		expect(jest.mocked(savePrinterProfile).mock.calls[1][1]).toMatchObject({
			name: 'First',
			columns: 48,
		});
	});
	it('flushes the pending write before onClose', async () => {
		let finish!: () => void;
		jest.mocked(savePrinterProfile).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = () => resolve({ id: printer.id } as never);
				})
		);
		let closing!: Promise<void>;
		await act(async () => {
			latest().form.setValue('name', 'Closing name');
			closing = latest().handleClose();
		});
		expect(savePrinterProfile).toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		await act(async () => {
			finish();
			await closing;
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});
	it('persists a probe-driven vendor setValue through the change handler', async () => {
		jest.mocked(identifyPrinter).mockResolvedValue({
			vendor: 'epson',
			lane: { port: 8043, protocol: 'epos-print', encrypted: true },
			ports: [],
		} as never);
		await act(async () => {
			jest.advanceTimersByTime(500);
		});
		await act(async () => {
			await latest().flush();
		});
		expect(savePrinterProfile).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ vendor: 'epson', language: 'esc-pos', port: 8043 }),
			{ id: printer.id, reuseByAddress: true }
		);
		expect(mockMarkSaved).toHaveBeenCalledWith(['vendor']);
	});
});
