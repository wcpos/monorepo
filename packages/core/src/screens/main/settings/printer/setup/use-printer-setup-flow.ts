import * as React from 'react';

import {
	canPrintLane,
	createIdentifyProbes,
	describeStatus,
	identifyModel,
	identifyPrinter,
	isPrinterConnectionError,
	queryUsbPrinterModel,
	resolveNativePrinterColumns,
} from '@wcpos/printer';
import type {
	DiscoveredPrinter,
	PrinterDiscovery,
	PrinterService,
	PrinterStatus,
} from '@wcpos/printer';
import { capturePrinterOutcome, getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { hasTargetKind, isUsbLikeDevice } from '../dialog/connection/discovered-printer-filters';
import { isWindowsPlatform } from '../dialog/connection/is-windows';
import { buildPrinterProfileFields } from '../profile-config';
import { DEFAULT_FORM_VALUES, type PrinterFormValues } from '../schema';
import { deriveWebVendorDefaults, resolveWebPort } from '../web-network-defaults';

import type { TestPrintFailure } from '../dialog/use-printer-dialog-form';

const printerLogger = getLogger(['wcpos', 'printer', 'setup']);
export type SetupPlatform = 'electron' | 'web' | 'native';
/** The SDK asks the printer for its paper width; the results screen never waits longer than this. */
const WIDTH_QUERY_TIMEOUT_MS = 4000;
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
export function classifyPrinter(printer: DiscoveredPrinter, platform: SetupPlatform = 'electron') {
	// A webusb:/webbluetooth: row only exists once the browser or Electron chooser resolved the device.
	if (/^web(usb|bluetooth):/.test(printer.address)) return 'ready';
	// Native SDK discovery only lists the Bluetooth printers it can already talk to.
	if (platform === 'native' && printer.connectionType === 'bluetooth') return 'ready';
	if (isUsbLikeDevice(printer) || hasTargetKind(printer, 'serial')) return 'ready';
	if (printer.identity?.notReceiptPrinter) return 'notprinter';
	const lane = printer.identity?.lane;
	// The native raw lane prints, so a vendor the SDK knows is ready; on Electron raw is only a guess.
	if (lane?.protocol === 'raw' && platform !== 'web')
		return platform === 'native' &&
			['epson', 'star'].includes(printer.identity?.vendor ?? printer.vendor ?? '')
			? 'ready'
			: 'unsure';
	return lane && canPrintLane(lane.protocol, createIdentifyProbes()) ? 'ready' : 'unknown';
}
/**
 * Epson Secure Printing: discovery folds the printer's TCPS: sibling onto its one network row, and
 * that encrypted target is the only one that prints while the setting is on (Spec L).
 */
export function secureTargetFor(printer: Pick<DiscoveredPrinter, 'identity' | 'secureTarget'>) {
	const secure = printer.identity?.securePrinting || printer.identity?.lane?.encrypted;
	return secure ? printer.secureTarget : undefined;
}
/**
 * Why nothing printed, read off the signatures identification already collected plus the
 * failure text — the setup dialog turns each one into a single line (roadmap#161 P1).
 * `paper` is the printer's own answer (`DLE EOT`); `lane` is the fallback: nothing specific,
 * so the per-lane advice stands.
 */
export type TroubleReason =
	'secure' | 'held' | 'permission' | 'pairing' | 'unresponsive' | 'paper' | 'lane';
const PERMISSION_RE = /permission|not allowed|NotAllowedError|LIBUSB_ERROR_ACCESS|EACCES|denied/i;
const PAIRING_RE = /pair|bt-none-found|no supported print service|not found/i;
const UNRESPONSIVE_RE = /not responding|no longer in range|timed out/i;
/** The two things a printer says about itself that the cashier fixes at the printer. */
function saysPaperTrouble(status: PrinterStatus | null | undefined): boolean {
	return status != null && ['paper-out', 'cover-open'].includes(describeStatus(status));
}
export function troubleReasonFor(
	selected: Pick<SetupCandidate, 'source' | 'identity'> | undefined,
	failure = '',
	status?: PrinterStatus | null
): TroubleReason {
	// The printer answering "no paper" or "cover open" outranks anything inferred from a failure.
	if (saysPaperTrouble(status)) return 'paper';
	if (selected?.identity?.securePrinting) return 'secure';
	if (selected?.identity?.ports?.some((port) => port.httpStatus === 503)) return 'held';
	if (PERMISSION_RE.test(failure)) return 'permission';
	if (selected?.source === 'bluetooth' && PAIRING_RE.test(failure)) return 'pairing';
	if (UNRESPONSIVE_RE.test(failure)) return 'unresponsive';
	return 'lane';
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
	/** True while the native SDK is still being asked for the paper width (roadmap#31). */
	columnsPending: boolean;
	/** Replaces the identified lane in the log when the draft took another route (Secure Printing). */
	lane?: string;
	testPages: number;
	failure?: TestPrintFailure;
	/** What the printer said about itself after the last test page; null when it cannot be asked. */
	lastStatus?: PrinterStatus | null;
	troubleReason?: TroubleReason;
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
	{ platform = 'electron' }: { platform?: SetupPlatform } = {}
) {
	const web = platform === 'web';
	const native = platform === 'native';
	const [state, setState] = React.useState<SetupState>({
		phase: 'scanning',
		found: [],
		columns: 42,
		columnsKnown: false,
		columnsPending: false,
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
		// The reason is read once, on the way in, from the signatures identification already has.
		if (patch.phase === 'trouble')
			current.current = {
				...current.current,
				troubleReason: troubleReasonFor(
					current.current.selected,
					current.current.failure?.message,
					current.current.lastStatus
				),
			};
		setState(current.current);
		if (patch.phase) {
			const { phase, selected, columns, testPages, troubleReason } = current.current;
			// The Secure Printing target replaces the identified lane on the draft (Spec L).
			const lane = current.current.lane ?? selected?.identity?.lane?.protocol;
			printerLogger.debug('Printer setup phase', {
				context: {
					phase,
					selected: selected?.address,
					source: selected?.source,
					lane,
					columns,
					testPages,
					troubleReason,
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
					lane,
					port: current.current.profileDraft.port,
					columns,
					testPages,
					securePrinting: selected?.identity?.securePrinting,
					troubleReason: current.current.troubleReason,
					failure: current.current.failure?.message,
				};
				printerLogger.info('Printer setup outcome', { context: outcome });
				// The sink allowlists fields; the failure text stays in the local log only.
				const { failure: _failure, port: _port, ...remote } = outcome;
				capturePrinterOutcome(remote);
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
		// Bluetooth and USB run through the Epson and Star SDKs; native has no generic device transport.
		if (native && selected.connectionType !== 'network' && vendor === 'generic') vendor = 'epson';
		const secureTarget = native ? secureTargetFor(selected) : undefined;
		if (secureTarget) vendor = 'epson';
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
			lane: secureTarget ? 'sdk-secure' : undefined,
		});
		updateDraft({
			...base,
			name: keepDraft ? base.name : selected.name,
			address: secureTarget ?? selected.address,
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
		// 'system' is an Electron spooler queue; a native row is only network, Bluetooth or USB.
		if (native && selected.connectionType !== 'system')
			void queryColumns({
				address: secureTarget ?? selected.address,
				connectionType: selected.connectionType,
				vendor,
				name: selected.name,
			});
		// Electron USB: the printer can say its model (GS I 67) when its product string did not (Spec K3).
		else if (platform === 'electron' && knownColumns == null && /^usb:/.test(selected.address))
			void queryUsbColumns(selected.address);
	}
	async function queryUsbColumns(address: string) {
		const generation = ++columnsQuery.current;
		update({ columnsPending: true });
		let timer: ReturnType<typeof setTimeout> | undefined;
		const model = await Promise.race([
			queryUsbPrinterModel(address),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), WIDTH_QUERY_TIMEOUT_MS);
			}),
		]);
		clearTimeout(timer);
		if (!active.current || generation !== columnsQuery.current) return;
		const columns = model ? identifyModel(model).columns : undefined;
		printerLogger.debug('USB model query resolved', { context: { address, model, columns } });
		if (columns != null) updateDraft({ columns });
		update({ columnsPending: false, columnsKnown: columns != null });
	}
	// The width query is a nicety: it never blocks the test page, and a later pick supersedes it.
	const columnsQuery = React.useRef(0);
	async function queryColumns(input: Parameters<typeof resolveNativePrinterColumns>[0]) {
		const generation = ++columnsQuery.current;
		update({ columnsPending: true });
		let timer: ReturnType<typeof setTimeout> | undefined;
		let resolved: Awaited<ReturnType<typeof resolveNativePrinterColumns>> | null = null;
		try {
			resolved = await Promise.race([
				resolveNativePrinterColumns(input),
				new Promise<null>((resolve) => {
					timer = setTimeout(() => resolve(null), WIDTH_QUERY_TIMEOUT_MS);
				}),
			]);
		} catch (error) {
			printerLogger.debug('Printer columns query failed', {
				context: { error: getErrorMessage(error) },
			});
		}
		clearTimeout(timer);
		if (!active.current || generation !== columnsQuery.current) return;
		if (resolved?.columns != null) updateDraft({ columns: resolved.columns });
		update({ columnsPending: false, columnsKnown: resolved?.columns != null });
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
		update({
			phase: 'printing',
			testPages: current.current.testPages + 1,
			failure: undefined,
			lastStatus: undefined,
		});
		const tempProfile = {
			id: `test-${Date.now()}`,
			...buildPrinterProfileFields(current.current.profileDraft),
			isBuiltIn: false,
		};
		try {
			const { status } = await printerService.testPrint(tempProfile, { openDrawer: false });
			if (!active.current) return;
			// The printer said what is wrong: don't ask the cashier to read a page that never came.
			update({ phase: saysPaperTrouble(status) ? 'trouble' : 'asking', lastStatus: status });
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
			// Native SDK discovery lists Bluetooth and USB printers itself; there is nothing to pick.
			!web && !native ? discovery.connectUsbDevice?.() : undefined,
			// Windows installed queues already come from usb-discovery.
			!web && !native && !isWindowsPlatform() ? discovery.connectSerialDevice?.() : undefined,
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
							(native && p.connectionType === 'bluetooth') ||
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
		// The cashier's pick outranks a width query still in flight.
		columnsQuery.current += 1;
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
