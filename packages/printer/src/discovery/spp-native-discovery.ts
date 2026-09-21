import { printerLogger } from '../logger';
import { SPP_PREFIX } from '../transport/device-key';
import { loadSppModule } from '../transport/spp-native-adapter';

import type { DiscoveredPrinter } from '../types';

/**
 * Names receipt printers pair under. Kept in step with the BLE scan's list rather than shared:
 * a bonded phone or headset must never turn into a printer card.
 */
const PRINTER_NAME_PATTERN =
	/print|receipt|\bpos\b|\btm-|\bmtp|\bpt-|epson|star|bixolon|netum|xprinter|goojprt|munbyn|rongta|zjiang|gprinter|sunmi|iposprinter|thermal/i;

export function isSppPrinterCandidate(device: { name: string; printerClass: boolean }): boolean {
	return device.printerClass || PRINTER_NAME_PATTERN.test(device.name);
}

/**
 * Bluetooth Classic printers already paired with this Android phone. There is no scan: SPP
 * devices are only reachable once Android has bonded them, so the list is the phone's own
 * paired list filtered to printers. A dual-mode printer also seen by the LE scan is dropped by
 * the caller in favour of the LE row (same MAC), so one printer stays one card.
 */
export async function discover(): Promise<DiscoveredPrinter[]> {
	const { module, android } = await loadSppModule();
	if (!module) {
		if (android) throw new Error('BluetoothSpp is not registered in the native binary');
		return [];
	}
	const bonded = module.bondedDevices();
	const rows = bonded.filter(isSppPrinterCandidate).map<DiscoveredPrinter>((device) => ({
		id: `spp-${device.address}`,
		name: device.name || 'Bluetooth printer',
		address: `${SPP_PREFIX}${device.address}`,
		connectionType: 'bluetooth',
		vendor: 'generic',
	}));
	printerLogger.info('Bluetooth SPP paired printers listed', {
		context: { bonded: bonded.length, printers: rows.map((row) => row.name) },
	});
	return rows;
}

/** Hides an SPP row whose MAC the LE scan already found: the LE lane needs no pairing. */
export function hideSppTwins(rows: DiscoveredPrinter[]): DiscoveredPrinter[] {
	const leMacs = new Set(
		rows
			.filter((row) => row.address.startsWith('ble:'))
			.map((row) => row.address.slice('ble:'.length).toUpperCase())
	);
	return rows.filter((row) => {
		if (!row.address.startsWith(SPP_PREFIX)) return true;
		const twin = leMacs.has(row.address.slice(SPP_PREFIX.length).toUpperCase());
		if (twin) {
			printerLogger.debug('Bluetooth SPP twin hidden behind its LE row', {
				context: { device: row.name },
			});
		}
		return !twin;
	});
}
