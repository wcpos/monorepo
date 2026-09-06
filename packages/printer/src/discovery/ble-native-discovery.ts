import { printerLogger } from '../logger';
import { getBleManager } from '../transport/ble-native-adapter';
import { BLE_PRINT_SERVICE_UUIDS } from '../transport/ble-profiles';
import { BLE_PREFIX } from '../transport/device-key';

import type { DiscoveredPrinter } from '../types';

// A shop floor answers a BLE scan in a second or two; six seconds is long enough for a printer
// that has just been switched on and short enough to sit inside the setup flow's scan step.
export const BLE_SCAN_TIMEOUT_MS = 6_000;
// Half the budget goes to the service-filtered scan, half to the name-matched fallback.
const FILTERED_SCAN_SHARE = 0.5;
/**
 * Names receipt printers advertise. Copied from the Electron Bluetooth chooser rather than
 * imported: packages/core depends on this package, never the other way round.
 */
const PRINTER_NAME_PATTERN =
	/print|receipt|\bpos\b|\btm-|\bmtp|\bpt-|epson|star|bixolon|netum|xprinter|goojprt|munbyn|rongta|zjiang|gprinter|sunmi|iposprinter|thermal/i;

interface ScannedDevice {
	id: string;
	name: string;
}

function toRow({ id, name }: ScannedDevice): DiscoveredPrinter {
	return {
		id: `ble-${id}`,
		name: name || 'Bluetooth printer',
		address: `${BLE_PREFIX}${id}`,
		connectionType: 'bluetooth',
		vendor: 'generic',
	};
}

async function scanOnce(
	serviceUuids: string[] | null,
	timeoutMs: number,
	accept: (device: ScannedDevice) => boolean,
	rows: Map<string, DiscoveredPrinter>
): Promise<void> {
	const manager = await getBleManager();
	printerLogger.debug('BLE scan started', {
		context: { filtered: serviceUuids !== null, timeoutMs },
	});
	await new Promise<void>((resolve) => {
		const finish = (cause?: unknown) => {
			clearTimeout(timer);
			if (cause) {
				printerLogger.warn('BLE scan failed', {
					context: { cause: cause instanceof Error ? cause.message : String(cause) },
				});
			}
			manager.stopDeviceScan().catch(() => {
				// The scan is over either way; a stop on a dead adapter is not worth reporting.
			});
			resolve();
		};
		const timer = setTimeout(() => finish(), timeoutMs);
		manager
			.startDeviceScan(serviceUuids, null, (error, device) => {
				if (error) return finish(error);
				if (!device || rows.has(device.id)) return;
				const scanned = { id: device.id, name: device.name ?? device.localName ?? '' };
				if (!accept(scanned)) return;
				rows.set(device.id, toRow(scanned));
				printerLogger.info('BLE printer found', {
					context: { device: scanned.name || scanned.id, filtered: serviceUuids !== null },
				});
			})
			.catch((error: unknown) => finish(error));
	});
	printerLogger.debug('BLE scan stopped', { context: { found: rows.size } });
}

/**
 * Generic BLE receipt printers on iOS/Android, over react-native-ble-plx. The scan filters on the
 * GATT print services first; printers that advertise only a name (most clones do) are picked up by
 * the unfiltered second pass. Loaded through a dynamic import, like the vendor SDK discoveries.
 */
export async function discover({
	timeoutMs = BLE_SCAN_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<DiscoveredPrinter[]> {
	const rows = new Map<string, DiscoveredPrinter>();
	const filteredMs = Math.round(timeoutMs * FILTERED_SCAN_SHARE);
	await scanOnce(BLE_PRINT_SERVICE_UUIDS, filteredMs, () => true, rows);
	if (rows.size === 0) {
		await scanOnce(
			null,
			timeoutMs - filteredMs,
			({ name }) => PRINTER_NAME_PATTERN.test(name),
			rows
		);
	}
	return [...rows.values()];
}
