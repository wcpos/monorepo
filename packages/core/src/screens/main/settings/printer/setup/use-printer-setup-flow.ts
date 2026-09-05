import * as React from 'react';

import {
	canPrintLane,
	createIdentifyProbes,
	identifyPrinter,
	isPrinterConnectionError,
} from '@wcpos/printer';
import type { DiscoveredPrinter, PrinterDiscovery, PrinterService } from '@wcpos/printer';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { buildPrinterProfileFields } from '../profile-config';
import { DEFAULT_FORM_VALUES, type PrinterFormValues } from '../schema';

import type { TestPrintFailure } from '../dialog/use-printer-dialog-form';

const printerLogger = getLogger(['wcpos', 'printer', 'setup']);
export function classifyPrinter(printer: DiscoveredPrinter) {
	if (printer.identity?.notReceiptPrinter) return 'notprinter';
	const lane = printer.identity?.lane;
	if (lane?.protocol === 'raw') return 'unsure';
	return lane && canPrintLane(lane.protocol, createIdentifyProbes()) ? 'ready' : 'unknown';
}
interface SetupState {
	phase: 'scanning' | 'results' | 'printing' | 'asking' | 'trouble' | 'saved' | 'error';
	found: DiscoveredPrinter[];
	selected?: DiscoveredPrinter;
	columns: number;
	testPages: number;
	failure?: TestPrintFailure;
	profileDraft: PrinterFormValues;
}
interface SetupArgs {
	discovery: Pick<PrinterDiscovery, 'startScan' | 'stopScan' | 'printers' | 'isScanning' | 'error'>;
	printerService: Pick<PrinterService, 'testPrint'>;
	persist: (data: PrinterFormValues) => Promise<string>;
	t: (key: string) => string;
	printerCount?: number;
}
export function usePrinterSetupFlow({
	discovery,
	printerService,
	persist,
	t,
	printerCount = 0,
}: SetupArgs) {
	const [state, setState] = React.useState<SetupState>({
		phase: 'scanning',
		found: [],
		columns: 42,
		testPages: 0,
		profileDraft: {
			...DEFAULT_FORM_VALUES,
			name: t('settings.receipt_printer'),
			isDefault: printerCount === 0,
		},
	});
	const current = React.useRef(state);
	const active = React.useRef(true);
	const [scanComplete, setScanComplete] = React.useState(false);
	function update(patch: Partial<SetupState>) {
		current.current = { ...current.current, ...patch };
		setState(current.current);
		if (patch.phase) {
			const { phase, selected, columns, testPages } = current.current;
			printerLogger.debug('Printer setup phase', {
				context: { phase, selected: selected?.address, columns, testPages },
			});
		}
	}
	function updateDraft(patch: Partial<PrinterFormValues>) {
		const profileDraft = { ...current.current.profileDraft, ...patch };
		if (patch.vendor) profileDraft.language = patch.vendor === 'star' ? 'star-line' : 'esc-pos';
		update({ profileDraft, columns: profileDraft.columns });
	}
	function select(selected: DiscoveredPrinter) {
		const vendor = selected.identity?.vendor ?? selected.vendor ?? 'generic';
		update({ selected, failure: undefined });
		updateDraft({
			...DEFAULT_FORM_VALUES,
			name: selected.name,
			address: selected.address,
			vendor,
			port: selected.identity?.lane?.port ?? selected.port ?? 9100,
			columns: selected.identity?.columns ?? 42,
			isDefault: printerCount === 0,
		});
	}
	function fail(error: unknown, phase: 'trouble' | 'error') {
		update({
			phase,
			failure: {
				message: getErrorMessage(error),
				diagnostics: isPrinterConnectionError(error) ? error.diagnostics : null,
			},
		});
	}
	async function testPrint() {
		update({ phase: 'printing', testPages: current.current.testPages + 1, failure: undefined });
		const tempProfile = {
			id: `test-${Date.now()}`,
			...buildPrinterProfileFields(current.current.profileDraft),
			isBuiltIn: false,
		};
		try {
			await printerService.testPrint(tempProfile, { openDrawer: false });
			if (active.current) update({ phase: 'asking' });
		} catch (error) {
			if (active.current) fail(error, 'trouble');
		}
	}
	async function start() {
		active.current = true;
		setScanComplete(false);
		update({ phase: 'scanning', found: [], selected: undefined, failure: undefined });
		try {
			await discovery.startScan();
			if (active.current) setScanComplete(true);
		} catch (error) {
			if (active.current) fail(error, 'error');
		}
	}
	// Discovery publishes React state, not a return value; consume it after the completed scan commits.
	React.useEffect(() => {
		if (!scanComplete || discovery.isScanning || !active.current) return;
		setScanComplete(false);
		const found = [
			...new Map(
				discovery.printers.filter((p) => p.connectionType === 'network').map((p) => [p.address, p])
			).values(),
		];
		update({ phase: 'results', found });
		const printable = found.filter((p) => ['ready', 'unsure'].includes(classifyPrinter(p)));
		if (printable.length === 1) {
			select(printable[0]);
			void testPrint();
		}
	}, [scanComplete, discovery.isScanning, discovery.printers]);
	async function answer(value: 'ok' | 'short' | 'none') {
		if (value === 'none') return update({ phase: 'trouble', failure: undefined });
		if (value === 'short') {
			const widths = [42, 48, 64, 32];
			updateDraft({
				columns: widths[(widths.indexOf(current.current.columns) + 1) % widths.length],
			});
			return testPrint();
		}
		try {
			await persist(current.current.profileDraft);
			update({ phase: 'saved' });
		} catch (error) {
			fail(error, 'error');
		}
	}
	async function checkAddress(address: string) {
		update({ phase: 'scanning', failure: undefined });
		try {
			const identity = await identifyPrinter(address, {}, createIdentifyProbes());
			if (!active.current) return;
			select({
				id: address,
				address,
				name: current.current.profileDraft.name,
				connectionType: 'network',
				identity,
			});
			await testPrint();
		} catch (error) {
			if (active.current) fail(error, 'error');
		}
	}
	function stop() {
		active.current = false;
		void discovery.stopScan();
	}
	// The hook owns the scan lifecycle and must stop discovery on unmount.
	React.useEffect(() => () => stop(), []);
	return {
		state,
		start,
		select,
		testPrint,
		answer,
		retry: testPrint,
		rescan: start,
		checkAddress,
		stop,
		updateDraft,
	};
}
