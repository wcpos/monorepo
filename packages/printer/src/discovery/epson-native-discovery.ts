import { printerLogger } from '../logger';

import type { DiscoveredPrinter } from '../types';

interface EpsonDiscoveryDevice {
	target: string;
	deviceName: string;
	ipAddress?: string;
	macAddress?: string;
	bdAddress?: string;
}

export function mapEpsonDiscoveryDevice(
	device: EpsonDiscoveryDevice
): DiscoveredPrinter | undefined {
	const normalizedTarget = device.target.trim();
	const upperTarget = normalizedTarget.toUpperCase();
	const deviceId = normalizedTarget.match(/\[([^\]]+)\]\s*$/)?.[1];
	if (deviceId && deviceId.toLowerCase() !== 'local_printer') return undefined;

	if (upperTarget.startsWith('TCPS:')) {
		return {
			id: `epson-tcps:${normalizedTarget.toLowerCase()}`,
			name: device.deviceName || `Epson (${normalizedTarget})`,
			connectionType: 'network',
			address: normalizedTarget,
			port: undefined,
			vendor: 'epson',
		};
	}

	if (upperTarget.startsWith('TCP:')) {
		const address = device.ipAddress || normalizedTarget.replace(/^TCP:/i, '').trim();

		return {
			id: `epson-${address}:9100`,
			name: device.deviceName || `Epson (${address})`,
			connectionType: 'network',
			address,
			port: 9100,
			vendor: 'epson',
		};
	}

	if (upperTarget.startsWith('USB:')) {
		return {
			id: `epson-${normalizedTarget.toLowerCase()}`,
			name: device.deviceName || 'Epson USB Printer',
			connectionType: 'usb',
			address: normalizedTarget,
			port: undefined,
			vendor: 'epson',
		};
	}

	if (!upperTarget.startsWith('BT:') && !upperTarget.startsWith('BLE:')) return undefined;

	const bluetoothId = device.bdAddress
		? `epson-bt:${device.bdAddress.toLowerCase()}`
		: `epson-${normalizedTarget.toLowerCase()}`;

	return {
		id: bluetoothId,
		name: device.deviceName || `Epson (${device.bdAddress || normalizedTarget})`,
		connectionType: 'bluetooth',
		address: normalizedTarget,
		port: undefined,
		vendor: 'epson',
	};
}

/**
 * Discover Epson printers using the react-native-esc-pos-printer SDK.
 *
 * This module is loaded via dynamic import, so it only runs if the
 * peer dependency is installed. The import will throw if the package
 * is not available, and the caller catches that.
 */
/**
 * One printer = one row: an Epson `TCPS:` target is the same device as its `TCP:` row (matched by
 * the SDK's ipAddress/macAddress), so it becomes that row's `secureTarget` instead of a second row.
 * A `TCPS:` target with no `TCP:` sibling stays as the printer's network row.
 */
export function foldSecureTargets(
	found: { printer: DiscoveredPrinter; device: EpsonDiscoveryDevice }[]
): DiscoveredPrinter[] {
	const rows = found.map(({ printer }) => ({ ...printer }));
	const dropped = new Set<number>();
	found.forEach(({ printer, device }, index) => {
		if (!/^TCPS:/i.test(printer.address)) return;
		const siblingIndex = found.findIndex(
			({ printer: other, device: otherDevice }, otherIndex) =>
				otherIndex !== index &&
				other.connectionType === 'network' &&
				/^TCP:/i.test(otherDevice.target) &&
				((device.ipAddress && device.ipAddress === otherDevice.ipAddress) ||
					(device.macAddress && device.macAddress === otherDevice.macAddress))
		);
		if (siblingIndex === -1) return;
		rows[siblingIndex].secureTarget = printer.address;
		dropped.add(index);
	});
	return rows.filter((_row, index) => !dropped.has(index));
}

export async function discover(): Promise<DiscoveredPrinter[]> {
	const { PrintersDiscovery } = await import('react-native-esc-pos-printer');

	const found: { printer: DiscoveredPrinter; device: EpsonDiscoveryDevice }[] = [];

	return new Promise((resolve) => {
		const unsubscribe = PrintersDiscovery.onDiscovery((printers: EpsonDiscoveryDevice[]) => {
			for (const device of printers) {
				const printer = mapEpsonDiscoveryDevice(device);
				if (printer && !found.some((entry) => entry.printer.id === printer.id)) {
					found.push({ printer, device });
				}
			}
		});

		PrintersDiscovery.start({ timeout: 10_000, autoStop: true }).catch((error) => {
			printerLogger.warn('Epson discovery failed to start', {
				context: { cause: error instanceof Error ? error.message : String(error) },
			});
		});

		// Give discovery 10 seconds then return results
		setTimeout(() => {
			unsubscribe();
			PrintersDiscovery.stop().catch(() => {});
			resolve(foldSecureTargets(found));
		}, 10_000);
	});
}
