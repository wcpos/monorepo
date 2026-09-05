import * as React from 'react';

import {
	canPrintLane,
	createIdentifyProbes,
	identifyModel,
	identifyPrinter,
	isPrinterConnectionError,
} from '@wcpos/printer';
import type { DiscoveredPrinter, PrinterDiscovery, PrinterService } from '@wcpos/printer';
import { capturePrinterOutcome, getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { hasTargetKind, isUsbLikeDevice } from '../dialog/connection/discovered-printer-filters';
import { isWindowsPlatform } from '../dialog/connection/is-windows';
import { buildPrinterProfileFields } from '../profile-config';
import { DEFAULT_FORM_VALUES, type PrinterFormValues } from '../schema';
import { deriveWebVendorDefaults, resolveWebPort } from '../web-network-defaults';

import type { TestPrintFailure } from '../dialog/use-printer-dialog-form';

const printerLogger = getLogger(['wcpos', 'printer', 'setup']);
interface SetupCandidate extends DiscoveredPrinter {
	source: 'network' | 'usb' | 'bluetooth' | 'system';
}
function candidate(printer: DiscoveredPrinter): SetupCandidate {
	return {
		...printer,
		source: hasTargetKind(printer, 'winspool')
			? 'system'
			: hasTargetKind(printer, 'serial')
				? 'bluetooth'
				: printer.connectionType,
	};
}
export function classifyPrinter(
	printer: DiscoveredPrinter,
	platform: 'electron' | 'web' = 'electron'
) {
	// A webusb:/webbluetooth: row only exists once the browser or Electron chooser resolved the device.
	if (/^web(usb|bluetooth):/.test(printer.address)) return 'ready';
	if (isUsbLikeDevice(printer) || hasTargetKind(printer, 'serial')) return 'ready';
	if (printer.identity?.notReceiptPrinter) return 'notprinter';
	const lane = printer.identity?.lane;
	if (platform === 'electron' && lane?.protocol === 'raw') return 'unsure';
	return lane && canPrintLane(lane.protocol, createIdentifyProbes()) ? 'ready' : 'unknown';
}
interface SetupState {
	phase:
		| 'scanning'
		| 'checking'
		| 'results'
		| 'printing'
		| 'asking'
		| 'width'
		| 'trouble'
		| 'saving'
		| 'saved'
		| 'error';
	found: SetupCandidate[];
	selected?: SetupCandidate;
	columns: number;
	/** False when neither identification nor the model table knows the paper width. */
	columnsKnown: boolean;
	testPages: number;
	failure?: TestPrintFailure;
	profileDraft: PrinterFormValues;
}
interface SetupArgs {
	discovery: Pick<
		PrinterDiscovery,
		| 'startScan'
		| 'stopScan'
		| 'printers'
		| 'isScanning'
		| 'error'
		| 'connectUsbDevice'
		| 'connectSerialDevice'
		| 'connectBluetoothDevice'
		| 'isBluetoothScanning'
		| 'cancelBluetoothScan'
	>;
	printerService: Pick<PrinterService, 'testPrint'>;
	persist: (data: PrinterFormValues) => Promise<string>;
	t: (key: string) => string;
	printerCount?: number;
}
export function usePrinterSetupFlow(
	{ discovery, printerService, persist, t, printerCount = 0 }: SetupArgs,
	{ platform = 'electron' }: { platform?: 'electron' | 'web' } = {}
) {
	const web = platform === 'web';
	const [state, setState] = React.useState<SetupState>({
		phase: 'scanning',
		found: [],
		columns: 42,
		columnsKnown: false,
		testPages: 0,
		profileDraft: {
			...DEFAULT_FORM_VALUES,
			...(web ? { vendor: 'epson' as const, ...deriveWebVendorDefaults('epson') } : {}),
			name: t('settings.receipt_printer'),
			isDefault: printerCount === 0,
		},
	});
	const current = React.useRef(state);
	const active = React.useRef(true);
	const pendingPicker = React.useRef<DiscoveredPrinter[] | null>(null);
	// A scan that finishes after Stop or a manual check must not touch the list.
	const scanGeneration = React.useRef(0);
	const [scanComplete, setScanComplete] = React.useState(false);
	function update(patch: Partial<SetupState>) {
		current.current = { ...current.current, ...patch };
		setState(current.current);
		if (patch.phase) {
			const { phase, selected, columns, testPages } = current.current;
			printerLogger.debug('Printer setup phase', {
				context: {
					phase,
					selected: selected?.address,
					source: selected?.source,
					columns,
					testPages,
				},
			});
			// Terminal phases are the outcome support and telemetry pivot on (roadmap#161 P0).
			if (phase === 'saved' || phase === 'trouble' || phase === 'error') {
				const outcome = {
					result: phase,
					platform,
					source: selected?.source,
					vendor: current.current.profileDraft.vendor,
					model: selected?.identity?.model,
					lane: selected?.identity?.lane?.protocol,
					port: current.current.profileDraft.port,
					columns,
					testPages,
					securePrinting: selected?.identity?.securePrinting,
					failure: current.current.failure?.message,
				};
				printerLogger.info('Printer setup outcome', { context: outcome });
				capturePrinterOutcome(outcome);
			}
		}
	}
	function updateDraft(patch: Partial<PrinterFormValues>) {
		const profileDraft = { ...current.current.profileDraft, ...patch };
		if (patch.vendor)
			profileDraft.language = web
				? deriveWebVendorDefaults(patch.vendor).language
				: patch.vendor === 'star'
					? 'star-line'
					: 'esc-pos';
		update({ profileDraft, columns: profileDraft.columns });
	}
	function select(selected: DiscoveredPrinter, keepDraft = false) {
		let vendor =
			selected.identity?.vendor ??
			selected.vendor ??
			(keepDraft ? current.current.profileDraft.vendor : undefined) ??
			'generic';
		if (web) vendor = vendor === 'star' ? 'star' : 'epson';
		// A chooser-picked device on Electron carries no identity; plain ESC/POS is the safe profile.
		else if (/^web(usb|bluetooth):/.test(selected.address) && !selected.identity?.vendor)
			vendor = 'generic';
		const lane = selected.identity?.lane;
		// A lane this platform cannot print (e.g. WebPRNT on Electron) must not become the raw port.
		const lanePort =
			lane && canPrintLane(lane.protocol, createIdentifyProbes()) ? lane.port : undefined;
		const base = keepDraft
			? current.current.profileDraft
			: { ...DEFAULT_FORM_VALUES, isDefault: printerCount === 0 };
		const knownColumns =
			selected.connectionType === 'network'
				? selected.identity?.columns
				: identifyModel(selected.name).columns;
		update({
			selected: candidate(selected),
			failure: undefined,
			columnsKnown: knownColumns != null,
		});
		updateDraft({
			...base,
			name: keepDraft ? base.name : selected.name,
			address: selected.address,
			connectionType: selected.connectionType,
			nativeInterfaceType: selected.nativeInterfaceType,
			vendor,
			port: web
				? resolveWebPort(vendor, lane?.port ?? selected.port)
				: (lanePort ?? selected.port ?? base.port ?? 9100),
			// Unknown width: pre-select the likely paper so the toggle starts on it. Epson and Star are
			// 80 mm (48) almost always; a chooser-picked generic Bluetooth printer is the cheap 58 mm kind.
			columns:
				knownColumns ??
				(vendor === 'epson' || vendor === 'star'
					? 48
					: /^webbluetooth:/.test(selected.address)
						? 32
						: selected.connectionType === 'network'
							? (base.columns ?? 42)
							: 42),
		});
	}
	function fail(error: unknown, phase: 'trouble' | 'error' | 'results') {
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
		pendingPicker.current = null;
		const generation = ++scanGeneration.current;
		setScanComplete(false);
		update({ phase: 'scanning', found: [], selected: undefined, failure: undefined });
		const scans = await Promise.allSettled([
			discovery.startScan(),
			!web ? discovery.connectUsbDevice?.() : undefined,
			// Windows installed queues already come from usb-discovery.
			!web && !isWindowsPlatform() ? discovery.connectSerialDevice?.() : undefined,
		]);
		for (const result of scans) {
			if (result.status === 'rejected') {
				printerLogger.debug('Printer setup scan failed', {
					context: { error: getErrorMessage(result.reason) },
				});
			}
		}
		if (active.current && generation === scanGeneration.current) setScanComplete(true);
	}
	// Discovery publishes React state, not a return value; consume it after the completed scan commits.
	React.useEffect(() => {
		if (!scanComplete || discovery.isScanning || !active.current) return;
		setScanComplete(false);
		const found = [
			...new Map(
				discovery.printers
					.filter(
						(p) =>
							p.connectionType === 'network' ||
							isUsbLikeDevice(p) ||
							hasTargetKind(p, 'serial') ||
							(web && /^webbluetooth:/.test(p.address))
					)
					.map((p) => [p.address, candidate(p)])
			).values(),
		];
		// A printer tapped while the Wi-Fi scan was still running is already printing; only refresh the list.
		if (current.current.phase !== 'scanning') return update({ found });
		update({ phase: 'results', found });
		// Printing is the cashier's tap (Paul, 2026-09-05): a sole find is pre-selected, never auto-printed.
		const printable = found.filter((p) =>
			['ready', 'unsure'].includes(classifyPrinter(p, platform))
		);
		if (printable.length === 1 && !current.current.selected) select(printable[0]);
		// The platform option and its derived web flag are fixed for this hook's lifetime.
	}, [scanComplete, discovery.isScanning, discovery.printers]);
	// Plugged-in and OS-paired printers enumerate in a second; list them while the Wi-Fi scan continues.
	React.useEffect(() => {
		if (current.current.phase !== 'scanning' || !active.current) return;
		const early = discovery.printers
			.filter((p) => isUsbLikeDevice(p) || hasTargetKind(p, 'serial'))
			.map(candidate);
		const addresses = (list: DiscoveredPrinter[]) => list.map((p) => p.address).join();
		if (early.length > 0 && addresses(early) !== addresses(current.current.found))
			update({ found: early });
	}, [discovery.printers]);
	function startBluetoothScan() {
		pendingPicker.current = discovery.printers;
		discovery.connectBluetoothDevice?.();
	}
	function startUsbPicker() {
		pendingPicker.current = discovery.printers;
		void discovery.connectUsbDevice?.();
	}
	// The external chooser publishes its connected device through discovery state.
	React.useEffect(() => {
		if (!pendingPicker.current || discovery.isBluetoothScanning || !active.current) return;
		const device = discovery.printers.find((p) =>
			web
				? /^web(usb|bluetooth):/.test(p.address) &&
					!pendingPicker.current?.some((old) => old.address === p.address)
				: p.address.startsWith('webbluetooth:') && !pendingPicker.current?.includes(p)
		);
		if (web && !device) return;
		pendingPicker.current = null;
		if (device) {
			// The chooser's pick lands as a selected card; the test page is still the user's tap.
			const found = [
				...current.current.found.filter((p) => p.address !== device.address),
				candidate(device),
			];
			update({ phase: 'results', found });
			select(device, false);
		}
	}, [discovery.isBluetoothScanning, discovery.printers]);
	/** The cashier already knows the address: stop looking and keep whatever was found so far. */
	function cancelScan() {
		if (current.current.phase !== 'scanning') return;
		scanGeneration.current += 1;
		void discovery.stopScan();
		setScanComplete(false);
		update({ phase: 'results' });
	}
	function chooseWidth(columns: number) {
		updateDraft({ columns });
		update({ columnsKnown: true });
		return testPrint();
	}
	async function answer(value: 'ok' | 'short' | 'none') {
		if (value === 'none') return update({ phase: 'trouble', failure: undefined });
		// The ruler answer opens the width choice; the next page prints on the cashier's pick.
		if (value === 'short') return update({ phase: 'width' });
		if (current.current.phase === 'saving') return;
		update({ phase: 'saving' });
		try {
			await persist(current.current.profileDraft);
			update({ phase: 'saved' });
		} catch (error) {
			fail(error, 'error');
		}
	}
	/** Resolves true when the address answered; a failure stays on the results screen with the form. */
	async function checkAddress(values: PrinterFormValues): Promise<boolean> {
		scanGeneration.current += 1;
		void discovery.stopScan();
		setScanComplete(false);
		update({
			phase: 'checking',
			failure: undefined,
			profileDraft: values,
			columns: values.columns,
		});
		try {
			// Name and vendor hints keep identify off raw 9100 on an Epson whose ePOS lane is down.
			const identity = await identifyPrinter(
				values.address,
				{ name: values.name, vendor: values.vendor },
				createIdentifyProbes()
			);
			if (!active.current) return false;
			const manual: DiscoveredPrinter = {
				id: values.address,
				address: values.address,
				name: values.name,
				connectionType: 'network',
				identity,
			};
			// The checked address lands as a selected card; printing stays the cashier's tap.
			update({
				phase: 'results',
				found: [
					...current.current.found.filter((p) => p.address !== manual.address),
					candidate(manual),
				],
			});
			select(manual, true);
			return true;
		} catch (error) {
			// Not the save-error screen: that one retries a save. The form stays up with the failure.
			if (active.current) fail(error, 'results');
			return false;
		}
	}
	function stop() {
		active.current = false;
		discovery.cancelBluetoothScan?.();
		void discovery.stopScan();
	}
	// The hook owns the scan lifecycle and must stop discovery on unmount.
	React.useEffect(() => () => stop(), []);
	return {
		state,
		start,
		startBluetoothScan,
		startUsbPicker,
		chooseWidth,
		cancelScan,
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
